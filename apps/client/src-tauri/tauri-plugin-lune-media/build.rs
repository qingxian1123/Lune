const COMMANDS: &[&str] = &["start", "update", "stop", "registerListener", "removeListener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
