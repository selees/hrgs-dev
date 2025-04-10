#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]
mod bluetooth;
mod state;
mod osc;
mod midi;

use state::BluetoothState;
use bluetooth::{scan_bluetooth_devices, connect_bluetooth, disconnect_bluetooth};
use std::sync::{Arc, Mutex};
use directories::UserDirs;
use uuid::Uuid;
use serde::{Serialize, Deserialize};
use std::fs; // fs 모듈 임포트 추가

#[derive(Serialize, Deserialize, Clone, Default)]
struct Config {
    mode: String,
    widget_id: String,
    max_hr: f32,
    osc_ip: String,
    osc_port: u16,
    hr_percent_address: String,
    hr_connected_address: String,
    midi_port: String,
    timeout: u32,
    bluetooth_device_id: String,
}

#[tauri::command]
async fn save_config(config: Config) -> Result<(), String> {
    let user_dirs = UserDirs::new().ok_or("Failed to get user directories")?;
    let documents_path = user_dirs.document_dir().ok_or("Failed to get documents directory")?;
    let config_path = documents_path.join("config.json");
    fs::create_dir_all(documents_path).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn load_config() -> Result<Config, String> {
    let user_dirs = UserDirs::new().ok_or("Failed to get user directories")?;
    let documents_path = user_dirs.document_dir().ok_or("Failed to get documents directory")?;
    let config_path = documents_path.join("config.json");

    match fs::read_to_string(&config_path) {
        Ok(json) => {
            let config: Config = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(config)
        }
        Err(_) => {
            let default_config = Config {
                mode: "bluetooth".to_string(),
                widget_id: "".to_string(),
                max_hr: 200.0,
                osc_ip: "127.0.0.1".to_string(),
                osc_port: 9000,
                hr_percent_address: "/avatar/parameters/hr_percent".to_string(),
                hr_connected_address: "/avatar/parameters/hr_connected".to_string(),
                midi_port: "hroscmidi".to_string(),
                timeout: 10,
                bluetooth_device_id: "".to_string(),
            };

            save_config(default_config.clone()).await.map_err(|e| format!("Failed to save default config: {}", e))?;

            Ok(default_config)
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct GetWidgetResponse {
    id: String,
    jsonrpc: String,
    result: Option<RamielUrlResult>,
    error: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
struct RamielUrlResult {
    ramiel_url: String,
}

#[tauri::command]
async fn get_websocket_url(widget_id: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let request_id = Uuid::new_v4().to_string();

    let request_body = serde_json::json!({
        "id": request_id,
        "jsonrpc": "2.0",
        "method": "getWidget",
        "params": { "widgetId": widget_id },
    });

    let response = client
        .post("https://api.stromno.com/v1/api/public/rpc")
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if response.status() != reqwest::StatusCode::OK {
        return Ok("".to_string());
    }

    let response_data: GetWidgetResponse = response.json().await.map_err(|e| e.to_string())?;

    if response_data.error.is_some() {
        return Ok("".to_string());
    }

    Ok(response_data.result.map_or("".to_string(), |r| r.ramiel_url))
}

fn main() {
    tauri::Builder::default()
        .manage(BluetoothState {
            devices: Arc::new(Mutex::new(Vec::new())),
            connected_device: Arc::new(Mutex::new(None)),
        })
        .manage(midi::MidiState {
            midi_conn: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            scan_bluetooth_devices,
            connect_bluetooth,
            disconnect_bluetooth,
            get_websocket_url,
            osc::send_osc,
            osc::send_osc_bool,
            midi::send_midi_note,
            midi::send_midi_heartrate,
            save_config,
            load_config
        ])
        .plugin(tauri_plugin_http::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}