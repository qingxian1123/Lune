/** Convert transport and server errors into short, user-facing messages. */
export function getUiErrorMessage(error: unknown, fallback = '操作没有完成，请稍后再试') {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const message = raw.toLowerCase();

  if (message.includes('timeout') || message.includes('network') || message.includes('fetch')) {
    return '网络不稳定，请稍后再试';
  }
  if (message.includes('unauthorized') || message.includes('token') || message.includes('401')) {
    return '连接已过期，请重新加入房间';
  }
  if (message.includes('not found') || message.includes('404') || raw.includes('不存在')) {
    return '找不到这个房间，请核对房间码';
  }
  if (message.includes('full') || raw.includes('已满')) {
    return '房间人数已满';
  }
  if (message.includes('websocket') || message.includes('socket') || raw.includes('断开')) {
    return '连接已断开，正在重连…';
  }
  if (raw.includes('版权') || raw.includes('无法播放')) {
    return '这首歌暂时无法播放';
  }

  return fallback;
}
