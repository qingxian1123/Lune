import { useState } from 'react';

interface AlbumSilhouetteProps {
  coverUrl?: string;
}

/** Artwork behind the viewing stage. A missing or failed cover leaves the shell color. */
export default function AlbumSilhouette({ coverUrl }: AlbumSilhouetteProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!coverUrl || failedUrl === coverUrl) return null;

  return (
    <div key={coverUrl} className="album-silhouette" aria-hidden="true">
      <img
        className="album-silhouette-ambient"
        src={coverUrl}
        alt=""
        decoding="async"
        draggable={false}
        onError={() => setFailedUrl(coverUrl)}
      />
      <img
        className="album-silhouette-artwork"
        src={coverUrl}
        alt=""
        decoding="async"
        draggable={false}
        onError={() => setFailedUrl(coverUrl)}
      />
    </div>
  );
}
