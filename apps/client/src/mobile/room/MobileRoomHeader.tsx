import type { Track } from '@lune/shared';
import type { MobileRoomView } from './types';

interface MobileRoomHeaderProps {
  view: MobileRoomView;
  track: Track | null | undefined;
  connected: boolean;
  membersCount: number;
  onOpenMembers: () => void;
  onRequestLeave: () => void;
}

export default function MobileRoomHeader({
  view,
  track,
  connected,
  membersCount,
  onOpenMembers,
  onRequestLeave,
}: MobileRoomHeaderProps) {
  return (
    <header className="m-room-top">
      {view === 'lyrics' ? (
        <>
          <div className="m-top-track">
            <strong>{track?.name || '还没有音乐'}</strong>
            {track?.artists && <small>{track.artists}</small>}
          </div>
          <button type="button" className="m-listeners" onClick={onOpenMembers}>
            <span className={`m-dot ${connected ? 'is-on' : ''}`} />
            {connected ? '同步中' : '连接中'}
          </button>
        </>
      ) : (
        <>
          <div className="m-brand-lockup" aria-hidden="true">
            <span>LUNE</span>
          </div>
          <div className="m-top-right">
            <button type="button" className="m-listeners" onClick={onOpenMembers}>
              <span className={`m-dot ${connected ? 'is-on' : ''}`} />
              {connected ? `${membersCount} 人在听` : '正在连接'}
            </button>
            <button
              type="button"
              className="m-ghost-btn"
              onClick={onRequestLeave}
              aria-label="离开房间"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M15 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
                <path
                  d="M11 12h9m0 0-3.2-3.2M20 12l-3.2 3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </>
      )}
    </header>
  );
}
