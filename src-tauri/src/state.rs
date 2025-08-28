use btleplug::platform::Peripheral;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct BluetoothState {
    pub devices: Arc<Mutex<Vec<Arc<Peripheral>>>>, // 스캔된 모든 디바이스
    pub connected_device: Arc<Mutex<Option<Arc<Peripheral>>>>, // 현재 연결된 디바이스 (None이면 연결 없음)
}

impl BluetoothState {
    /*pub fn new() -> Self {
        BluetoothState {
            devices: Arc::new(Mutex::new(Vec::new())),
            connected_device: Arc::new(Mutex::new(None)),
        }
    }*/
}
