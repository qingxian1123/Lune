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
    <div className={workspace ? 'desktop-members workspace-members' : 'desktop-members'}>
      {workspace ? (
        <section className="workspace-room-card" aria-label="房间邀请码">
          <div>
            <strong className="workspace-room-code">{formatRoomCode(roomCode)}</strong>
            {!connected && <small role="status">正在连接房间…</small>}
          </div>
          <p className="workspace-room-presence"><i aria-hidden="true" />{memberCount} 人在线</p>
        </section>
      ) : (
        <section className="member-invite" aria-label="邀请朋友">
          <span>房间邀请码</span>
          <div>
            <strong>{roomCode}</strong>
            <button type="button" onClick={onCopyCode} disabled={!roomCode} aria-label="复制房间邀请码"><span role="status">{copied ? '已复制' : '复制'}</span></button>
          </div>
          {!connected && <small role="status">正在连接房间…</small>}
        </section>
      )}
      {workspace && <h3 className="workspace-members-heading">在线成员</h3>}
      {children}
      <footer className={workspace ? 'workspace-room-actions' : 'member-room-actions'}>
        <button type="button" onClick={() => dialog.current?.showModal()}>离开房间</button>
      </footer>
      <dialog ref={dialog} className="desktop-leave-dialog" aria-labelledby="desktop-leave-title" aria-describedby="desktop-leave-description">
        {isWindows && <WindowTitlebar />}
        <h2 id="desktop-leave-title">离开房间？</h2>
        <p id="desktop-leave-description">离开后将停止本机播放。</p>
        <div>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>取消</button>
          <button type="button" className="confirm-leave" onClick={() => { dialog.current?.close(); onLeave(); }}>离开房间</button>
        </div>
      </dialog>
    </div>
  );
}
