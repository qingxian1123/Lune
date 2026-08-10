import { create } from 'zustand';
import type { Member, PlaybackState, RoomSnapshot, ServerMessage, Track } from '@lune/shared';

interface RoomState {
  memberId: string | null;
  roomCode: string | null;
  playback: PlaybackState;
  queue: Track[];
  queueRevision: number;
  members: Member[];
  ownerId: string;
  connected: boolean;
  lastError: string | null;

  setIdentity: (memberId: string, roomCode: string) => void;
  setConnected: (b: boolean) => void;
  applySnapshot: (snapshot: RoomSnapshot) => void;
  applyServerMessage: (msg: ServerMessage) => void;
  clearError: () => void;
  reset: () => void;
}

const idlePlayback: PlaybackState = {
  status: 'idle',
  track: null,
  position: 0,
  serverTimestamp: 0,
  seq: 0,
};

export const useRoomStore = create<RoomState>((set) => ({
  memberId: null,
  roomCode: null,
  playback: idlePlayback,
  queue: [],
  queueRevision: 0,
  members: [],
  ownerId: '',
  connected: false,
  lastError: null,

  setIdentity: (memberId, roomCode) => set({ memberId, roomCode }),
  setConnected: (b) => set({ connected: b }),
  applySnapshot: (snapshot) =>
    set({
      playback: snapshot.playback,
      queue: snapshot.queue,
      queueRevision: snapshot.queueRevision,
      members: snapshot.members,
      ownerId: snapshot.ownerId,
    }),
  applyServerMessage: (msg) => {
    switch (msg.type) {
      case 'joined':
        set({
          playback: msg.payload.snapshot.playback,
          queue: msg.payload.snapshot.queue,
          queueRevision: msg.payload.snapshot.queueRevision,
          members: msg.payload.snapshot.members,
          ownerId: msg.payload.snapshot.ownerId,
        });
        break;
      case 'playback_state':
        set({ playback: msg.payload });
        break;
      case 'queue_updated':
        set({ queue: msg.payload.queue, queueRevision: msg.payload.queueRevision });
        break;
      case 'member_joined':
        set((s) => {
          if (s.members.some((m) => m.id === msg.payload.member.id)) return s;
          return { members: [...s.members, msg.payload.member] };
        });
        break;
      case 'member_left':
        set((s) => ({
          members: s.members.filter((m) => m.id !== msg.payload.memberId),
          ownerId: msg.payload.ownerId,
        }));
        break;
      case 'error':
        set({ lastError: msg.payload.message });
        break;
      default:
        break;
    }
  },
  clearError: () => set({ lastError: null }),
  reset: () =>
    set({
      memberId: null,
      roomCode: null,
      playback: idlePlayback,
      queue: [],
      queueRevision: 0,
      members: [],
      ownerId: '',
      connected: false,
      lastError: null,
    }),
}));
