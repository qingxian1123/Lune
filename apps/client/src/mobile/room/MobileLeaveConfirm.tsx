interface MobileLeaveConfirmProps {
  open: boolean;
  onCancel: () => void;
  onLeave: () => void;
}

export default function MobileLeaveConfirm({
  open,
  onCancel,
  onLeave,
}: MobileLeaveConfirmProps) {
  if (!open) return null;

  return (
    <>
      <div className="m-confirm-scrim" onClick={onCancel} aria-hidden="true" />
      <div className="m-confirm" role="alertdialog" aria-label="离开房间确认">
        <strong>离开房间？</strong>
        <p>离开后将停止本机播放。</p>
        <div className="m-confirm-actions">
          <button type="button" className="m-confirm-cancel" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="m-confirm-leave" onClick={onLeave}>
            离开房间
          </button>
        </div>
      </div>
    </>
  );
}
