import { create } from 'zustand';

export interface Shortcut {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export const shortcutActions = {
  toggleLibrary: {
    label: '展开 / 收起音乐库',
    defaultBinding: { code: 'KeyL', ctrl: true, alt: false, shift: true } as Shortcut,
  },
};
export type ShortcutAction = keyof typeof shortcutActions;
type Bindings = Record<ShortcutAction, Shortcut | null>;
const storageKey = 'lune.desktop-preferences.v1';

export function formatShortcut(binding: Shortcut | null): string {
  if (!binding) return '';
  return [binding.ctrl && 'Ctrl', binding.alt && 'Alt', binding.shift && 'Shift',
    binding.code.replace(/^(Key|Digit)/, '')].filter(Boolean).join(' + ');
}

export function matchesShortcut(event: KeyboardEvent, binding: Shortcut | null): boolean {
  return !!binding && !event.metaKey && event.code === binding.code
    && event.ctrlKey === binding.ctrl && event.altKey === binding.alt && event.shiftKey === binding.shift;
}

export function shortcutError(binding: Shortcut): string | null {
  if (!/^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2]))$/.test(binding.code)) {
    return '请选择字母、数字或 F1–F12，并搭配 Ctrl 或 Alt。';
  }
  if (!binding.ctrl && !binding.alt) return '请搭配 Ctrl 或 Alt，避免影响输入和键盘导航。';
  if (binding.ctrl && binding.alt) return 'Ctrl + Alt 可能用于输入字符，请改用 Ctrl 或 Alt 搭配 Shift。';
  const key = formatShortcut(binding);
  const reserved = new Set([
    'Alt + F4', 'Alt + Shift + F4', 'Ctrl + F4', 'Ctrl + Shift + F4',
    'Ctrl + A', 'Ctrl + C', 'Ctrl + V', 'Ctrl + X', 'Ctrl + Z', 'Ctrl + Y',
    'Ctrl + L', 'Ctrl + N', 'Ctrl + O', 'Ctrl + P', 'Ctrl + R', 'Ctrl + S',
    'Ctrl + T', 'Ctrl + W', 'Ctrl + F', 'Ctrl + D', 'Ctrl + H', 'Ctrl + J',
    'Ctrl + Shift + N', 'Ctrl + Shift + T', 'Ctrl + Shift + W',
    'Ctrl + Shift + Q', 'Ctrl + Shift + I', 'Ctrl + Shift + J', 'Ctrl + Shift + C',
    'Ctrl + Shift + R', 'Ctrl + Shift + S', 'Ctrl + Shift + Z',
  ]);
  return reserved.has(key) ? '该组合键用于常见系统、浏览器或编辑操作，请换一个。' : null;
}

function isShortcut(value: unknown): value is Shortcut {
  if (!value || typeof value !== 'object') return false;
  const item = value as Shortcut;
  return typeof item.code === 'string' && typeof item.ctrl === 'boolean'
    && typeof item.alt === 'boolean' && typeof item.shift === 'boolean' && !shortcutError(item);
}

function loadPreferences(): { libraryOpen: boolean; bindings: Bindings } {
  const defaults = { libraryOpen: true, bindings: { toggleLibrary: shortcutActions.toggleLibrary.defaultBinding } as Bindings };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    const binding: unknown = saved?.bindings?.toggleLibrary;
    return {
      libraryOpen: typeof saved?.libraryOpen === 'boolean' ? saved.libraryOpen : true,
      bindings: { toggleLibrary: binding === null || isShortcut(binding) ? binding : defaults.bindings.toggleLibrary },
    };
  } catch {
    return defaults;
  }
}

interface DesktopPreferences {
  libraryOpen: boolean;
  bindings: Bindings;
  setLibraryOpen: (open: boolean) => void;
  saveBinding: (action: ShortcutAction, binding: Shortcut | null) => string | null;
}

function persist(libraryOpen: boolean, bindings: Bindings): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ libraryOpen, bindings }));
    return true;
  } catch {
    return false;
  }
}

export const useDesktopPreferences = create<DesktopPreferences>((set, get) => ({
  ...loadPreferences(),
  setLibraryOpen: (libraryOpen) => {
    persist(libraryOpen, get().bindings);
    set({ libraryOpen });
  },
  saveBinding: (action, binding) => {
    if (binding) {
      const error = shortcutError(binding);
      if (error) return error;
      for (const other of Object.keys(shortcutActions) as ShortcutAction[]) {
        const otherLabel = shortcutActions[other].label;
        if (other !== action && formatShortcut(get().bindings[other]) === formatShortcut(binding)) {
          return `与「${otherLabel}」冲突，请换一个组合键。`;
        }
      }
    }
    const bindings = { ...get().bindings, [action]: binding };
    if (!persist(get().libraryOpen, bindings)) return '无法保存到本机，请检查存储权限后重试。';
    set({ bindings });
    return null;
  },
}));
