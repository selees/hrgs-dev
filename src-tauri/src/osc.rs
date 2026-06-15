use rosc::{OscMessage, OscPacket, OscType};
use std::net::{ToSocketAddrs, UdpSocket};

#[tauri::command]
pub async fn send_osc(ip: String, port: u16, address: String, value: f32) -> Result<(), String> {
    let destination = format!("{}:{}", ip, port);
    let mut addrs = destination.to_socket_addrs().map_err(|e| format!("Invalid OSC address: {}", e))?;
    let addr = addrs.next().ok_or("Could not resolve OSC address")?;

    let socket = if addr.is_ipv4() {
        UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?
    } else {
        UdpSocket::bind("[::]:0").map_err(|e| e.to_string())?
    };

    let msg = OscMessage {
        addr: address,
        args: vec![OscType::Float(value)],
    };
    let packet = OscPacket::Message(msg);
    let encoded = rosc::encoder::encode(&packet).map_err(|e| e.to_string())?;
    socket.send_to(&encoded, addr).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn send_osc_bool(ip: String, port: u16, address: String, value: bool) -> Result<(), String> {
    let destination = format!("{}:{}", ip, port);
    let mut addrs = destination.to_socket_addrs().map_err(|e| format!("Invalid OSC address: {}", e))?;
    let addr = addrs.next().ok_or("Could not resolve OSC address")?;

    let socket = if addr.is_ipv4() {
        UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?
    } else {
        UdpSocket::bind("[::]:0").map_err(|e| e.to_string())?
    };

    let msg = OscMessage {
        addr: address,
        args: vec![OscType::Bool(value)],
    };
    let packet = OscPacket::Message(msg);
    let encoded = rosc::encoder::encode(&packet).map_err(|e| e.to_string())?;
    socket.send_to(&encoded, addr).map_err(|e| e.to_string())?;
    Ok(())
}