use tauri::{AppHandle, State, Emitter};
use btleplug::api::{Central, Peripheral as _, Manager as _};
//use btleplug::platform::Peripheral;
use std::sync::{Arc};
use tokio::time;
use uuid::Uuid;
use futures_util::stream::StreamExt;
use crate::state::BluetoothState; // state 모듈에서 BluetoothState 가져오기

//const HEART_RATE_SERVICE_UUID: Uuid = Uuid::from_u128(0x0000180d_0000_1000_8000_00805f9b34fb);
const HEART_RATE_MEASUREMENT_UUID: Uuid = Uuid::from_u128(0x00002a37_0000_1000_8000_00805f9b34fb);

#[tauri::command]
pub async fn scan_bluetooth_devices(state: State<'_, BluetoothState>) -> Result<Vec<(String, String)>, String> {
    let manager = btleplug::platform::Manager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    let adapter = adapters.into_iter().next().ok_or("No Bluetooth adapter found".to_string())?;

    adapter.start_scan(btleplug::api::ScanFilter::default()).await.map_err(|e| e.to_string())?;
    time::sleep(std::time::Duration::from_secs(2)).await;

    let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
    let mut device_list = Vec::new();
    let mut stored_peripherals = Vec::new();

    for peripheral in peripherals {
        let properties = peripheral.properties().await.map_err(|e| e.to_string())?;
        if let Some(props) = properties {
            if let Some(local_name) = props.local_name {
                let id = peripheral.id().to_string();
                device_list.push((id.clone(), local_name));
                stored_peripherals.push(Arc::new(peripheral));
            }
        }
    }

    adapter.stop_scan().await.map_err(|e| e.to_string())?;
    *state.devices.lock().unwrap() = stored_peripherals;
    Ok(device_list)
}

#[tauri::command]
pub async fn connect_bluetooth(
    app_handle: AppHandle,
    state: State<'_, BluetoothState>,
    device_id: String,
) -> Result<(), String> {
    let peripheral = {
        let devices = state.devices.lock().unwrap();
        devices.iter().find(|p| p.id().to_string() == device_id)
            .cloned()
            .ok_or_else(|| format!("Device with ID '{}' not found", device_id))?
    };

    if !peripheral.is_connected().await.map_err(|e| e.to_string())? {
        peripheral.connect().await.map_err(|e| e.to_string())?;
    }

    peripheral.discover_services().await.map_err(|e| e.to_string())?;
    let characteristics = peripheral.characteristics();
    let hr_characteristic = characteristics
        .into_iter()
        .find(|c| c.uuid == HEART_RATE_MEASUREMENT_UUID)
        .ok_or("Heart Rate Measurement characteristic not found".to_string())?;

    peripheral.subscribe(&hr_characteristic).await.map_err(|e| e.to_string())?;
    app_handle.emit("bluetooth_connected", true).map_err(|e| e.to_string())?;

    // 현재 연결된 디바이스 업데이트
    *state.connected_device.lock().unwrap() = Some(peripheral.clone());

    let notification_stream = peripheral.notifications().await.map_err(|e| e.to_string())?;
    let app_handle_clone = app_handle.clone();
    let state_clone = state.inner().clone(); // State 복사

    tokio::spawn(async move {
        let mut stream = notification_stream;
        while let Some(data) = stream.next().await {
            let heart_rate = data.value[1] as f32;
            app_handle_clone.emit("heart_rate_update", heart_rate).unwrap();
        }
        // 스트림이 종료되면 연결 상태 초기화 (옵션)
        if let Ok(mut connected) = state_clone.connected_device.lock() {
            *connected = None;
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn disconnect_bluetooth(state: State<'_, BluetoothState>, device_id: String) -> Result<(), String> {
    let peripheral = {
        let devices = state.devices.lock().unwrap();
        devices.iter().find(|p| p.id().to_string() == device_id)
            .cloned()
            .ok_or_else(|| format!("Device with ID '{}' not found", device_id))?
    };

    if peripheral.is_connected().await.map_err(|e| e.to_string())? {
        // 구독 해제
        let characteristics = peripheral.characteristics();
        if let Some(hr_characteristic) = characteristics.into_iter().find(|c| c.uuid == HEART_RATE_MEASUREMENT_UUID) {
            if let Err(e) = peripheral.unsubscribe(&hr_characteristic).await {
                eprintln!("Failed to unsubscribe from characteristic: {}", e);
            }
        }

        // 연결 해제
        if let Err(e) = peripheral.disconnect().await {
            eprintln!("Failed to disconnect peripheral: {}", e);
        }

        // 상태 업데이트: 연결된 디바이스 초기화
        *state.connected_device.lock().unwrap() = None;
    }

    Ok(())
}