//! Lune 媒体会话插件。
//!
//! Android:注册原生 MediaPlugin(前台服务 + MediaSessionCompat 通知),
//! 保证锁屏/切后台时 WebView 内的同步与音频持续运行,并把通知栏动作
//! (favorite / next / leave)以 `action` 事件回传给前端。
//!
//! 桌面端:注册为空壳,前端调用同一 API 时安全降级。

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("lune-media")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            api.register_android_plugin("com.lune.app.media", "MediaPlugin")?;
            #[cfg(not(target_os = "android"))]
            let _ = api;
            Ok(())
        })
        .build()
}
