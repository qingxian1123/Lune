import { useLayoutEffect, useRef, useState } from 'react';
import type { BilibiliVideoSummary, Track } from '@lune/shared';
import { formatTime } from '../lib/format';
import './bilibili-video-search.css';

export interface BilibiliVideoRowsProps {
  videos: BilibiliVideoSummary[];
  pendingId: string | null;
  onOpen: (video: BilibiliVideoSummary, trigger: HTMLButtonElement) => void;
  available: boolean;
}

export function BilibiliVideoRows({ videos, pendingId, onOpen, available }: BilibiliVideoRowsProps) {
  return <>{videos.map((video) => (
    <li className="bilibili-video-row" key={video.id}>
      {video.coverUrl && <img alt="" src={video.coverUrl} loading="lazy" referrerPolicy="no-referrer" />}
      <div className="bilibili-video-copy">
        <strong title={video.name}>{video.name}</strong>
        <small>{[video.creator, '哔哩哔哩', video.duration ? formatTime(video.duration) : ''].filter(Boolean).join(' · ')}</small>
      </div>
      <button className="lune-control bilibili-video-action" type="button"
        disabled={!available || pendingId === video.id}
        aria-label={`选歌《${video.name}》`}
        onClick={(event) => onOpen(video, event.currentTarget)}>
        {pendingId === video.id ? '读取中' : '选歌'}
      </button>
    </li>
  ))}</>;
}

export interface BilibiliSelection {
  video: BilibiliVideoSummary;
  tracks: Track[];
}

export function BilibiliPartsView({ selection, available, onBack, onAddMany }: {
  selection: BilibiliSelection;
  available: boolean;
  onBack: () => void;
  onAddMany: (tracks: Track[]) => void;
}) {
  const { video, tracks } = selection;
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(0);
  const back = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { back.current?.focus({ preventScroll: true }); }, []);

  const all = picked.size === tracks.length;
  const toggle = (id: string) => {
    setSubmitted(0);
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return <section className="bilibili-parts" aria-label={`${video.name}的分 P`}>
    <button ref={back} className="bilibili-parts-back" type="button" onClick={onBack}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m10 4-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      返回搜索结果
    </button>
    <header className="bilibili-parts-heading">
      <h3>{video.name}</h3>
      <p>{[video.creator, `${tracks.length} P`].filter(Boolean).join(' · ')}</p>
    </header>
    <ul className="bilibili-parts-list lune-scrollbar">
      {tracks.map((track) => (
        <li key={track.id}>
          <label>
            <input type="checkbox" checked={picked.has(track.id)} onChange={() => toggle(track.id)} />
            <span>{track.name}</span>
            <time>{formatTime(track.duration)}</time>
          </label>
        </li>
      ))}
    </ul>
    <div className="bilibili-parts-actions">
      <button className="lune-control bilibili-video-action" type="button" onClick={() => {
        setPicked(all ? new Set() : new Set(tracks.map((track) => track.id)));
        setSubmitted(0);
      }}>{all ? '取消全选' : '全选'}</button>
      <button className="lune-control bilibili-video-action" type="button" disabled={!available || !picked.size} onClick={() => {
        onAddMany(tracks.filter((track) => picked.has(track.id)));
        setSubmitted(picked.size);
        setPicked(new Set());
      }}>{picked.size ? `加入所选（${picked.size}）` : '加入所选'}</button>
      <span className="sr-only" role="status">{submitted > 0 ? `已请求加入 ${submitted} 个分 P` : ''}</span>
    </div>
  </section>;
}
