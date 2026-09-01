import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@lune/shared';

type Listener = (msg: ServerMessage) => void;

interface UseWebSocketReturn {
  send: (msg: ClientMessage) => void;
  /** 订阅服务端消息,返回取消订阅函数。每条消息实时回调,不丢消息 */
  subscribe: (fn: Listener) => () => void;
  readyState: number;
  getRtt: () => number;
}

/**
 * WebSocket 连接 + 自动重连 + 5s 心跳 RTT 测量。
 *
 * 消息传递使用订阅器而非 `useState<lastMessage>`，保证心跳之外的每条协议消息
 * 都按 WebSocket 到达顺序处理。播放与队列现在由单条原子房间状态事件承载。
 */
export function useWebSocket(url: string): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<Listener>>(new Set());
  const [readyState, setReadyState] = useState<number>(WebSocket.CONNECTING);
  const rttRef = useRef(0);
  const heartbeatTimer = useRef<number>(0);
  const reconnectDelay = useRef(1000);
  const reconnectTimer = useRef<number>(0);
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
      heartbeatTimer.current = window.setInterval(() => {
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
        if (msg.type === 'heartbeat_ack') {
          rttRef.current = Date.now() - pingSentTime.current;
          return;
        }
        // 实时分发,不经过 React state,避免批处理丢消息
        listenersRef.current.forEach((fn) => fn(msg));
      } catch {
        // 忽略解析失败
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setReadyState(WebSocket.CLOSED);
      window.clearInterval(heartbeatTimer.current);
      reconnectTimer.current = window.setTimeout(() => {
        if (mountedRef.current) connect();
      }, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 8000);
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
      window.clearInterval(heartbeatTimer.current);
      window.clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const getRtt = useCallback(() => rttRef.current, []);

  return { send, subscribe, readyState, getRtt };
}
