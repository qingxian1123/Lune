import assert from 'node:assert/strict';
import KugouMusicApi from 'kugoumusicapi';
import { KugouApiService } from '../src/providers/kugou/kugou-api.service';
import { KugouProvider } from '../src/providers/kugou/kugou.provider';

async function main(): Promise<void> {
const upstream = KugouMusicApi as unknown as Record<string, (...args: any[]) => Promise<any>>;
for (const name of ['search', 'song_url', 'search_lyric', 'lyric', 'playlist_track_all', 'createRequest']) {
  assert.equal(typeof upstream[name], 'function', `missing programmatic export: ${name}`);
}

const originalSearch = upstream.search;
process.env.KUGOU_COOKIE = 'token=test;userid=1;dfid=test';
try {
  upstream.search = async (params) => {
    assert.equal(params.cookie, process.env.KUGOU_COOKIE);
    return { body: { status: 1, data: { lists: [] } } };
  };
  const service = new KugouApiService();
  const body = await service.search({ keywords: '月光' });
  assert.deepEqual(body, { status: 1, data: { lists: [] } });
} finally {
  upstream.search = originalSearch;
  delete process.env.KUGOU_COOKIE;
}

class FakeKugouApi {
  async search(params: Record<string, unknown>) {
    if (params.type === 'special') {
      return {
        status: 1,
        data: {
          lists: [{
            specialid: 42,
            specialname: '测试歌单',
            img: '//img.example/{size}/playlist.jpg',
            songcount: 1,
            nickname: 'Lune',
          }],
        },
      };
    }
    return {
      status: 1,
      data: {
        lists: [{
          FileHash: 'ABCDEF0123456789ABCDEF0123456789',
          SongName: '<em>月光</em>',
          SingerName: '测试歌手',
          AlbumName: '测试专辑',
          AlbumID: 7,
          AlbumAudioID: 8,
          Duration: 245,
          Image: '//img.example/{size}/cover.jpg',
        }],
      },
    };
  }

  async songUrl() {
    return {
      status: 1,
      data: {
        hash: 'ABCDEF0123456789ABCDEF0123456789',
        song_name: '月光',
        author_name: '测试歌手',
        album_name: '测试专辑',
        timelength: 245000,
        img: 'https://img.example/cover.jpg',
        play_url: 'https://audio.example/moon.mp3',
      },
    };
  }

  async searchLyric() {
    return {
      status: 1,
      candidates: [{ id: 'lyric-1', accesskey: 'access-1' }],
    };
  }

  async lyric() {
    return {
      status: 1,
      decodeContent: '[00:01.50]第一行\n[00:05.000]第二行',
    };
  }

  async playlistSpecialTracks(params: Record<string, unknown>) {
    assert.equal(params.specialid, '42');
    return {
      status: 1,
      data: {
        info: [{
          hash: '11111111111111111111111111111111',
          filename: '歌单歌手 - 歌单歌曲',
          remark: '歌单专辑',
          album_id: '9',
          album_audio_id: 10,
          duration: 180,
          trans_param: {
            union_cover: '//img.example/{size}/playlist-track.jpg',
          },
        }],
      },
    };
  }

  async playlistTrackAll() {
    throw new Error('specialid 不应调用 global_collection_id 接口');
  }
}

const provider = new KugouProvider(new FakeKugouApi() as unknown as KugouApiService);
const search = await provider.search('月光');
assert.equal(search.songs.length, 1);
const track = search.songs[0];
assert.equal(track.provider, 'kugou');
assert.equal(track.name, '月光');
assert.equal(track.duration, 245000);
assert.match(track.id, /^kg_/);

const resolved = await provider.resolve(track.id);
assert.equal(resolved.url, 'https://audio.example/moon.mp3');
assert.equal(resolved.unplayable, false);
assert.equal(resolved.track.provider, 'kugou');

const lyric = await provider.lyric(track.id);
assert.deepEqual(lyric.lines, [
  { time: 1.5, text: '第一行' },
  { time: 5, text: '第二行' },
]);

const playlistSearch = await provider.searchPlaylists('测试');
assert.equal(playlistSearch.playlists[0].provider, 'kugou');
assert.equal(
  playlistSearch.playlists[0].coverUrl,
  'https://img.example/400/playlist.jpg',
);

const playlist = await provider.playlist('42');
assert.equal(playlist[0].provider, 'kugou');
assert.equal(playlist[0].name, '歌单歌曲');
assert.equal(playlist[0].artists, '歌单歌手');
assert.equal(playlist[0].album, '歌单专辑');
assert.equal(playlist[0].coverUrl, 'https://img.example/400/playlist-track.jpg');

console.log('Kugou in-process provider test passed');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
