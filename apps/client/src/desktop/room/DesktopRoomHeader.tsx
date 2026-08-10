interface DesktopRoomHeaderProps {
  roomCode: string;
  copied: boolean;
  connected: boolean;
  membersCount: number;
  onCopyCode: () => void;
  onOpenLibrary: () => void;
  onLeave: () => void;
}

export default function DesktopRoomHeader({
  roomCode,
  copied,
  connected,
  membersCount,
  onCopyCode,
  onOpenLibrary,
  onLeave,
}: DesktopRoomHeaderProps) {
  return (
    <header className="room-topbar">
      <div className="room-brand">
        <span className="brand-mark">LUNE</span>
        <span className="brand-divider" />
        <button type="button" className="room-code" onClick={onCopyCode} title="复制房间码">
          <span>房间</span>
          <strong>{roomCode}</strong>
          <small>{copied ? '已复制' : '复制'}</small>
        </button>
      </div>

      <div className="room-actions">
        <div className="connection-state">
          <span className={connected ? 'is-connected' : ''} />
          <div>
            <strong>{connected ? `${membersCount} 人正在听` : '正在连接'}</strong>
            <small>{connected ? '同步播放' : '请稍候'}</small>
          </div>
        </div>
        <button type="button" className="mobile-panel-toggle" onClick={onOpenLibrary}>
          音乐库
        </button>
        <button type="button" className="leave-room" onClick={onLeave} aria-label="离开房间">
          <strong aria-hidden="true">×</strong>
        </button>
      </div>
    </header>
  );
}
