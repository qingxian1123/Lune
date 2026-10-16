import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Track } from '@lune/shared';
import { getServerBaseUrl } from '../../lib/serverConfig';
import { libraryTrackKey, useListeningLibrary } from './useListeningLibrary';
import './library.css';

export function BookmarkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v16l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg>;
}

export default function FavoriteButton({ track, server = getServerBaseUrl() }: { track: Track | null | undefined; server?: string }) {
  const saved = useListeningLibrary((state) => !!track && state.favorites.some((item) =>
    item.server === server && libraryTrackKey(item.track) === libraryTrackKey(track)));
  const toggle = useListeningLibrary((state) => state.toggleFavorite);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [error]);
  const label = saved ? '取消收藏' : '收藏到本机';
  return <span className="library-save-wrap">
    <button type="button" className={`library-save ${saved ? 'is-saved' : ''}`}
      disabled={!track} aria-pressed={saved} aria-label={track ? `${label}《${track.name}》` : label}
      title={label} onClick={(event) => {
        event.stopPropagation();
        if (track) { toggle(server, track); setError(useListeningLibrary.getState().storageError); }
      }}>
      <BookmarkIcon />
    </button>
    {error && createPortal(<span className="library-save-error" role="alert">{error}</span>, document.body)}
  </span>;
}
