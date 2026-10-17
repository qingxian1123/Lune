import { useState } from 'react';
import { useTheme } from '../app/ThemeProvider';

interface AlbumSilhouetteProps {
  coverUrl?: string;
}

/** Mounted behind the whole room so every glass surface samples the same artwork. */
export default function AlbumSilhouette({ coverUrl }: AlbumSilhouetteProps) {
  const { theme } = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (theme !== 'frosted' || !coverUrl || failedUrl === coverUrl) return null;

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
