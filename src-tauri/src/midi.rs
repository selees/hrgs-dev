use tauri::State;
use midir::{MidiOutput, MidiOutputConnection};
use std::sync::Mutex;

pub struct MidiState {
    pub midi_conn: Mutex<Option<(String, MidiOutputConnection)>>,
}

#[tauri::command]
pub async fn send_midi_note(
    state: State<'_, MidiState>,
    port_name: String,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    let mut midi_conn_guard = state.midi_conn.lock().unwrap();
    const CHANNEL: u8 = 0;

    if midi_conn_guard.as_ref().map_or(true, |(name, _)| name != &port_name) {
        let midi_out = MidiOutput::new("Pulsoid MIDI Output").map_err(|e| e.to_string())?;
        let ports = midi_out.ports();
        let port = ports
            .iter()
            .find(|p| midi_out.port_name(p).unwrap_or_default() == port_name)
            .ok_or_else(|| format!("MIDI port '{}' not found", port_name))?;
        let conn = midi_out.connect(port, "midi_out").map_err(|e| e.to_string())?;
        *midi_conn_guard = Some((port_name.clone(), conn));
    }

    if let Some((_, conn)) = midi_conn_guard.as_mut() {
        let message = if velocity > 0 {
            [0x90 | CHANNEL, note, velocity] // Note On
        } else {
            [0x80 | CHANNEL, note, velocity] // Note Off
        };
        conn.send(&message).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn send_midi_heartrate(
    state: State<'_, MidiState>,
    port_name: String,
    heartrate: u8,
) -> Result<(), String> {
    let mut midi_conn_guard = state.midi_conn.lock().unwrap();
    const CHANNEL: u8 = 0;

    if midi_conn_guard.as_ref().map_or(true, |(name, _)| name != &port_name) {
        let midi_out = MidiOutput::new("Pulsoid MIDI Output").map_err(|e| e.to_string())?;
        let ports = midi_out.ports();
        let port = ports
            .iter()
            .find(|p| midi_out.port_name(p).unwrap_or_default() == port_name)
            .ok_or_else(|| format!("MIDI port '{}' not found", port_name))?;
        let conn = midi_out.connect(port, "midi_out").map_err(|e| e.to_string())?;
        *midi_conn_guard = Some((port_name.clone(), conn));
    }

    if let Some((_, conn)) = midi_conn_guard.as_mut() {
        let ones = heartrate % 10;
        let tens = heartrate / 10;
        let message = [0x90 | CHANNEL, ones, tens];
        conn.send(&message).map_err(|e| e.to_string())?;
        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    Ok(())
}