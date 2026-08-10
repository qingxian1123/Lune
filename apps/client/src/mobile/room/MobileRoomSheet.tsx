import type { CSSProperties } from 'react';
import type { Member, Track } from '@lune/shared';
import MemberList from '../../components/MemberList';
import SearchPanel from '../../components/SearchPanel';
import { useDismissibleSheet } from '../../features/room/useDismissibleSheet';
import MobileQueue from '../MobileQueue';
import type { MobileRoomSheet as SheetKind, MobileRoomSheetState } from './types';

const SHEET_TITLES: Record<SheetKind, string> = {
  search: '搜索音乐',
  queue: '播放队列',
  members: '房间成员',
  volume: '本机音量',
};

interface MobileRoomSheetProps {
  sheet: MobileRoomSheetState;
  queue: Track[];
  currentTrackId?: string;
  members: Member[];
  ownerId: string;
  roomCode: string;
  copied: boolean;
  canShare: boolean;
  volume: number;
  onClose: () => void;
  onPickTrack: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onCopyCode: () => void;
  onShareCode: () => void;
  onVolumeChange: (volume: number) => void;
}

export default function MobileRoomSheet({
  sheet,
  queue,
  currentTrackId,
  members,
  ownerId,
  roomCode,
  copied,
  canShare,
  volume,
  onClose,
  onPickTrack,
  onAddMany,
  onRemove,
  onReorder,
  onCopyCode,
  onShareCode,
  onVolumeChange,
}: MobileRoomSheetProps) {
  const { sheetRef, onTouchStart, onTouchMove, onTouchEnd } = useDismissibleSheet(onClose);
  const volumeStyle = { '--m-progress': `${volume * 100}%` } as CSSProperties;

  return (
    <>
      <div className={`m-scrim ${sheet ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />

      <div
        ref={sheetRef}
        className={`m-sheet ${sheet ? 'is-open' : ''} ${sheet === 'search' ? 'is-tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={sheet ? SHEET_TITLES[sheet] : undefined}
      >
        <div
          className="m-sheet-drag-zone"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="m-grab" aria-hidden="true" />
        </div>
        {sheet && (
          <div className="m-sheet-head">
            <div>
              <strong>
                {SHEET_TITLES[sheet]}
                {sheet === 'queue' && ` · ${queue.length}`}
                {sheet === 'members' && ` · ${members.length}`}
              </strong>
            </div>
          </div>
        )}
        <div className="m-sheet-body">
          {sheet === 'search' && (
            <SearchPanel onPick={onPickTrack} onAddMany={onAddMany} providerPicker="pills" />
          )}
          {sheet === 'queue' && (
            <MobileQueue
              queue={queue}
              currentTrackId={currentTrackId}
              onRemove={onRemove}
              onReorder={onReorder}
            />
          )}
          {sheet === 'members' && (
            <>
              <div className="m-invite-card">
                <strong className="m-invite-code">{roomCode}</strong>
                <small>输入房间码即可加入</small>
                <div className="m-invite-actions">
                  <button type="button" onClick={onCopyCode}>
                    {copied ? '已复制' : '复制房间码'}
                  </button>
                  {canShare && (
                    <button type="button" onClick={onShareCode}>
                      分享
                    </button>
                  )}
                </div>
              </div>
              <MemberList members={members} ownerId={ownerId} />
            </>
          )}
          {sheet === 'volume' && (
            <div className="m-vol-body">
              <label className="m-progress" style={volumeStyle}>
                <span className="sr-only">音量</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(event) => onVolumeChange(Number(event.target.value))}
                  aria-label="音量"
                />
              </label>
              <div className="m-vol-caption">
                <span>只影响你自己的设备</span>
                <span>{Math.round(volume * 100)}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
