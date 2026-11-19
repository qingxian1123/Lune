import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AudioEngine } from '../../audio/AudioEngine';
import { createRoom, joinRoom } from '../../lib/api';
import { ApiError } from '../../lib/apiError';
import { getUiErrorMessage } from '../../lib/uiError';
import { getInitialServerUrl } from '../../lib/serverConfig';
import { readRoomSession, saveRoomSession } from '../../lib/roomSession';
import { useSettingsController } from '../settings/model/useSettingsController';
import type { SettingsController } from '../settings/model/types';

const NICKNAME_KEY = 'lune.access.nickname.v1';

export type AccessMode = 'create' | 'join';
export type AccessError = { field?: 'nickname' | 'roomCode'; message: string };

export interface AccessController {
  nickname: string;
  roomCode: string;
  error: AccessError | null;
  busy: boolean;
  showServer: boolean;
  settings: SettingsController;
  setNickname: (value: string) => void;
  setRoomCode: (value: string) => void;
  clearError: () => void;
  enterRoom: (mode?: AccessMode) => Promise<void>;
}

export function useAccessController({ mobile = false }: { mobile?: boolean } = {}): AccessController {
  const navigate = useNavigate();
  const location = useLocation();
  const rejoinCode = (location.state as { rejoinRoomCode?: string } | null)?.rejoinRoomCode;
  const settings = useSettingsController({ openOnMissing: mobile });
  const [nickname, setNicknameState] = useState(() => {
    try { return window.localStorage.getItem(NICKNAME_KEY) || ''; }
    catch { return ''; }
  });
  const [roomCode, setRoomCodeState] = useState(rejoinCode ?? '');
  const [error, setError] = useState<AccessError | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [serverRequired, setServerRequired] = useState(() => !settings.serverUrl.trim());

  useEffect(() => {
    if (rejoinCode) return;
    const serverUrl = getInitialServerUrl();
    const session = serverUrl ? readRoomSession(serverUrl) : null;
    if (session) navigate(`/room/${session.roomCode}`, { replace: true });
  }, [navigate, rejoinCode]);

  const setNickname = (value: string) => {
    setNicknameState(value);
    if (error?.field !== 'roomCode') setError(null);
  };

  const setRoomCode = (value: string) => {
    const trimmed = value.trim();
    const extracted = trimmed.length > 6 ? trimmed.match(/\b([A-Za-z0-9]{6})\b/)?.[1] : undefined;
    setRoomCodeState((extracted ?? value.replace(/\s+/g, '')).toUpperCase());
    if (error?.field !== 'nickname') setError(null);
  };

  const enterRoom = async (mode: AccessMode = roomCode ? 'join' : 'create') => {
    if (submitting.current || settings.serverState === 'testing') return;
    if (mobile && !settings.serverUrl.trim()) {
      settings.openSettings();
      return;
    }
    if (!nickname.trim()) {
      setError({ field: 'nickname', message: '请先输入你的昵称' });
      return;
    }
    if (mode === 'join' && !/^[A-Z0-9]{6}$/.test(roomCode)) {
      setError({ field: 'roomCode', message: '请输入 6 位房间码，可包含字母和数字' });
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError(null);

    try {
      void AudioEngine.instance().resume().catch(() => {});
      if (!await settings.verifyServerForAccess()) {
        setServerRequired(true);
        if (mobile) settings.openSettings();
        return;
      }
      setServerRequired(false);
      const response = mode === 'join'
        ? await joinRoom(roomCode, nickname.trim())
        : await createRoom(nickname.trim());

      saveRoomSession({ roomCode: response.code, token: response.token, memberId: response.member.id });
      try { window.localStorage.setItem(NICKNAME_KEY, nickname.trim()); }
      catch { /* Remembering a nickname is optional. */ }
      navigate(`/room/${response.code}`, {
        state: { token: response.token, memberId: response.member.id, createdRoom: mode === 'create' },
      });
    } catch (cause) {
      if (mode === 'join' && cause instanceof ApiError && cause.code === 'ROOM_NOT_FOUND') {
        setError({ field: 'roomCode', message: '找不到这个房间，请向朋友确认房间码' });
      } else {
        setError({ message: getUiErrorMessage(cause,
          mode === 'join' ? '无法加入房间，请稍后重试' : '无法创建房间，请稍后重试') });
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return {
    nickname,
    roomCode,
    error,
    busy,
    showServer: settings.serverState !== 'ready' && (serverRequired || Boolean(settings.serverError)),
    settings,
    setNickname,
    setRoomCode,
    clearError: () => setError(null),
    enterRoom,
  };
}
