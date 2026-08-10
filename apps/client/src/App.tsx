import { Routes, Route } from 'react-router-dom';
import { ClientRuntimeProvider, useClientRuntime } from './app/ClientRuntimeProvider';
import Home from './pages/Home';
import Room from './pages/Room';
import MobileHome from './mobile/MobileHome';
import MobileRoom from './mobile/MobileRoom';
import './mobile/mobile.css';

function AppRoutes() {
  const runtime = useClientRuntime();
  const isMobile = runtime.layout === 'mobile';

  return (
    <Routes>
      <Route path="/" element={isMobile ? <MobileHome /> : <Home />} />
      <Route path="/room/:code" element={isMobile ? <MobileRoom /> : <Room />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ClientRuntimeProvider>
      <AppRoutes />
    </ClientRuntimeProvider>
  );
}
