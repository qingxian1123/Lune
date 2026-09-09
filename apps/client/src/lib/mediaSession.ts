/**
 * Android 媒体会话桥(tauri-plugin-lune-media)。
 *
 * 仅在 Tauri Android 环境生效:启动前台服务保证后台/锁屏持续播放,
 * 并把曲目元数据同步到通知栏/锁屏;通知动作以回调返回。
 * 其他环境(桌面 Tauri、浏览器)全部安全 no-op。
 */

export type MediaAction = 'next' | 'favorite' | 'leave' | 'mute' | 'resume';
export type AudioInterrupt = 'becoming_noisy';

export interface MediaSessionState {
  title: string;
  artist: string;
  coverUrl: string | null;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  /** 本机输出是否静音；房间时间线仍继续播放 */
  muted: boolean;
  /** 是否显示「下一首」动作(仅房主) */
  canNext: boolean;
}

function isTauriAndroid(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window &&
    /android/i.test(navigator.userAgent)
  );
}

async function invokeMedia(command: string, payload?: Record<string, unknown>): Promise<void> {
  if (!isTauriAndroid()) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke(`plugin:lune-media|${command}`, payload);
  } catch {
    // 插件未编译进当前构建时静默降级为纯前台播放
  }
}

/** 进入房间:启动前台服务(Android 13+ 会顺带请求通知权限) */
export async function startMediaSession(): Promise<void> {
  await invokeMedia('start');
}

/** 同步曲目元数据与播放状态到通知栏/锁屏 */
export async function updateMediaSession(state: MediaSessionState): Promise<void> {
  await invokeMedia('update', { ...state });
}

/** 离开房间:停止前台服务并移除通知 */
export async function stopMediaSession(): Promise<void> {
  await invokeMedia('stop');
}

/**
 * 订阅通知栏/耳机按键动作。返回取消订阅函数。
 */
export async function onMediaAction(
  handler: (action: MediaAction) => void,
): Promise<() => void> {
  if (!isTauriAndroid()) return () => {};
  try {
    const { addPluginListener } = await import('@tauri-apps/api/core');
    const listener = await addPluginListener<{ action: MediaAction }>(
      'lune-media',
      'action',
      (event) => handler(event.action),
    );
    return () => {
      void listener.unregister();
    };
  } catch {
    return () => {};
  }
}

/** 焦点由 WebView 管理；原生层只转发耳机断开。 */
export async function onAudioInterrupt(
  handler: (event: AudioInterrupt) => void,
): Promise<() => void> {
  if (!isTauriAndroid()) return () => {};
  try {
    const { addPluginListener } = await import('@tauri-apps/api/core');
    const listener = await addPluginListener<{ event: AudioInterrupt }>(
      'lune-media',
      'audio',
      (payload) => handler(payload.event),
    );
    return () => {
      void listener.unregister();
    };
  } catch {
    return () => {};
  }
}
