export type ClientPlatformKind = 'windows' | 'linux' | 'android' | 'browser';
export type ClientLayout = 'desktop' | 'mobile';

export interface OverlayNavigation {
  push: (onBack: () => void) => () => void;
  dismiss: () => boolean;
}

export interface ClientRuntime {
  kind: ClientPlatformKind;
  layout: ClientLayout;
  overlayNavigation: OverlayNavigation;
}
