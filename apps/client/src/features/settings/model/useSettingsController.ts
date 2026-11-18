import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientRuntime } from '../../../app/ClientRuntimeProvider';
import { useServerConfig } from '../../../hooks/useServerConfig';
import type { SettingsController } from './types';

function getServerError(cause: unknown): string {
  return cause instanceof Error ? cause.message : '无法连接服务器。请检查地址和网络。';
}

export function useSettingsController({ openOnMissing = true }: { openOnMissing?: boolean } = {}): SettingsController {
  const runtime = useClientRuntime();
  const server = useServerConfig();
  const [open, setOpen] = useState(() => openOnMissing && !server.serverUrl.trim());
  const [activeSectionId, setActiveSectionId] = useState('server');
  const [serverError, setServerError] = useState<string>();
  const serverBeforeSettings = useRef(server.serverUrl);
  const editedInSettings = useRef(false);
  const saving = useRef(false);

  const finishClosing = useCallback(() => {
    if (editedInSettings.current && !saving.current) {
      server.setServerUrl(serverBeforeSettings.current);
      editedInSettings.current = false;
    }
    setServerError(undefined);
    setOpen(false);
  }, [server.setServerUrl]);

  useEffect(() => {
    if (!open) return;
    return runtime.overlayNavigation.push(finishClosing);
  }, [finishClosing, open, runtime.overlayNavigation]);

  const openSettings = useCallback(() => {
    serverBeforeSettings.current = server.serverUrl;
    editedInSettings.current = false;
    setActiveSectionId('server');
    setOpen(true);
  }, [server.serverUrl]);

  const closeSettings = useCallback(() => {
    if (runtime.overlayNavigation.dismiss()) return;
    finishClosing();
  }, [finishClosing, runtime.overlayNavigation]);

  const setServerUrl = useCallback((value: string) => {
    if (saving.current) return;
    if (open) editedInSettings.current = true;
    setServerError(undefined);
    server.setServerUrl(value);
  }, [open, server.setServerUrl]);

  const saveServer = useCallback(async () => {
    if (saving.current || server.state === 'testing' || server.state === 'ready') return;
    saving.current = true;
    setServerError(undefined);
    try {
      serverBeforeSettings.current = await server.verify();
      editedInSettings.current = false;
      if (runtime.layout === 'mobile') closeSettings();
    } catch (cause) {
      setServerError(getServerError(cause));
    } finally {
      saving.current = false;
    }
  }, [closeSettings, runtime.layout, server.state, server.verify]);

  const verifyServerForAccess = useCallback(async () => {
    setServerError(undefined);
    try {
      await server.verify();
      return true;
    } catch (cause) {
      setServerError(getServerError(cause));
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
    verifyServerForAccess,
  };
}
