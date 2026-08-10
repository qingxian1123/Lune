import { useCallback, useEffect, useState } from 'react';
import { useClientRuntime } from '../../../app/ClientRuntimeProvider';
import { useServerConfig } from '../../../hooks/useServerConfig';
import type { SettingsController } from './types';

function getServerError(cause: unknown): string {
  if (cause instanceof Error && cause.message.includes('地址')) return cause.message;
  return '无法连接服务器，请检查地址';
}

export function useSettingsController(): SettingsController {
  const runtime = useClientRuntime();
  const server = useServerConfig();
  const [open, setOpen] = useState(() => !server.serverUrl.trim());
  const [activeSectionId, setActiveSectionId] = useState('server');
  const [serverError, setServerError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    return runtime.overlayNavigation.push(() => {
      setServerError(undefined);
      setOpen(false);
    });
  }, [open, runtime.overlayNavigation]);

  const openSettings = useCallback(() => {
    setActiveSectionId('server');
    setOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setServerError(undefined);
    if (runtime.overlayNavigation.dismiss()) return;
    setOpen(false);
  }, [runtime.overlayNavigation]);

  const setServerUrl = useCallback((value: string) => {
    setServerError(undefined);
    server.setServerUrl(value);
  }, [server.setServerUrl]);

  const saveServer = useCallback(async () => {
    setServerError(undefined);
    try {
      await server.verify();
      closeSettings();
    } catch (cause) {
      setServerError(getServerError(cause));
    }
  }, [closeSettings, server.verify]);

  const ensureServerConfigured = useCallback(() => {
    if (server.serverUrl.trim()) return true;
    setServerError('请输入服务器地址');
    setOpen(true);
    return false;
  }, [server.serverUrl]);

  const verifyServerForAccess = useCallback(async () => {
    try {
      await server.verify();
      return true;
    } catch (cause) {
      setServerError(getServerError(cause));
      setOpen(true);
      return false;
    }
  }, [server.verify]);

  return {
    open,
    activeSectionId,
    serverUrl: server.serverUrl,
    serverState: server.state,
    serverError,
    openSettings,
    closeSettings,
    selectSection: setActiveSectionId,
    setServerUrl,
    saveServer,
    ensureServerConfigured,
    verifyServerForAccess,
  };
}
