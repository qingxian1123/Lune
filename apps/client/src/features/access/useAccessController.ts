import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioEngine } from '../../audio/AudioEngine';
import { createRoom, joinRoom } from '../../lib/api';
import { getUiErrorMessage } from '../../lib/uiError';
import { useSettingsController } from '../settings/model/useSettingsController';
import type { SettingsController } from '../settings/model/types';

export type AccessMode = 'create' | 'join';
export type AccessError = { field?: 'nickname' | 'roomCode'; message: string };

export interface AccessController {
  mode: AccessMode;
  nickname: string;
  roomCode: string;
  error: AccessError | null;
  busy: boolean;
  roomCodeInputRef: RefObject<HTMLInputElement>;
  settings: SettingsController;
  setNickname: (value: string) => void;
  setRoomCode: (value: string) => void;
  switchMode: (mode: AccessMode) => void;
  enterRoom: () => Promise<void>;
}

export function useAccessController(): AccessController {
  const navigate = useNavigate();
  const settings = useSettingsController();
  const [mode, setMode] = useState<AccessMode>('create');
  const [nickname, setNicknameState] = useState('');
  const [roomCode, setRoomCodeState] = useState('');
  const [error, setError] = useState<AccessError | null>(null);
  const [busy, setBusy] = useState(false);
  const roomCodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'join') roomCodeInputRef.current?.focus();
  }, [mode]);

  const setNickname = (value: string) => {
    setNicknameState(value);
    if (error?.field === 'nickname') setError(null);
  };

  const setRoomCode = (value: string) => {
    setRoomCodeState(value.toUpperCase().slice(0, 6));
    if (error?.field === 'roomCode') setError(null);
  };

  const switchMode = (nextMode: AccessMode) => {
    setMode(nextMode);
    setError(null);
  };

  const enterRoom = async () => {
    if (!settings.ensureServerConfigured()) return;
    if (!nickname.trim()) {
      setError({ field: 'nickname', message: '请先输入你的昵称' });
      return;
    }
    if (mode === 'join' && !roomCode.trim()) {
      setError({ field: 'roomCode', message: '请输入六位房间码' });
      return;
    }

    setBusy(true);
    setError(null);

    if (!await settings.verifyServerForAccess()) {
      setBusy(false);
      return;
    }

    try {
      await AudioEngine.instance().resume();
      const response = mode === 'create'
        ? await createRoom(nickname.trim())
        : await joinRoom(roomCode.trim(), nickname.trim());

      navigate(`/room/${response.code}`, {
        state: { token: response.token, memberId: response.member.id },
      });
    } catch (cause) {
      setError({ message: getUiErrorMessage(cause, '暂时无法进入房间，请稍后再试') });
    } finally {
      setBusy(false);
    }
  };

  return {
    mode,
    nickname,
    roomCode,
    error,
    busy,
    roomCodeInputRef,
    settings,
    setNickname,
    setRoomCode,
    switchMode,
    enterRoom,
  };
}
