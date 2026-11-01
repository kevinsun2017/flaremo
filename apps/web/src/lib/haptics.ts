/**
 * Light haptic feedback via the Vibration API (Android browsers and installed
 * PWAs; iOS Safari does not implement navigator.vibrate, which is a known
 * platform limitation — the call is a silent no-op there, never an error).
 */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
