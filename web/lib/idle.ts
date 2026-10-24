/**
 * Runs `callback` once the browser is idle, at the latest after `timeout` ms,
 * or after `fallback` ms where there is no requestIdleCallback (Safari).
 * Returns what cancels it.
 */
export function whenIdle(
  callback: () => void,
  timeout: number,
  fallback: number,
): () => void {
  if (window.requestIdleCallback) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, fallback);
  return () => window.clearTimeout(id);
}
