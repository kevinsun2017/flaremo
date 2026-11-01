/**
 * `HH:MM:SS` for a whole number of seconds, zero-padded. Hours are not capped
 * at 24: a capture longer than a day keeps counting.
 */
export function formatDuration(totalSeconds: number) {
  return [
    Math.floor(totalSeconds / 3600),
    Math.floor((totalSeconds % 3600) / 60),
    Math.floor(totalSeconds % 60),
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
