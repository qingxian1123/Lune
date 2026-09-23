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
  const pendingHeartbeat = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    const isCurrent = () => mountedRef.current && wsRef.current === ws;
    const reconnect = () => {
      if (!isCurrent()) return;
      // 先退役旧连接；close 事件可能迟到甚至不再到达。
      wsRef.current = null;
      pendingHeartbeat.current = null;
      setReadyState(WebSocket.CLOSED);
      window.clearInterval(heartbeatTimer.current);
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(() => {
        if (mountedRef.current) connect();
      }, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 8000);
      ws.close();
    };

    ws.onopen = () => {
      if (!isCurrent()) return;
      setReadyState(WebSocket.OPEN);
      reconnectDelay.current = 1000;
      pendingHeartbeat.current = null;
      rttRef.current = 0;
      heartbeatTimer.current = window.setInterval(() => {
        if (!isCurrent()) return;
        if (pendingHeartbeat.current !== null) {
          if (performance.now() - pendingHeartbeat.current >= 15_000) {
            console.warn('房间连接心跳超时，重新连接');
            reconnect();
          }
          return;
        }
        if (ws.readyState === WebSocket.OPEN) {
          pingSentTime.current = Date.now();
          pendingHeartbeat.current = performance.now();
          try {
            ws.send(JSON.stringify({ type: 'heartbeat', payload: { clientTime: pingSentTime.current } }));
          } catch {
            reconnect();
          }
        }
      }, 5000);
    };

    ws.onmessage = (e) => {
      if (!isCurrent()) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data) as ServerMessage;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'heartbeat_ack') {
        if (pendingHeartbeat.current !== null && msg.payload?.clientTime === pingSentTime.current) {
          rttRef.current = Math.max(0, performance.now() - pendingHeartbeat.current);
          pendingHeartbeat.current = null;
        }
        return;
      }
      // 单个订阅者失败不能阻断其他订阅者，也不能被当成 JSON 错误静默吞掉。
      listenersRef.current.forEach((fn) => {
        try { fn(msg); }
        catch (error) { console.error('房间消息处理失败', msg.type, error); }
      });
    };

    ws.onclose = reconnect;
    ws.onerror = reconnect;
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      window.clearInterval(heartbeatTimer.current);
      window.clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      pendingHeartbeat.current = null;
      ws?.close();
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
