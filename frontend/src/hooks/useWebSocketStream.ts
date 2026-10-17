import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketHookProps {
  url?: string;
  onStateUpdate?: (data: any) => void;
}

export function useWebSocketStream({
  url = 'ws://localhost:8765/ws',
  onStateUpdate,
}: WebSocketHookProps = {}) {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef<WebSocketHookProps['onStateUpdate']>(onStateUpdate);

  useEffect(() => {
    callbackRef.current = onStateUpdate;
  }, [onStateUpdate]);

  useEffect(() => {
    let timeoutId: any;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!unmounted) {
            setIsConnected(true);
            console.log('[SequenceAlpha WS] Connected to live engine stream');
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = jsonParseSafe(event.data);
            if (!unmounted && data) {
              setLastMessage(data);
              if (callbackRef.current) {
                callbackRef.current(data);
              }
            }
          } catch (e) {
            console.error('[SequenceAlpha WS] Parse error', e);
          }
        };

        ws.onclose = () => {
          if (!unmounted) {
            setIsConnected(false);
            timeoutId = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          if (!unmounted) {
            setIsConnected(false);
          }
          ws.close();
        };
      } catch (err) {
        if (!unmounted) {
          setIsConnected(false);
          timeoutId = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      unmounted = true;
      clearTimeout(timeoutId);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  const sendCommand = useCallback((command: string, payload: any = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ command, ...payload }));
      return true;
    }
    return false;
  }, []);

  return { isConnected, lastMessage, sendCommand };
}

function jsonParseSafe(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
