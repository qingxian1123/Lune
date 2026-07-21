import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClientMessage, ServerMessage } from '../types';

interface UseWebSocketReturn {
  send: (msg: ClientMessage) => void;
  lastMessage: ServerMessage | null;
  readyState: number;
  getRtt: () => number;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const rttRef = useRef(0);
  const heartbeatTimers = useRef<{ ping: number; timeout: number }>({ ping: 0, timeout: 0 });
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef(0);
  const pingSentTime = useRef(0);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setReadyState(WebSocket.OPEN);
      reconnectDelay.current = 1000;

      // 心跳：每 5s 发一次 ping
      heartbeatTimers.current.ping = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          pingSentTime.current = Date.now();
          ws.send(JSON.stringify({ type: 'heartbeat', payload: { clientTime: Date.now() } }));
        }
      }, 5000);
    };

    ws.onmessage = (e) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(e.data) as ServerMessage;

        // 处理心跳回包，计算 RTT
        if (msg.type === 'heartbeat_ack') {
          rttRef.current = Date.now() - pingSentTime.current;
          return; // 心跳回包不触发 lastMessage 更新
        }

        setLastMessage(msg);
      } catch {
        // 忽略解析失败
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setReadyState(WebSocket.CLOSED);
      clearInterval(heartbeatTimers.current.ping);

      // 指数退避重连
      const delay = reconnectDelay.current;
      reconnectDelay.current = Math.min(delay * 2, 30000);
      reconnectTimer.current = window.setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearInterval(heartbeatTimers.current.ping);
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const getRtt = useCallback(() => rttRef.current, []);
  return { send, lastMessage, readyState, getRtt };
}
