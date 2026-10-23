import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AudioEngine } from '../../audio/AudioEngine';
import { createRoom, joinRoom } from '../../lib/api';
import { getUiErrorMessage } from '../../lib/uiError';
import { getInitialServerUrl } from '../../lib/serverConfig';
import { readRoomSession, saveRoomSession } from '../../lib/roomSession';
import { useSettingsController } from '../settings/model/useSettingsController';
import type { SettingsController } from '../settings/model/types';

export type AccessMode = 'create' | 'join';
export type AccessError = { field?: 'nickname' | 'roomCode' | 'server'; message: string };

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

export function useAccessController({ invitation = false }: { invitation?: boolean } = {}): AccessController {
  const navigate = useNavigate();
  const location = useLocation();
  const rejoinCode = (location.state as { rejoinRoomCode?: string } | null)?.rejoinRoomCode;
  const settings = useSettingsController({ openOnMissing: !invitation });
  const [mode, setMode] = useState<AccessMode>(rejoinCode ? 'join' : 'create');
  const [nickname, setNicknameState] = useState('');
  const [roomCode, setRoomCodeState] = useState(rejoinCode ?? '');
  const [error, setError] = useState<AccessError | null>(null);
  const [busy, setBusy] = useState(false);
  const roomCodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rejoinCode) return;
    const serverUrl = getInitialServerUrl();
    const session = serverUrl ? readRoomSession(serverUrl) : null;
    if (session) navigate(`/room/${session.roomCode}`, { replace: true });
  }, [navigate, rejoinCode]);

  useEffect(() => {
    if (mode === 'join' && !invitation) roomCodeInputRef.current?.focus();
  }, [invitation, mode]);

  useEffect(() => {
    if (error?.field === 'server') setError(null);
  }, [error?.field, settings.serverUrl]);

  const setNickname = (value: string) => {
    setNicknameState(value);
    if (error?.field === 'nickname') setError(null);
  };

  const setRoomCode = (value: string) => {
    setRoomCodeState(value.toUpperCase().slice(0, 6));
    if (invitation) setMode(value.trim() ? 'join' : 'create');
    if (error?.field === 'roomCode') setError(null);
  };

  const switchMode = (nextMode: AccessMode) => {
    setMode(nextMode);
    setError(null);
  };

  const enterRoom = async () => {
    if (invitation) {
      if (!settings.serverUrl.trim()) {
        setError({ field: 'server', message: '请先填写服务器地址' });
        return;
      }
    } else if (!settings.ensureServerConfigured()) return;
    if (!nickname.trim()) {
      setError({ field: 'nickname', message: '请先输入你的昵称' });
      return;
    }
    if (invitation ? Boolean(roomCode.trim() && !/^[A-Z0-9]{6}$/.test(roomCode.trim())) : mode === 'join' && !roomCode.trim()) {
      setError({ field: 'roomCode', message: '请输入六位房间码' });
      return;
    }

    setBusy(true);
    setError(null);

    if (!await settings.verifyServerForAccess(!invitation)) {
      setBusy(false);
      return;
    }

    try {
      await AudioEngine.instance().resume();
      const response = mode === 'create'
        ? await createRoom(nickname.trim())
        : await joinRoom(roomCode.trim(), nickname.trim());

      saveRoomSession({ roomCode: response.code, token: response.token, memberId: response.member.id });
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
