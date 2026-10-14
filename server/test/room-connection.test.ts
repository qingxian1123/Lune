import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomConnection } from '../../apps/client/src/lib/RoomConnection';
class Socket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  send(value: string) { this.sent.push(value); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
test('连接与 join 超时保留重连；终止身份错误不再创建 socket', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const sockets: Socket[] = [];
  const connection = new RoomConnection('ws://test', () => { const s = new Socket(); sockets.push(s); return s as unknown as WebSocket; }, () => 0, () => 0.5);
  t.after(() => connection.stop());
  connection.start(); t.mock.timers.tick(10_000);
  assert.equal(connection.state.code, 'CONNECT_TIMEOUT');
  t.mock.timers.tick(1000); assert.equal(sockets.length, 2);
  sockets[1].open(); connection.send({ type: 'join', payload: { token: 'same-identity' } });
  t.mock.timers.tick(10_000); assert.equal(connection.state.code, 'JOIN_TIMEOUT');
  t.mock.timers.tick(2000); sockets[2].open();
  connection.send({ type: 'join', payload: { token: 'same-identity' } });
  sockets[2].message({ type: 'error', payload: { code: 'AUTH_INVALID', message: 'expired' } });
  assert.equal(connection.state.phase, 'terminal');
  connection.reconnectNow(); t.mock.timers.tick(60_000);
  assert.equal(sockets.length, 3);
});

test('退役连接的迟到消息不能生效；断线修改不入重放队列', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const sockets: Socket[] = []; let received = 0;
  const connection = new RoomConnection('ws://test', () => { const s = new Socket(); sockets.push(s); return s as unknown as WebSocket; }, () => 20_000);
  t.after(() => connection.stop()); connection.subscribe(() => received++); connection.start();
  sockets[0].open(); const oldMessage = sockets[0].onmessage!;
  connection.reconnectNow();
  oldMessage({ data: JSON.stringify({ type: 'member_left', payload: { memberId: 'x', ownerId: 'y' } }) });
  assert.equal(received, 0);
  assert.equal(connection.send({ type: 'leave', payload: {} }), false);
  assert.deepEqual(sockets[1].sent, []);
});
