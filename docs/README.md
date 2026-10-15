# Lune 文档

仓库内保留使用与运维资料；环境变量示例和部署模板是配置的最终依据。开发设计、内部协议、平台构建及验收记录保留在本地，不纳入 Git。

## 使用

- [使用说明](USAGE.md)：连接服务、加入房间、选歌、音量与 Android 后台播放
- [播放与连接故障处理](playback-reliability.md)：自动恢复、手动处理、身份失效与诊断导出

## 部署与运维

- [Docker Compose 部署](../server-deploy/README.compose.md)：Linux 云服务器、Caddy 或已有反向代理、管理入口
- [服务端部署与运维](DEPLOYMENT.md)：发布包、systemd、Nginx、升级和备份
- [音乐源配置与管理](PROVIDERS.md)：音源启用、账号登录、健康检查和管理接口
- [部署目录说明](../server-deploy/README.md)：部署模板、发布目录与运行命令

## 文档维护约定

对外文档只描述当前行为，并明确尚未完成的运行验收。文档截图放在 `docs/images/`。

内部开发资料统一放在本地 `docs/development/`；供开发工具读取的 `apps/client/PRODUCT.md` 和 `apps/client/DESIGN.md` 保留原位置。上述路径及自动生成的权限参考文档均由 `.gitignore` 排除。新克隆的仓库不会包含这些本地资料。
