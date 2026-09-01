import assert from 'node:assert/strict';
import test from 'node:test';
import type { Track } from '@lune/shared';
import { Room } from '../src/rooms/room.model';

const getTrackKey = (value: Pick<Track, 'id' | 'provider'>): string =>
  `${value.provider || ''}:${value.id}`;

const track = (id: string, provider = 'test'): Track => ({
  id,
  provider,
  name: id,
  artists: 'artist',
  album: 'album',
  coverUrl: '',
  duration: 180_000,
});

test('同一播放版本的并发 advance 只推进一次', () => {
  const room = new Room('ROOM01');
  const current = track('A');
  assert.equal(room.play(current, 0, 0), true);
  room.enqueueMany([track('B'), track('C'), track('D')], 'member-1');

  const [itemB, itemC] = room.queue;
  assert.equal(room.reorder(itemC.id, itemB.id, room.queueRevision), true);
  assert.deepEqual(room.queue.map((item) => item.track.id), ['C', 'B', 'D']);

  const observedSeq = room.playback.seq;
  const observedTrackKey = getTrackKey(current);
  assert.equal(room.advance(observedSeq, observedTrackKey), true);
  assert.equal(room.advance(observedSeq, observedTrackKey), false);

  assert.equal(room.playback.track?.id, 'C');
  assert.deepEqual(room.queue.map((item) => item.track.id), ['B', 'D']);
});

test('队列条目 ID 能区分重复加入的同一首歌', () => {
  const room = new Room('ROOM02');
  const duplicate = track('SAME');
  room.enqueueMany([duplicate, duplicate], 'member-1');

  assert.notEqual(room.queue[0].id, room.queue[1].id);
  const removedId = room.queue[0].id;
  assert.equal(room.remove(removedId, room.queueRevision), true);
  assert.equal(room.queue.length, 1);
  assert.notEqual(room.queue[0].id, removedId);
  assert.equal(room.queue[0].track.id, duplicate.id);
});

test('过期队列版本不能删除或重排新队列中的条目', () => {
  const room = new Room('ROOM03');
  room.enqueueMany([track('A'), track('B')], 'member-1');
  const staleRevision = room.queueRevision;
  const [itemA, itemB] = room.queue;

  room.enqueue(track('C'), 'member-2');
  assert.equal(room.remove(itemA.id, staleRevision), false);
  assert.equal(room.reorder(itemB.id, itemA.id, staleRevision), false);
  assert.deepEqual(room.queue.map((item) => item.track.id), ['A', 'B', 'C']);
});

test('旧曲目的 seek 与 advance 不能作用到新曲目', () => {
  const room = new Room('ROOM04');
  const first = track('A');
  const second = track('B');
  assert.equal(room.play(first, 0, 0), true);
  room.enqueue(second, 'member-1');

  const firstSeq = room.playback.seq;
  assert.equal(room.advance(firstSeq, getTrackKey(first)), true);
  assert.equal(room.seek(90_000, getTrackKey(first)), false);
  assert.equal(room.advance(firstSeq, getTrackKey(first)), false);
  assert.equal(room.playback.track?.id, second.id);
  assert.equal(room.playback.position, 0);
});
