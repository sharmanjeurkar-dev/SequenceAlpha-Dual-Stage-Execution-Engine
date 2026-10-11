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

  useEffect(() => {
    let timeoutId: any;

    const connect = () => {
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          console.log('[SequenceAlpha WS] Connected to live engine stream');
        };

        ws.onmessage = (event) => {
          try {
            const data = jsonParseSafe(event.data);
            setLastMessage(data);
            if (onStateUpdate && data) {
              onStateUpdate(data);
            }
          } catch (e) {
            console.error('[SequenceAlpha WS] Parse error', e);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          // Try reconnect in 3s
          timeoutId = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setIsConnected(false);
          ws.close();
        };
      } catch (err) {
        setIsConnected(false);
        timeoutId = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      clearTimeout(timeoutId);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url, onStateUpdate]);

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
