# Lune 文档

这里仅保留与当前实现一致的使用和维护资料。共享类型、环境变量示例和部署模板是文档之外的最终依据；修改相关行为时应同步更新对应文档。

## 系统

- [系统架构](ARCHITECTURE.md)：模块边界、请求链路、状态与安全模型
- [WebSocket 同步协议](SYNC_PROTOCOL.md)：连接、消息、版本控制与重连语义

## 音乐源

- [Provider 配置与开发](PROVIDERS.md)：配置、登录、管理 API 和新 Provider 接入

## 客户端

- [Linux 开发与构建](linux.md)：桌面端准备、依赖、打包与验收
- [Android 开发与构建](android.md)：环境、签名、调试与打包
- [Android 后台播放](android-background-audio.md)：后台服务、媒体控制和系统中断行为
- [产品定义](../apps/client/PRODUCT.md)
- [界面设计系统](../apps/client/DESIGN.md)

## 部署

- [服务端部署与运维](DEPLOYMENT.md)：发布包、systemd、Nginx、升级和备份
- [部署目录说明](../server-deploy/README.md)：`server-deploy/` 模板内容与本地打包命令
