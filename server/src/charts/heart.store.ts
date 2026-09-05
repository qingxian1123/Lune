import { existsSync, readFileSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HotChart, Track } from '@lune/shared';

export const HEART_WINDOW_MS = 168 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
interface HeartTrack {
  track: Track;
  lifetimeHeartCount: number;
  // Timestamp/count pairs preserve the exact rolling cutoff, including partial hours.
  hourlyHeartCounts: Record<string, Array<[number, number]>>;
  lastHeartAt: number;
}
interface HeartData {
  version: 1;
  tracks: Record<string, HeartTrack>;
  requests: Record<string, { key: string; at: number }>;
}

/** One writer per LUNE_DATA_DIR. Publish in-memory state only after atomic persistence. */
export class HeartStore {
  private data: HeartData = { version: 1, tracks: {}, requests: {} };
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf8')) as HeartData;
      if (data.version !== 1 || !data.tracks || !data.requests) throw new Error('Invalid heart data');
      this.data = data; // Fail startup on corruption; never silently reset historical counts.
    }
  }

  record(requestId: string, track: Track, now = Date.now()): Promise<void> {
    const operation = this.writes.then(async () => {
      const key = JSON.stringify([track.provider, track.id]);
      const previous = this.data.requests[requestId];
      if (previous) {
        if (previous.key !== key) throw new Error('Request ID already used for another track');
        return;
      }
      const next = structuredClone(this.data);
      for (const entry of Object.values(next.tracks)) {
        for (const [hour, counts] of Object.entries(entry.hourlyHeartCounts)) {
          const recent = counts.filter(([at]) => at > now - HEART_WINDOW_MS);
          if (recent.length) entry.hourlyHeartCounts[hour] = recent;
          else delete entry.hourlyHeartCounts[hour];
        }
      }
      // Deduplication survives restarts for the entire chart window.
      for (const [id, request] of Object.entries(next.requests)) {
        if (request.at <= now - HEART_WINDOW_MS) delete next.requests[id];
      }
      const entry = next.tracks[key] ??= {
        track, lifetimeHeartCount: 0, hourlyHeartCounts: {}, lastHeartAt: now,
      };
      entry.track = { ...track };
      entry.lifetimeHeartCount += 1;
      entry.lastHeartAt = now;
      const bucket = entry.hourlyHeartCounts[String(Math.floor(now / HOUR))] ??= [];
      const last = bucket[bucket.length - 1];
      if (last?.[0] === now) last[1] += 1;
      else bucket.push([now, 1]);
      next.requests[requestId] = { key, at: now };
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.tmp`;
      try {
        const file = await open(temporary, 'w', 0o600);
        try {
          await file.writeFile(JSON.stringify(next), 'utf8');
          await file.sync();
        } finally { await file.close(); }
        await rename(temporary, this.path);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {});
        throw error;
      }
      this.data = next;
    });
    this.writes = operation.catch(() => {});
    return operation;
  }

  chart(provider = 'all', limit = 20, now = Date.now()): HotChart {
    const rows = Object.entries(this.data.tracks).flatMap(([key, entry]) => {
      if (provider !== 'all' && entry.track.provider !== provider) return [];
      const heartCount = Object.values(entry.hourlyHeartCounts).flat().reduce(
        (sum, [at, count]) => sum + (at > now - HEART_WINDOW_MS && at <= now ? count : 0), 0,
      );
      return heartCount ? [{ key, entry, heartCount }] : [];
    });
    rows.sort((a, b) => b.heartCount - a.heartCount || b.entry.lastHeartAt - a.entry.lastHeartAt ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return {
      window: '7d', generatedAt: new Date(now).toISOString(),
      tracks: rows.slice(0, Math.max(1, Math.min(50, limit))).map(({ entry, heartCount }, index) => ({
        rank: index + 1, track: { ...entry.track }, heartCount,
        lastHeartAt: new Date(entry.lastHeartAt).toISOString(),
      })),
    };
  }
}
