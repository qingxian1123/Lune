import { useEffect, useMemo, useState } from 'react';
import { getLyric } from '../lib/api';
/**
 * 按 track.id 拉歌词,并据当前播放时间(毫秒)算高亮行。
 */
export function useLyric(trackId, currentMs, provider) {
    const [lines, setLines] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    useEffect(() => {
        setLines([]);
        setIsLoading(Boolean(trackId));
        if (!trackId)
            return;
        let alive = true;
        getLyric(trackId, provider)
            .then((r) => {
            if (alive)
                setLines(r.lines);
        })
            .catch(() => {
            if (alive)
                setLines([]);
        })
            .finally(() => {
            if (alive)
                setIsLoading(false);
        });
        return () => {
            alive = false;
        };
    }, [trackId, provider]);
    const currentIndex = useMemo(() => {
        if (lines.length === 0)
            return -1;
        const sec = currentMs / 1000;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].time <= sec)
                idx = i;
            else
                break;
        }
        return idx;
    }, [lines, currentMs]);
    return { lines, currentIndex, isLoading };
}
