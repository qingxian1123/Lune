import { useRef, type ReactNode } from 'react';
import { useClientRuntime } from '../../app/ClientRuntimeProvider';
import WindowTitlebar from '../WindowTitlebar';

interface Props {
  roomCode: string;
  memberCount: number;
  copied: boolean;
  connected: boolean;
  presentation?: 'compact' | 'workspace';
  onCopyCode: () => void;
  onLeave: () => void;
  children: ReactNode;
}

function formatRoomCode(code: string) {
  const compact = code.replace(/\s+/g, '');
  if (/^\d{6}$/.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  return code;
}

export default function DesktopRoomMembers({
  roomCode,
  memberCount,
  copied,
  connected,
  presentation = 'compact',
  onCopyCode,
  onLeave,
  children,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const isWindows = useClientRuntime().kind === 'windows';
  const workspace = presentation === 'workspace';
  return (
    <div className={workspace ? 'desktop-members workspace-members lune-scrollbar' : 'desktop-members'}>
      <section className={workspace ? 'workspace-room-card' : 'member-invite'} aria-label="邀请朋友">
        <div>
          <span>房间码</span>
          <strong className="workspace-room-code">{formatRoomCode(roomCode)}</strong>
        </div>
        <button type="button" className="workspace-invite" onClick={onCopyCode} disabled={!roomCode} aria-label={copied ? '已复制房间码，点击再次复制' : undefined}>
          {copied ? '已复制' : '复制房间码'}
        </button>
        <span className="sr-only" role="status">{copied ? '房间码已复制' : ''}</span>
      </section>
      {workspace && connected && <p className="workspace-members-heading">{memberCount} 人在线</p>}
      {children}
      <footer className={workspace ? 'workspace-room-actions' : 'member-room-actions'}>
        <button type="button" onClick={() => dialog.current?.showModal()}>离开房间</button>
      </footer>
      <dialog ref={dialog} className="desktop-leave-dialog" aria-labelledby="desktop-leave-title" aria-describedby="desktop-leave-description">
        {isWindows && <WindowTitlebar />}
        <h2 id="desktop-leave-title">离开房间？</h2>
        <p id="desktop-leave-description">你这里的音乐会停止播放。</p>
        <div>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>取消</button>
          <button type="button" className="confirm-leave" onClick={() => { dialog.current?.close(); onLeave(); }}>离开房间</button>
        </div>
      </dialog>
    </div>
  );
}
