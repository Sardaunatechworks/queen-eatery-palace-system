import { useEffect, useRef } from "react";

/**
 * Custom hook that runs a polling callback at specified intervals,
 * automatically pausing polling when the browser tab is hidden/inactive.
 * When the tab becomes visible again, it immediately triggers a fresh fetch.
 *
 * @param callback Function to execute on each interval trigger
 * @param intervalMs Polling interval in milliseconds
 * @param enabled Whether polling is active (defaults to true)
 */
export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true
): void {
  const savedCallback = useRef(callback);

  // Keep latest callback reference without resetting interval timer
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timerId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (!timerId) {
        timerId = setInterval(() => {
          if (!document.hidden) {
            savedCallback.current();
          }
        }, intervalMs);
      }
    };

    const stopPolling = () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Tab restored to focus: immediately fetch fresh data, then resume interval
        savedCallback.current();
        startPolling();
      }
    };

    // Initial start if visible
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
