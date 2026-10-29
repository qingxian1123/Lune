import type { ClientMessage, ServerMessage } from '@lune/shared';
import { recordPlaybackEvent } from './playbackDiagnostics';

export type ConnectionPhase = 'connecting' | 'joining' | 'joined' | 'reconnecting' | 'terminal' | 'closed';
export interface ConnectionState { phase: ConnectionPhase; code: string | null }
const terminalCodes = new Set(['AUTH_INVALID', 'MEMBER_INVALID', 'ROOM_NOT_FOUND']);

/** No message replay: reconnect obtains a new authoritative joined snapshot. */
export class RoomConnection {
  state: ConnectionState = { phase: 'closed', code: null };
  private socket: WebSocket | null = null;
  private running = false;
  private leaving = false;
  private delay = 1000;
  private rtt = 0;
  private joinedAt = 0;
  private lastEvidence = 0;
  private lastKick = -Infinity;
  private ping: { sent: number; clientTime: number } | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private joinTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private messages = new Set<(message: ServerMessage) => void>();
  private statuses = new Set<(state: ConnectionState) => void>();

  constructor(private url: string, private createSocket = (url: string) => new WebSocket(url),
    private now = () => performance.now(), private random = Math.random) {}

  start(): void { if (this.running) return; this.running = true; this.leaving = false; this.connect(); }
  stop(): void { this.running = false; this.retire(); clearTimeout(this.retryTimer); this.publish('closed'); }
  subscribe(listener: (message: ServerMessage) => void): () => void {
    this.messages.add(listener); return () => { this.messages.delete(listener); };
  }
  subscribeStatus(listener: (state: ConnectionState) => void): () => void {
    this.statuses.add(listener); listener(this.state); return () => { this.statuses.delete(listener); };
  }
  getRtt(): number { return this.rtt; }
  private publish(phase: ConnectionPhase, code: string | null = null): void {
    this.state = { phase, code };
    recordPlaybackEvent({ event: 'connection', phase, code, rtt: this.rtt });
    this.statuses.forEach((fn) => fn(this.state));
  }
  private retire(): void {
    clearTimeout(this.connectTimer); clearTimeout(this.joinTimer); clearInterval(this.heartbeat);
    const socket = this.socket; this.socket = null; this.ping = null;
    if (socket) { socket.onopen = null; socket.onmessage = null; socket.onclose = null; socket.onerror = null; try { socket.close(); } catch { /* already closed */ } }
  }
  private reconnect(code: string): void {
    this.retire(); clearTimeout(this.retryTimer);
    if (!this.running || this.leaving) { this.publish('closed'); return; }
    this.publish('reconnecting', code);
    this.retryTimer = setTimeout(() => this.connect(), this.delay * (0.8 + this.random() * 0.4));
    this.delay = Math.min(30_000, this.delay * 2);
  }
  reconnectNow(): void {
    if (!this.running || this.leaving || this.state.phase === 'terminal' || this.now() - this.lastKick < 5000) return;
    this.lastKick = this.now(); this.retire(); clearTimeout(this.retryTimer); this.connect();
  }
  checkForeground(): void { if (this.now() - this.lastEvidence > 15_000) this.reconnectNow(); }
  private connect(): void {
    if (!this.running || this.leaving || this.socket) return;
    let socket: WebSocket;
    try { socket = this.createSocket(this.url); } catch { this.reconnect('CONNECT_FAILED'); return; }
    this.socket = socket; this.publish('connecting');
    const current = () => this.running && this.socket === socket;
    this.connectTimer = setTimeout(() => { if (current()) this.reconnect('CONNECT_TIMEOUT'); }, 10_000);
    socket.onopen = () => {
      if (!current()) return;
      clearTimeout(this.connectTimer); this.lastEvidence = this.now(); this.rtt = 0;
      this.joinTimer = setTimeout(() => { if (current()) this.reconnect('JOIN_TIMEOUT'); }, 10_000);
      this.publish('joining');
      this.heartbeat = setInterval(() => {
        if (!current()) return;
        if (this.ping) {
          if (this.now() - this.ping.sent >= 15_000) this.reconnect('HEARTBEAT_TIMEOUT');
          return;
        }
        this.ping = { sent: this.now(), clientTime: Date.now() };
        this.send({ type: 'heartbeat', payload: { clientTime: this.ping.clientTime } });
      }, 5000);
    };
    socket.onmessage = (event) => {
      if (!current()) return;
      let msg: ServerMessage;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!msg || typeof msg !== 'object' || !msg.payload || typeof msg.payload !== 'object') return;
      if (this.leaving && !['left', 'error', 'heartbeat_ack'].includes(msg.type)) return;
      if (msg.type === 'heartbeat_ack') {
        if (this.ping && msg.payload.clientTime === this.ping.clientTime) {
          const rtt = this.now() - this.ping.sent; this.ping = null;
          this.lastEvidence = this.now();
          if (rtt < 5000) this.rtt = Math.max(0, rtt);
          if (this.state.phase === 'joined' && this.now() - this.joinedAt >= 10_000) this.delay = 1000;
          if (rtt < 5000 && Number.isFinite(msg.payload.serverTime)) this.messages.forEach((fn) => {
            try { fn(msg); } catch { recordPlaybackEvent({ event: 'connection', code: 'SUBSCRIBER_FAILED' }); }
          });
        }
        return;
      }
      if (msg.type === 'joined') {
        if (!msg.payload.snapshot?.playback || !Array.isArray(msg.payload.snapshot.queue)) return;
        clearTimeout(this.joinTimer); this.lastEvidence = this.now(); this.joinedAt = this.now();
        this.publish('joined');
      }
      if (msg.type === 'error' && msg.payload.code && terminalCodes.has(msg.payload.code)) {
        this.running = false; this.retire(); clearTimeout(this.retryTimer); this.publish('terminal', msg.payload.code);
      } else if (msg.type === 'error' && msg.payload.code === 'NOT_JOINED') {
        this.reconnect('NOT_JOINED');
        return;
      } else if (msg.type === 'left') this.stop();
      if (msg.type === 'room_state_changed' && msg.payload.cause === 'advance') {
        recordPlaybackEvent({ event: 'advance', phase: 'received', seq: msg.payload.playback.seq });
      }
      this.messages.forEach((fn) => { try { fn(msg); } catch { recordPlaybackEvent({ event: 'connection', code: 'SUBSCRIBER_FAILED' }); } });
    };
    socket.onclose = () => { if (current()) this.reconnect('SOCKET_CLOSED'); };
    socket.onerror = () => { if (current()) this.reconnect('SOCKET_ERROR'); };
  }
  send(message: ClientMessage): boolean {
    if (!this.socket || this.socket.readyState !== 1) return false;
    if (message.type !== 'join' && message.type !== 'heartbeat' && (this.state.phase !== 'joined' || this.leaving)) return false;
    try { this.socket.send(JSON.stringify(message)); } catch { this.reconnect('SEND_FAILED'); return false; }
    if (message.type === 'advance_playback') {
      recordPlaybackEvent({ event: 'advance', phase: 'sent', reason: message.payload.reason, seq: message.payload.expectedPlaybackSeq });
    }
    if (message.type === 'join') {
      clearTimeout(this.joinTimer);
      this.joinTimer = setTimeout(() => this.reconnect('JOIN_TIMEOUT'), 10_000);
    }
    if (message.type === 'leave') { this.leaving = true; clearTimeout(this.retryTimer); }
    return true;
  }
}
