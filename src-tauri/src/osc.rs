use rosc::{OscMessage, OscPacket, OscType};
use std::net::UdpSocket;

#[tauri::command]
pub async fn send_osc(ip: String, port: u16, address: String, value: f32) -> Result<(), String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    let destination = format!("{}:{}", ip, port);

    let msg = OscMessage {
        addr: address,
        args: vec![OscType::Float(value)],
    };
    let packet = OscPacket::Message(msg);
    let encoded = rosc::encoder::encode(&packet).map_err(|e| e.to_string())?;
    socket.send_to(&encoded, &destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn send_osc_bool(ip: String, port: u16, address: String, value: bool) -> Result<(), String> {
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    let destination = format!("{}:{}", ip, port);

    let msg = OscMessage {
        addr: address,
        args: vec![OscType::Bool(value)],
    };
    let packet = OscPacket::Message(msg);
    let encoded = rosc::encoder::encode(&packet).map_err(|e| e.to_string())?;
    socket.send_to(&encoded, &destination).map_err(|e| e.to_string())?;
    Ok(())
}