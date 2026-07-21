import { useState, useEffect, useCallback } from 'react';
import type { ClientMessage, ServerMessage, Member, Track, PlaybackState } from '../types';

function createIdlePlayback(): PlaybackState {
  return { status: 'idle', track: null, position: 0, serverTimestamp: Date.now(), seq: 0 };
}

interface UseRoomReturn {
  createRoom: (nickname: string) => void;
  joinRoom: (code: string, nickname: string) => void;
  leaveRoom: () => void;
  members: Member[];
  playback: PlaybackState;
  isOwner: boolean;
  userId: string | null;
  roomCode: string | null;
  queue: Track[];
}

interface UseRoomOptions {
  send: (msg: ClientMessage) => void;
  lastMessage: ServerMessage | null;
  readyState: number;
}

export function useRoom({ send, lastMessage, readyState }: UseRoomOptions): UseRoomReturn {
  const [members, setMembers] = useState<Member[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>(createIdlePlayback);
  const [isOwner, setIsOwner] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);

  // 处理服务端消息
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'room_created':
        setUserId(lastMessage.payload.userId);
        setRoomCode(lastMessage.payload.roomCode);
        setMembers(lastMessage.payload.members);
        setIsOwner(true);
        break;

      case 'room_joined':
        setUserId(lastMessage.payload.userId);
        setMembers(lastMessage.payload.members);
        setPlayback(lastMessage.payload.playback);
        setQueue(lastMessage.payload.queue || []);
        setIsOwner(false);
        break;

      case 'member_joined':
        setMembers((prev) => [...prev, lastMessage.payload.member]);
        break;

      case 'member_left':
        setMembers((prev) => prev.filter((m) => m.id !== lastMessage.payload.userId));
        break;

      case 'owner_changed':
        setMembers((prev) =>
          prev.map((m) => ({
            ...m,
            isOwner: m.id === lastMessage.payload.newOwnerId,
          })),
        );
        if (userId === lastMessage.payload.newOwnerId) {
          setIsOwner(true);
        }
        break;

      case 'playback_state':
        // seq 单调递增，忽略过期消息
        setPlayback((prev) =>
          lastMessage.payload.seq > prev.seq ? lastMessage.payload : prev,
        );
        break;

      case 'queue_updated':
        setQueue(lastMessage.payload.queue);
        break;
    }
  }, [lastMessage, userId]);

  const createRoom = useCallback(
    (nickname: string) => {
      if (readyState !== WebSocket.OPEN) return;
      send({ type: 'create_room', payload: { nickname } });
    },
    [send, readyState],
  );

  const joinRoom = useCallback(
    (code: string, nickname: string) => {
      if (readyState !== WebSocket.OPEN) return;
      setRoomCode(code);
      send({ type: 'join_room', payload: { roomCode: code, nickname } });
    },
    [send, readyState],
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'leave_room' });
    setRoomCode(null);
    setUserId(null);
    setMembers([]);
    setPlayback(createIdlePlayback());
    setIsOwner(false);
    setQueue([]);
  }, [send]);

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    members,
    playback,
    isOwner,
    userId,
    roomCode,
    queue,
  };
}
