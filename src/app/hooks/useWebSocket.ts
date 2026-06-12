import { useEffect, useRef, useCallback } from 'react';

type WSHandler = (data: unknown) => void;

/**
 * Connects to the server WebSocket and dispatches events by `type`.
 * Automatically reconnects every 3 seconds if the connection drops.
 *
 * Usage:
 *   useWebSocket({
 *     STOCK_UPDATED: (data) => setProducts(data as Product[]),
 *     BILL_CREATED:  (data) => refreshBills(),
 *   });
 */
export function useWebSocket(handlers: Record<string, WSHandler>) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers; // always use latest handlers without re-connecting

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => console.log('[WS] Connected to POS server');

    ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        if (handlersRef.current[type]) {
          handlersRef.current[type](data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected — reconnecting in 3s…');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  const send = useCallback((type: string, data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { send };
}

