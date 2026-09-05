import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export default function WindowTitlebar() {
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let disposed = false;
    const update = async () => {
      const value = await appWindow.isMaximized();
      if (!disposed) setMaximized(value);
    };
    void update().catch(() => {});
    const listener = appWindow.onResized(() => { void update().catch(() => {}); });
    return () => {
      disposed = true;
      void listener.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  const run = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    try {
      setError('');
      await getCurrentWindow()[action]();
      if (action === 'toggleMaximize') setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      setError('窗口操作失败，请重试');
    }
  };

  return (
    <>
      <header className="window-titlebar" aria-label="窗口控制">
        <div className="window-drag-region" data-tauri-drag-region />
        <button type="button" aria-label="最小化" title="最小化" onClick={() => void run('minimize')}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6.5h10" /></svg>
        </button>
        <button type="button" aria-label={maximized ? '还原' : '最大化'} title={maximized ? '还原' : '最大化'} onClick={() => void run('toggleMaximize')}>
          <svg viewBox="0 0 12 12" aria-hidden="true">{maximized ? <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" /> : <rect x="1.5" y="1.5" width="9" height="9" />}</svg>
        </button>
        <button type="button" className="window-close" aria-label="关闭窗口" title="关闭窗口" onClick={() => void run('close')}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m1.5 1.5 9 9m0-9-9 9" /></svg>
        </button>
      </header>
      {error && <div className="window-action-error" role="alert" onClick={() => setError('')}>{error}</div>}
    </>
  );
}
