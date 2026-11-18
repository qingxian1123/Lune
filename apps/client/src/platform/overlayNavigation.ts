import type { OverlayNavigation } from './contracts';

export function createOverlayNavigation(enabled: boolean): OverlayNavigation {
  let active = false;

  return {
    push(onBack) {
      if (!enabled || active) return () => undefined;

      const current = (window.history.state ?? {}) as Record<string, unknown>;
      if (!current.luneOverlay) window.history.pushState({ ...current, luneOverlay: true }, '');
      active = true;

      const onPopState = () => {
        active = false;
        onBack();
      };

      window.addEventListener('popstate', onPopState);
      return () => {
        active = false;
        window.removeEventListener('popstate', onPopState);
      };
    },

    dismiss() {
      if (!enabled || !active) return false;
      window.history.back();
      return true;
    },
  };
}
