export type ClientPlatformKind = 'windows' | 'linux' | 'android' | 'browser';
export type ClientLayout = 'desktop' | 'mobile';

export interface PlatformCapabilities {
  backgroundAudio: boolean;
  systemBack: boolean;
  systemMediaControls: boolean;
}

export interface OverlayNavigation {
  push: (onBack: () => void) => () => void;
  dismiss: () => boolean;
}

export interface ClientRuntime {
  kind: ClientPlatformKind;
  layout: ClientLayout;
  tauri: boolean;
  capabilities: PlatformCapabilities;
  overlayNavigation: OverlayNavigation;
}
