import { WebSocket } from 'ws';
import { createRoom, getRoom, deleteRoom, generateRoomCode } from './room.js';
import type { Track, PlaybackState } from './room.js';

interface ClientMessage {
  type: string;
  payload?: any;
}

export function handleConnection(ws: WebSocket) {
  let userId: string | null = null;
  let roomCode: string | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendError(ws, '无效的 JSON 消息');
      return;
    }

    switch (msg.type) {
      case 'create_room':
        handleCreateRoom(ws, msg.payload);
        break;
      case 'join_room':
        handleJoinRoom(ws, msg.payload);
        break;
      case 'leave_room':
        handleLeaveRoom(ws);
        break;
      case 'play':
      case 'pause':
      case 'seek':
      case 'next':
        handlePlayback(ws, msg.type, msg.payload);
        break;
      case 'add_to_queue':
      case 'remove_from_queue':
        handleQueue(ws, msg.type, msg.payload);
        break;
      case 'heartbeat':
        handleHeartbeat(ws, msg.payload);
        break;
      default:
        sendError(ws, `未知消息类型: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    if (roomCode && userId) {
      const room = getRoom(roomCode);
      if (room) {
        const wasOwner = room.ownerId === userId;
        const isEmpty = room.removeMember(userId);

        if (!isEmpty) {
          room.broadcastAll({ type: 'member_left', payload: { userId } });

          if (wasOwner && room.ownerId) {
            room.broadcastAll({
              type: 'owner_changed',
              payload: { newOwnerId: room.ownerId },
            });
          }
        } else {
          deleteRoom(roomCode);
        }
      }
    }
  });

  // ---- 内部处理函数 ----

  function handleCreateRoom(ws: WebSocket, payload: any) {
    if (!payload?.nickname) {
      sendError(ws, '需要提供昵称');
      return;
    }
    const code = payload.roomCode || generateRoomCode();
    if (getRoom(code)) {
      sendError(ws, '房间码已被占用，请重试');
      return;
    }
    const room = createRoom(code);
    const member = room.addMember(ws, payload.nickname);
    userId = member.id;
    roomCode = code;

    ws.send(JSON.stringify({
      type: 'room_created',
      payload: {
        roomCode: code,
        userId: member.id,
        members: room.getMembers(),
      },
    }));
  }

  function handleJoinRoom(ws: WebSocket, payload: any) {
    if (!payload?.roomCode || !payload?.nickname) {
      sendError(ws, '需要提供房间码和昵称');
      return;
    }
    const room = getRoom(payload.roomCode);
    if (!room) {
      sendError(ws, '房间不存在');
      return;
    }
    const member = room.addMember(ws, payload.nickname);
    userId = member.id;
    roomCode = room.code;

    const playback = room.getPlaybackSnapshot();

    // 告知加入者当前房间状态
    ws.send(JSON.stringify({
      type: 'room_joined',
      payload: {
        userId: member.id,
        members: room.getMembers(),
        playback,
        queue: room.queue,
      },
    }));

    // 如果房间正在播放或暂停，补发 playback_state 让新客机立即跟上进度
    if (playback.status !== 'idle' && playback.track) {
      ws.send(JSON.stringify({ type: 'playback_state', payload: playback }));
    }

    // 告知其他人
    room.broadcastAll({
      type: 'member_joined',
      payload: { member: { id: member.id, nickname: payload.nickname, isOwner: false } },
    });
  }

  function handleLeaveRoom(ws: WebSocket) {
    if (!roomCode || !userId) return;
    const room = getRoom(roomCode);
    if (!room) return;

    const wasOwner = room.ownerId === userId;
    const isEmpty = room.removeMember(userId);

    if (!isEmpty) {
      room.broadcastAll({ type: 'member_left', payload: { userId: userId! } });
      if (wasOwner && room.ownerId) {
        room.broadcastAll({ type: 'owner_changed', payload: { newOwnerId: room.ownerId } });
      }
    } else {
      deleteRoom(roomCode);
    }
    userId = null;
    roomCode = null;
  }

  function handlePlayback(_ws: WebSocket, type: string, payload: any) {
    if (!roomCode) return;
    const room = getRoom(roomCode);
    if (!room) return;

    let newState: PlaybackState | null = null;

    switch (type) {
      case 'play': {
        if (!payload?.track) {
          sendError(_ws, '需要提供歌曲信息');
          return;
        }
        const position = typeof payload.position === 'number' ? payload.position : 0;
        newState = room.handlePlay(payload.track as Track, position);
        break;
      }
      case 'pause':
        newState = room.handlePause(
          typeof payload?.position === 'number' ? payload.position : undefined,
        );
        break;
      case 'seek':
        newState = room.handleSeek(typeof payload?.position === 'number' ? payload.position : 0);
        break;
      case 'next': {
        // 防重复切歌：同一首歌 1 秒内不重复处理
        const now = Date.now();
        if (
          room.lastEndedTrackId === room.playback.track?.id &&
          now - room.lastNextTime < 1000
        ) break;
        room.lastEndedTrackId = room.playback.track?.id ?? 0;
        room.lastNextTime = now;
        newState = room.handleNext();

        // 切歌后广播新的队列状态
        if (newState.status !== 'idle') {
          room.broadcastAll({
            type: 'queue_updated',
            payload: { queue: room.queue },
          });
        }
        break;
      }
    }

    if (newState) {
      room.broadcastAll({
        type: 'playback_state',
        payload: newState,
      });
    }
  }

  function handleQueue(_ws: WebSocket, type: string, payload: any) {
    if (!roomCode) return;
    const room = getRoom(roomCode);
    if (!room) return;

    switch (type) {
      case 'add_to_queue':
        if (!payload?.track) return;
        room.addToQueue(payload.track as Track);
        room.broadcastAll({
          type: 'queue_updated',
          payload: { queue: room.queue },
        });
        break;

      case 'remove_from_queue':
        if (payload?.index === undefined) return;
        room.removeFromQueue(payload.index);
        room.broadcastAll({
          type: 'queue_updated',
          payload: { queue: room.queue },
        });
        break;
    }
  }

  function handleHeartbeat(ws: WebSocket, payload: any) {
    ws.send(JSON.stringify({
      type: 'heartbeat_ack',
      payload: { serverTime: Date.now(), clientTime: payload?.clientTime },
    }));
  }
}

function sendError(ws: WebSocket, message: string) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'error', payload: { message } }));
  }
}
