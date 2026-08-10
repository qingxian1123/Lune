import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ClientRuntime } from '../platform/contracts';
import { createOverlayNavigation } from '../platform/overlayNavigation';
import {
  detectPlatformKind,
  getPlatformCapabilities,
  isTauriShell,
  useIsMobileLayout,
} from '../platform/detect';

const ClientRuntimeContext = createContext<ClientRuntime | null>(null);

export function ClientRuntimeProvider({ children }: { children: ReactNode }) {
  const layout = useIsMobileLayout() ? 'mobile' : 'desktop';
  const runtime = useMemo<ClientRuntime>(() => {
    const kind = detectPlatformKind();
    return {
      kind,
      layout,
      tauri: isTauriShell(),
      capabilities: getPlatformCapabilities(kind),
      overlayNavigation: createOverlayNavigation(kind === 'android'),
    };
  }, [layout]);

  return (
    <ClientRuntimeContext.Provider value={runtime}>
      {children}
    </ClientRuntimeContext.Provider>
  );
}

export function useClientRuntime(): ClientRuntime {
  const runtime = useContext(ClientRuntimeContext);
  if (!runtime) throw new Error('ClientRuntimeProvider is missing');
  return runtime;
}
