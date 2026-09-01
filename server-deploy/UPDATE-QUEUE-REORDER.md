# 待播队列排序功能服务端升级说明

> 历史说明：本文记录 2026-07-17 的下标版排序协议。当前源码已升级为
> `QueueItem.id` + `reorder_queue_item` + 原子 `room_state_changed` 协议，部署时客户端与服务端必须同步升级。

构建日期：2026-07-17

## 本次服务端变更

- 新增 WebSocket 消息 `reorder_song`，允许已加入房间的所有成员调整待播队列顺序。
- `queue_updated` 增加 `queueRevision`，防止多人同时拖动时按过期下标移动错误歌曲。
- 房间快照增加 `queueRevision`，新成员加入后可立即使用正确的队列版本。
- 队列仍为内存状态；服务重启后房间和队列清空。
- 没有新增服务端生产依赖，已有部署不需要重新安装 npm 包。

## 推荐升级顺序

先升级服务端，再发布新版客户端。新版客户端依赖新的 `queueRevision` 协议；旧版客户端可继续接收带额外字段的服务端消息。

## 已有服务器升级

假设现有目录为 `/opt/lune/server-deploy`：

```bash
cd /opt/lune/server-deploy
cp -a dist "dist.backup-$(date +%Y%m%d-%H%M%S)"
unzip -o lune-server-reorder-20260717.zip -d update-20260717
cp -a update-20260717/dist/. dist/
pm2 restart lune
```

压缩包不包含 `.env`，服务器已有的 Cookie、端口和 JWT 密钥不会被覆盖。

## 验证

```bash
curl http://127.0.0.1:9527/api/health
pm2 logs lune --lines 50
```

健康检查应返回 `{"ok":true}`。随后用新版客户端进入同一房间，确认普通成员拖动后所有客户端显示相同顺序，并且“下一首”播放调整后的队首。

如升级异常，可把备份目录内容复制回 `dist/` 后执行 `pm2 restart lune` 回滚。
