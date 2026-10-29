import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { ClientRuntimeProvider, useClientRuntime } from './app/ClientRuntimeProvider';
import { ThemeProvider } from './app/ThemeProvider';
import Home from './pages/Home';
import Room from './pages/Room';
import MobileHome from './mobile/MobileHome';
import MobileRoom from './mobile/MobileRoom';
import './mobile/mobile.css';
import WindowTitlebar from './desktop/WindowTitlebar';
import './desktop/desktop.css';
import './features/access/radio-home.css';
import './features/access/windows-invitation.css';

let windowLayoutUpdate = Promise.resolve();

function AppRoutes() {
  const runtime = useClientRuntime();
  const isMobile = runtime.layout === 'mobile';
  const isWindows = runtime.kind === 'windows';
  const isHome = useLocation().pathname === '/';

  useEffect(() => {
    if (!isWindows) return;
    windowLayoutUpdate = windowLayoutUpdate.catch(() => {}).then(async () => {
      const appWindow = getCurrentWindow();
      if (await appWindow.isMaximized()) await appWindow.unmaximize();
      await appWindow.setResizable(!isHome);
      await appWindow.setSize(new LogicalSize(isHome ? 700 : 960, isHome ? 420 : 640));
      await appWindow.center();
    }).catch((error: unknown) => { console.error('无法调整窗口大小', error); });
  }, [isWindows, isHome]);

  return (
    <div className={isWindows ? 'windows-shell' : undefined}>
      {isWindows && !isHome && <WindowTitlebar />}
      <Routes>
      <Route path="/" element={isMobile ? <MobileHome /> : <Home />} />
      <Route path="/room/:code" element={isMobile ? <MobileRoom /> : <Room />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <ClientRuntimeProvider>
      <ThemeProvider><AppRoutes /></ThemeProvider>
    </ClientRuntimeProvider>
  );
}
