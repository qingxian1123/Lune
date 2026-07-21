import assert from 'node:assert/strict';
import test from 'node:test';
import { Room, type Track } from '../src/room.ts';

const track: Track = {
  id: 1,
  name: 'Test Track',
  artists: 'Codex',
  album: 'Verification',
  coverUrl: '',
  duration: 120,
};

test('playing snapshot advances position without mutating stored state', () => {
  const room = new Room('100001');
  room.playback = {
    status: 'playing',
    track,
    position: 10,
    serverTimestamp: 1_000,
    seq: 1,
  };

  const snapshot = room.getPlaybackSnapshot(6_500);

  assert.equal(snapshot.status, 'playing');
  assert.equal(snapshot.serverTimestamp, 6_500);
  assert.equal(snapshot.position, 15.5);
  assert.equal(room.playback.position, 10);
  assert.equal(room.playback.serverTimestamp, 1_000);
});

test('pause without client position uses live snapshot position', () => {
  const room = new Room('100002');
  room.playback = {
    status: 'playing',
    track,
    position: 20,
    serverTimestamp: Date.now() - 2_000,
    seq: 3,
  };

  const paused = room.handlePause();

  assert.equal(paused.status, 'paused');
  assert.equal(paused.seq, 4);
  assert.ok(paused.position >= 21.8 && paused.position <= 22.2);
});

test('position is clamped to track duration', () => {
  const room = new Room('100003');

  const playing = room.handlePlay(track, 999);
  const seeking = room.handleSeek(999);

  assert.equal(playing.position, track.duration);
  assert.equal(seeking.position, track.duration);
});
