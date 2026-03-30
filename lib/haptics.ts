/**
 * Wrapper around navigator.vibrate — silently no-ops on unsupported devices.
 */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore — some browsers throw in certain contexts
    }
  }
}
