import { Routes, Route } from 'react-router-dom';
import { ClientRuntimeProvider, useClientRuntime } from './app/ClientRuntimeProvider';
import Home from './pages/Home';
import Room from './pages/Room';
import MobileHome from './mobile/MobileHome';
import MobileRoom from './mobile/MobileRoom';
import './mobile/mobile.css';
import WindowTitlebar from './desktop/WindowTitlebar';
import './desktop/desktop.css';

function AppRoutes() {
  const runtime = useClientRuntime();
  const isMobile = runtime.layout === 'mobile';
  const isWindows = runtime.kind === 'windows';

  return (
    <div className={isWindows ? 'windows-shell' : undefined}>
      {isWindows && <WindowTitlebar />}
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
      <AppRoutes />
    </ClientRuntimeProvider>
  );
}
