/** Device haptics. Silently no-ops where unsupported. */
export function vibrate(ms: number): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* ignored */
  }
}
