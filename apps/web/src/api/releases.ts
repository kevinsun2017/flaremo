import type { LatestRelease } from "./types";

// Repository used when the server does not advertise one via
// /api/app/health (`update_repository`).
const DEFAULT_RELEASE_REPOSITORY = "realchendahuang/FlareMo";

export async function getLatestRelease(
  repository: string | null | undefined = DEFAULT_RELEASE_REPOSITORY,
): Promise<LatestRelease> {
  const repo = repository || DEFAULT_RELEASE_REPOSITORY;
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      credentials: "omit",
      headers: {
        accept: "application/vnd.github+json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub release check failed (${response.status})`);
  }
  const release = (await response.json()) as {
    tag_name?: unknown;
    name?: unknown;
    published_at?: unknown;
  };
  const version =
    typeof release.tag_name === "string"
      ? release.tag_name.replace(/^v/, "")
      : "";
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("GitHub returned an invalid FlareMo release version");
  }
  return {
    version,
    name:
      typeof release.name === "string" && release.name
        ? release.name
        : `v${version}`,
    published_at:
      typeof release.published_at === "string" ? release.published_at : null,
    url: `https://github.com/${repo}/releases/tag/v${encodeURIComponent(version)}`,
  };
}
