import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  assertDerivedIndexesComplete,
  DERIVED_INDEX_TABLES,
  POST_RESTORE_DERIVED_SQL,
  RESTORE_TABLES,
} from "./persistence-manifest.mjs";

const targetDatabase = requiredEnv("FLAREMO_RESTORE_DATABASE");
const targetDatabaseId = requiredEnv("FLAREMO_RESTORE_DATABASE_ID");
const targetBucket = requiredEnv("FLAREMO_RESTORE_BUCKET");
const sourceDatabase = process.env.FLAREMO_SOURCE_DATABASE || "DB";
const sourceBucket = process.env.FLAREMO_SOURCE_BUCKET || "flaremo-attachments";
const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outputDir = resolve("backups", `remote-restore-${stamp}`);
const orderedDump = join(outputDir, "d1-data-ordered.sql");
const generatedConfig = join(outputDir, "wrangler.restore-drill.jsonc");
const reportPath = join(outputDir, "report.md");
const objectDir = join(outputDir, "r2");
const steps = [];

mkdirSync(objectDir, { recursive: true });
const sourceConfig = readFileSync(resolve("wrangler.jsonc"), "utf8");
const productionDatabaseId = findD1DatabaseId(sourceConfig);
const restoreConfig = replaceEachExactlyOnce(sourceConfig, [
  {
    label: `production D1 database id "${productionDatabaseId}"`,
    needle: productionDatabaseId,
    replacement: targetDatabaseId,
  },
  {
    label: '"database_name": "flaremo"',
    needle: '"database_name": "flaremo"',
    replacement: `"database_name": "${targetDatabase}"`,
  },
  {
    label: `"bucket_name": "${sourceBucket}"`,
    needle: `"bucket_name": "${sourceBucket}"`,
    replacement: `"bucket_name": "${targetBucket}"`,
  },
  {
    label: '"./apps/worker/src/index.ts"',
    needle: '"./apps/worker/src/index.ts"',
    replacement: `"${resolve("apps/worker/src/index.ts")}"`,
  },
  {
    label: '"./apps/web/dist"',
    needle: '"./apps/web/dist"',
    replacement: `"${resolve("apps/web/dist")}"`,
  },
  {
    label: '"./migrations"',
    needle: '"./migrations"',
    replacement: `"${resolve("migrations")}"`,
  },
]);
writeFileSync(generatedConfig, restoreConfig);

step("verify source and target resources", () => {
  const databases = runWrangler(["d1", "list"], { capture: true }).stdout;
  const buckets = runWrangler(["r2", "bucket", "list"], {
    capture: true,
  }).stdout;
  for (const resource of [sourceBucket, targetBucket]) {
    if (!buckets.includes(resource))
      throw new Error(`Missing R2 bucket ${resource}`);
  }
  if (!databases.includes(targetDatabase)) {
    throw new Error(`Missing D1 database ${targetDatabase}`);
  }
});

step("apply migrations to target D1", () =>
  withRetry(() =>
    runWrangler([
      "d1",
      "migrations",
      "apply",
      "DB",
      "--remote",
      "--config",
      generatedConfig,
    ]),
  ),
);

// The source deployment may be several migrations behind the current schema
// (a stopped self-host keeps its old columns). `d1 export` writes positional
// INSERTs that cannot load into the current schema, so instead each table is
// exported as an explicit-column INSERT containing the columns that exist on
// BOTH sides. Old columns are dropped, new columns fall back to their target
// defaults — exactly what a real old-backup restore has to do.
step("export production D1 data schema-adaptively", () => {
  const lines = ["PRAGMA defer_foreign_keys=TRUE;"];
  for (const table of RESTORE_TABLES) {
    const sourceColumns = tableColumns(sourceDatabase, table, "wrangler.jsonc");
    const targetColumns = tableColumns("DB", table, generatedConfig);
    if (targetColumns.length === 0) {
      throw new Error(`Table ${table} is missing from the target schema`);
    }
    if (sourceColumns.length === 0) {
      // A table the source schema does not have yet (e.g. auth_organizations
      // on a pre-team-model deployment) restores as empty; legacy role data
      // is re-derived below.
      console.log(`exported ${table}: table absent on source, skipped`);
      continue;
    }
    const common = targetColumns.filter((column) =>
      sourceColumns.includes(column),
    );
    if (common.length === 0) {
      throw new Error(`Table ${table} has no common columns between schemas`);
    }
    const rows = query(
      sourceDatabase,
      `SELECT ${common.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)};`,
      "wrangler.jsonc",
    );
    for (const row of rows) {
      const values = common.map((column) => sqlLiteral(row[column])).join(", ");
      lines.push(
        `INSERT INTO ${quoteIdent(table)} (${common
          .map(quoteIdent)
          .join(", ")}) VALUES (${values});`,
      );
    }
    console.log(`exported ${table}: ${rows.length} rows`);
  }
  appendLegacyTeamBackfill(lines);
  lines.push(...POST_RESTORE_DERIVED_SQL);
  writeFileSync(orderedDump, `${lines.join("\n")}\n`);
});

// A pre-team-model backup has no auth_organizations/auth_members rows: the
// current schema dropped users.role, so the exporter re-derives the default
// team and memberships from the legacy column, mirroring migration 0020's
// backfill. Without this the restored deployment has a complete bootstrap
// but zero members and cannot sign anyone in.
function appendLegacyTeamBackfill(lines) {
  const base =
    "SELECT l.auth_user_id AS auth_user_id, u.role AS role FROM auth_user_links l JOIN users u ON u.id = l.flaremo_user_id";
  let memberships;
  try {
    memberships = query(
      sourceDatabase,
      `${base} WHERE u.status = 'active';`,
      "wrangler.jsonc",
    );
  } catch {
    // Older schemas predate users.status; treat every linked member as active.
    memberships = query(sourceDatabase, `${base};`, "wrangler.jsonc");
  }
  lines.push(
    "INSERT INTO auth_organizations (id, name, slug, logo, metadata, created_at)",
    "SELECT 'orgs/default-team', 'FlareMo Team', 'flaremo', NULL, NULL, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)",
    "WHERE NOT EXISTS (SELECT 1 FROM auth_organizations WHERE slug = 'flaremo');",
  );
  for (const row of memberships) {
    const role = ["owner", "admin"].includes(String(row.role))
      ? String(row.role)
      : "member";
    const values = [
      sqlLiteral(`members/${randomUUID()}`),
      "'orgs/default-team'",
      sqlLiteral(row.auth_user_id),
      sqlLiteral(role),
      "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)",
    ].join(", ");
    lines.push(
      "INSERT INTO auth_members (id, organization_id, user_id, role, created_at)",
      `VALUES (${values}) ON CONFLICT (organization_id, user_id) DO NOTHING;`,
    );
  }
}

step("restore production D1 data to target", () =>
  withRetry(() =>
    runWrangler([
      "d1",
      "execute",
      "DB",
      "--remote",
      "--file",
      orderedDump,
      "--yes",
      "--config",
      generatedConfig,
    ]),
  ),
);

// Remote file imports intermittently fail with a transient Cloudflare
// "Authentication error (10000)" from the API edge; one spaced retry clears
// it. The failed import leaves the target unchanged (file execute is
// transactional), so a retry is always safe.
function withRetry(fn) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      console.log("transient failure, retrying...");
      spawnSync("sleep", ["10"]);
    }
  }
  throw lastError;
}

const sourceCounts = queryCounts(sourceDatabase, "wrangler.jsonc", {
  tolerateMissing: true,
});
const targetCounts = queryCounts("DB", generatedConfig);
step("compare source and target D1 counts", () => {
  for (const table of [...RESTORE_TABLES, ...DERIVED_INDEX_TABLES]) {
    if (sourceCounts[table] === "absent") {
      // A table the legacy source schema does not have: the restore leaves
      // it empty or re-derives legacy rows (default team + memberships).
      console.log(
        `count ${table}: absent on source, target=${targetCounts[table]}`,
      );
      continue;
    }
    if (sourceCounts[table] !== targetCounts[table]) {
      throw new Error(
        `${table} mismatch: source=${sourceCounts[table]} target=${targetCounts[table]}`,
      );
    }
  }
  assertDerivedIndexesComplete(sourceCounts);
  assertDerivedIndexesComplete(targetCounts);
});

const attachments = query(
  sourceDatabase,
  "SELECT id, r2_key, content_type FROM attachments WHERE deleted_at IS NULL AND state = 'ready' ORDER BY id;",
);
step("restore and verify referenced R2 objects", () => {
  for (const attachment of attachments) {
    const key = String(attachment.r2_key);
    const objectFile = join(objectDir, safeFilename(key));
    const verifyFile = `${objectFile}.verify`;
    runWrangler([
      "r2",
      "object",
      "get",
      `${sourceBucket}/${key}`,
      "--remote",
      "--file",
      objectFile,
    ]);
    runWrangler([
      "r2",
      "object",
      "put",
      `${targetBucket}/${key}`,
      "--remote",
      "--file",
      objectFile,
      "--content-type",
      String(attachment.content_type || "application/octet-stream"),
    ]);
    runWrangler([
      "r2",
      "object",
      "get",
      `${targetBucket}/${key}`,
      "--remote",
      "--file",
      verifyFile,
    ]);
    if (sha256(objectFile) !== sha256(verifyFile)) {
      throw new Error(`R2 checksum mismatch for ${key}`);
    }
  }
});

step("verify restored bindings with deploy dry-run", () => {
  run("pnpm", ["--filter", "@flaremo/web", "build"]);
  runWrangler(["deploy", "--config", generatedConfig, "--dry-run"]);
});

writeFileSync(
  reportPath,
  [
    "# FlareMo Remote Restore Drill",
    "",
    `- Created at: ${new Date().toISOString()}`,
    `- Source D1: ${sourceDatabase}`,
    `- Target D1: ${targetDatabase} (${targetDatabaseId})`,
    `- Source R2: ${sourceBucket}`,
    `- Target R2: ${targetBucket}`,
    `- Referenced R2 objects restored: ${attachments.length}`,
    `- Source counts: ${JSON.stringify(sourceCounts)}`,
    `- Target counts: ${JSON.stringify(targetCounts)}`,
    "",
    "## Steps",
    "",
    ...steps.map((item) => `- ${item}`),
    "",
    "The target resources are intentionally not deleted by the script. Inspect the report, then delete the temporary D1 database and R2 bucket explicitly.",
    "",
  ].join("\n"),
);

console.log(`Remote restore drill report: ${reportPath}`);

// The restore config is built by literal surgery on wrangler.jsonc. Every
// replacement must hit exactly once: a silently skipped needle would leave
// production binding values (or the production database id) in the generated
// config and point the drill at live resources.
function replaceEachExactlyOnce(config, replacements) {
  let result = config;
  for (const { label, needle, replacement } of replacements) {
    const start = result.indexOf(needle);
    const repeated =
      start !== -1 && result.indexOf(needle, start + needle.length) !== -1;
    if (start === -1 || repeated) {
      throw new Error(
        `Expected exactly one occurrence of ${label} in wrangler.jsonc but found ${start === -1 ? "none" : "multiple"}; refusing to generate a restore config that might still point at production resources.`,
      );
    }
    result =
      result.slice(0, start) +
      replacement +
      result.slice(start + needle.length);
  }
  return result;
}

// Anchor on the d1_databases block instead of the first database_id anywhere
// in the file, so other configs sharing the file cannot hijack the match.
function findD1DatabaseId(config) {
  const keyIndex = config.indexOf('"d1_databases"');
  if (keyIndex === -1) {
    throw new Error('Could not locate "d1_databases" in wrangler.jsonc');
  }
  const arrayStart = config.indexOf("[", keyIndex);
  let depth = 0;
  let arrayEnd = -1;
  for (let index = arrayStart; index < config.length; index += 1) {
    if (config[index] === "[") {
      depth += 1;
    } else if (config[index] === "]") {
      depth -= 1;
      if (depth === 0) {
        arrayEnd = index;
        break;
      }
    }
  }
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(
      'Could not locate the "d1_databases" array in wrangler.jsonc',
    );
  }
  const match = config
    .slice(arrayStart, arrayEnd + 1)
    .match(/"database_id"\s*:\s*"([^"]+)"/);
  if (!match) {
    throw new Error(
      'Could not locate a "database_id" inside the "d1_databases" block of wrangler.jsonc',
    );
  }
  return match[1];
}

function queryCounts(database, config, options = {}) {
  const tolerateMissing = options.tolerateMissing ?? false;
  const counts = {};
  for (const table of [...RESTORE_TABLES, ...DERIVED_INDEX_TABLES]) {
    try {
      const rows = query(
        database,
        `SELECT COUNT(*) AS count FROM ${quoteIdent(table)};`,
        config,
      );
      counts[table] = rows[0]?.count ?? 0;
    } catch (error) {
      if (!tolerateMissing) throw error;
      counts[table] = "absent";
    }
  }
  return counts;
}

function tableColumns(database, table, config) {
  return query(database, `PRAGMA table_info(${quoteIdent(table)});`, config)
    .map((row) => String(row.name))
    .sort((a, b) => a.localeCompare(b));
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function query(database, command, config) {
  const configArgs = config ? ["--config", config] : [];
  const args = [
    "d1",
    "execute",
    database,
    "--remote",
    "--command",
    command,
    "--json",
    ...configArgs,
  ];
  // Sequential remote D1 queries occasionally hit a transient Cloudflare
  // "Authentication error (10000)" from the API edge; one retry clears it.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = runWrangler(args, { capture: true });
      const payload = JSON.parse(result.stdout);
      if (!payload[0]?.success) {
        throw new Error(`D1 query failed for ${database}`);
      }
      return payload[0].results ?? [];
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        spawnSync("sleep", ["2"]);
      }
    }
  }
  throw lastError;
}

function step(name, fn) {
  try {
    fn();
    steps.push(`${name}: ok`);
  } catch (error) {
    steps.push(`${name}: failed`);
    writeFileSync(
      reportPath,
      `# FlareMo Remote Restore Drill\n\nFailed step: ${name}\n\n${String(error)}\n`,
    );
    throw error;
  }
}

function runWrangler(args, options) {
  // The deploy-button wrangler.json is tracked at the repo root and wins
  // wrangler's implicit config resolution over wrangler.jsonc (placeholder
  // UUIDs inside), so every command must pin the real config explicitly.
  const explicitConfig = args.includes("--config")
    ? []
    : ["--config", "wrangler.jsonc"];
  return run("pnpm", ["exec", "wrangler", ...args, ...explicitConfig], options);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    }
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  }
  return result;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeFilename(key) {
  return `${basename(key).replaceAll(/[^A-Za-z0-9_.-]/g, "_")}-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

function sha256(path) {
  if (!existsSync(path)) throw new Error(`Missing object file ${path}`);
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
