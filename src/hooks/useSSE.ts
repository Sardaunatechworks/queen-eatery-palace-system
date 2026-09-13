import { useEffect, useRef } from "react";

export interface UseSSEOptions {
  endpoint: string;
  eventName: string;
  onMessage: (data: any) => void;
  fallbackPoll?: () => void | Promise<void>;
  fallbackIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Reusable hook for managing real-time data streaming and polling with:
 * 1. Automatic reconnection and fallback polling compliant with Section 13 & 14.
 * 2. Strict Page Visibility API awareness: disconnects and suspends when document.hidden === true.
 * 3. Prevention of duplicate intervals or worker resource leaks.
 */
export function useSSE({
  endpoint,
  eventName,
  onMessage,
  fallbackPoll,
  fallbackIntervalMs = 10000,
  enabled = true
}: UseSSEOptions): void {
  const savedOnMessage = useRef(onMessage);
  const savedFallbackPoll = useRef(fallbackPoll);

  useEffect(() => {
    savedOnMessage.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    savedFallbackPoll.current = fallbackPoll;
  }, [fallbackPoll]);

  useEffect(() => {
    if (!enabled || !endpoint) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const API_BASE = import.meta.env.VITE_API_URL || "https://api.queenspalaceeatery.com";

    const startPollingFallback = () => {
      if (pollInterval || !savedFallbackPoll.current || !isMounted) return;
      savedFallbackPoll.current();
      pollInterval = setInterval(() => {
        if (!document.hidden && savedFallbackPoll.current && isMounted) {
          savedFallbackPoll.current();
        }
      }, fallbackIntervalMs);
    };

    const stopPollingFallback = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const disconnect = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      stopPollingFallback();
    };

    const connectSSE = () => {
      if (document.hidden || !isMounted) return;

      const normalizedEndpoint = endpoint.startsWith("/v2/")
        ? endpoint
        : (endpoint.startsWith("/") ? `/v2${endpoint}` : `/v2/${endpoint}`);
      const sseUrl = `${API_BASE}/api${normalizedEndpoint}`;

      try {
        if (eventSource) {
          eventSource.close();
        }

        eventSource = new EventSource(sseUrl, { withCredentials: true });

        eventSource.addEventListener(eventName, (e: MessageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(e.data);
            stopPollingFallback();
            savedOnMessage.current(data);
          } catch (err) {
            console.error(`[useSSE] Error parsing event '${eventName}':`, err);
          }
        });

        eventSource.onerror = () => {
          if (!isMounted) return;
          // When SSE disconnects or if server closes response, close instance and schedule clean reconnect
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }

          if (savedFallbackPoll.current) {
            startPollingFallback();
          }

          if (!reconnectTimeout && !document.hidden && isMounted) {
            reconnectTimeout = setTimeout(() => {
              reconnectTimeout = null;
              if (!document.hidden && isMounted) {
                connectSSE();
              }
            }, fallbackIntervalMs);
          }
        };
      } catch (e) {
        console.warn("[useSSE] Falling back to polling:", e);
        startPollingFallback();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        disconnect();
      } else {
        connectSSE();
      }
    };

    connectSSE();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [endpoint, eventName, fallbackIntervalMs, enabled]);
}
