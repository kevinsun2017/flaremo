#!/usr/bin/env node

/**
 * Hot-reloading local development: Vite's dev server (port 5173) in front of
 * `wrangler dev` (port 8787).
 *
 * `pnpm dev` builds the web app and lets the Worker serve that build, so every
 * frontend edit costs a full rebuild. This launcher instead keeps Vite's module
 * graph (and therefore HMR) for the frontend and proxies the Worker-owned paths
 * to a running `wrangler dev`: the API, the SSR share/article pages, R2
 * attachments, the feeds and `/mcp`. Editing either side reloads on its own —
 * Vite pushes an HMR update, and wrangler rebundles the Worker.
 *
 * The browser only ever talks to the Vite origin, so Better Auth's cookie and
 * origin checks see the URL that is actually in the address bar. The two dev
 * origins are injected through `--var` rather than written into `.dev.vars`,
 * which stays the operator's file.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseDotenv } from "dotenv";
import { waitForHttpReady } from "./lib/dev-server.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
process.chdir(repoRoot);

// Deliberately not Vite's default 5173: that port is what every other Vite
// project on this machine reaches for, and this dev loop has to coexist with
// them. `strictPort` makes a collision fail loudly rather than drift.
const WEB_PORT = Number(process.env.FLAREMO_DEV_WEB_PORT ?? 5573);
const WORKER_PORT = Number(process.env.FLAREMO_DEV_WORKER_PORT ?? 8787);
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

const READY_TIMEOUT_MS = 180_000;
const FORCE_KILL_DELAY_MS = 5_000;

/** Both spellings of every dev origin: `localhost` and `127.0.0.1` reach the
 * same servers but are distinct origins to the Worker's checks. */
function devOrigins(port) {
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

async function main() {
  if (!existsSync(resolve(".dev.vars"))) {
    throw new Error(
      "缺少 .dev.vars（本地 secrets 不进 git）。复制 .dev.vars.example 并填入本机值后再启动。",
    );
  }

  await ensureWebBuild();

  const children = [];
  const shutdown = createShutdown(children);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => shutdown(0));
  }

  const worker = spawnTagged(
    "worker",
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "--config",
      "./wrangler.jsonc",
      "--local",
      "--host",
      "127.0.0.1",
      "--port",
      String(WORKER_PORT),
      "--var",
      `FLAREMO_PUBLIC_URL:${WEB_ORIGIN}`,
      "--var",
      `FLAREMO_TRUSTED_ORIGINS:${await mergedTrustedOrigins()}`,
    ],
    (code) => shutdown(code ?? 0),
  );
  children.push(worker);

  await waitForHttpReady(`http://127.0.0.1:${WORKER_PORT}/`, {
    timeoutMs: READY_TIMEOUT_MS,
  });

  const web = spawnTagged(
    "web",
    "pnpm",
    ["--filter", "@flaremo/web", "dev"],
    (code) => shutdown(code ?? 0),
  );
  children.push(web);

  await waitForHttpReady(`${WEB_ORIGIN}/`, { timeoutMs: READY_TIMEOUT_MS });

  console.log(
    [
      "",
      "  热重载已就绪：",
      `    应用   ${WEB_ORIGIN}    ← 浏览器开这个（Vite HMR，改前端即时生效）`,
      `    Worker http://localhost:${WORKER_PORT}    ← API / SSR 分享页 / R2，改 worker 代码自动重载`,
      "",
      "  Ctrl-C 退出。退出后要单跑 `pnpm dev`（Worker 直接托管构建产物）也没问题。",
      "",
    ].join("\n"),
  );
}

/**
 * `wrangler dev` refuses to start when `assets.directory` is missing, so the
 * very first run in a fresh clone needs one build. Only Vite runs here: a dev
 * start must not be gated by `tsc`.
 */
async function ensureWebBuild() {
  if (existsSync(resolve("apps/web/dist/index.html"))) return;

  console.log(
    "[dev] apps/web/dist 不存在，先构建一次前端产物（wrangler 需要 assets 目录）…",
  );
  const result = spawnSync(
    "pnpm",
    ["--filter", "@flaremo/web", "exec", "vite", "build"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("前端产物构建失败，无法启动 wrangler dev。");
  }
}

/**
 * The operator's `.dev.vars` may already trust extra origins (a phone on the
 * LAN, another tool). `--var` replaces the bound value outright, so merge
 * instead of overwriting.
 */
async function mergedTrustedOrigins() {
  const vars = parseDotenv(await readFile(resolve(".dev.vars"), "utf8"));
  const configured = (vars.FLAREMO_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origins = new Set([
    ...configured,
    ...devOrigins(WEB_PORT),
    ...devOrigins(WORKER_PORT),
  ]);
  return [...origins].join(",");
}

/**
 * Spawn a long-running dev process in its own process group (so the whole
 * pnpm → wrangler → workerd tree dies with it) and prefix its output, because
 * two interleaved logs are what makes a two-process dev loop unreadable.
 */
function spawnTagged(tag, command, args, onExit) {
  const child = spawn(command, args, {
    detached: process.platform !== "win32",
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const label = tag.padEnd(6);
  for (const [stream, target] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    let buffered = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        target.write(`${label} │ ${line}\n`);
      }
    });
    stream.on("end", () => {
      if (buffered) target.write(`${label} │ ${buffered}\n`);
    });
  }

  child.on("exit", (code) => onExit(code));
  child.on("error", (error) => {
    console.error(`${label} │ 启动失败：${error.message}`);
    onExit(1);
  });

  return child;
}

function createShutdown(children) {
  let shuttingDown = false;
  return (code) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      signalProcessGroup(child, "SIGTERM");
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          signalProcessGroup(child, "SIGKILL");
        }
      }, FORCE_KILL_DELAY_MS);
      timer.unref();
    }
    process.exit(code);
  };
}

function signalProcessGroup(child, signal) {
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
