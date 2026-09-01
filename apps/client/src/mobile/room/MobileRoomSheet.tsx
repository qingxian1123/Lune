import type { CSSProperties } from 'react';
import type { Member, QueueItem, Track } from '@lune/shared';
import MemberList from '../../components/MemberList';
import SearchPanel from '../../components/SearchPanel';
import VolumeIcon from '../../components/VolumeIcon';
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
  queue: QueueItem[];
  currentTrackId?: string;
  members: Member[];
  ownerId: string;
  roomCode: string;
  copied: boolean;
  canShare: boolean;
  volume: number;
  muted: boolean;
  onClose: () => void;
  onPickTrack: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
  onRemove: (itemId: string) => void;
  onReorder: (itemId: string, beforeItemId: string | null) => void;
  onCopyCode: () => void;
  onShareCode: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
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
  muted,
  onClose,
  onPickTrack,
  onAddMany,
  onRemove,
  onReorder,
  onCopyCode,
  onShareCode,
  onVolumeChange,
  onToggleMute,
}: MobileRoomSheetProps) {
  const { sheetRef, onTouchStart, onTouchMove, onTouchEnd } = useDismissibleSheet(onClose);
  const volumeStyle = { '--m-progress': `${volume * 100}%` } as CSSProperties;
  const volumePercent = Math.round(volume * 100);

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
              <div className="m-vol-control">
                <button
                  type="button"
                  className={`m-vol-toggle ${muted ? 'is-muted' : ''}`}
                  onClick={onToggleMute}
                  aria-label={muted ? '恢复本机音量' : '静音本机播放'}
                  aria-pressed={muted}
                >
                  <VolumeIcon volume={volume} muted={muted} />
                </button>
                <div className="m-vol-level">
                  <label className="m-progress" style={volumeStyle}>
                    <span className="sr-only">本机音量</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={(event) => onVolumeChange(Number(event.target.value))}
                      aria-label="本机音量"
                      aria-valuetext={muted ? '静音' : `${volumePercent}%`}
                    />
                  </label>
                  <div className="m-vol-caption">
                    <span>只影响你自己的设备</span>
                    <output aria-hidden="true">{volumePercent}%</output>
                  </div>
                </div>
              </div>
              <p className="m-vol-system-note">手机侧键控制系统媒体音量</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
