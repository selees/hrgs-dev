import { invoke } from "@tauri-apps/api/core";

export const sendMidiNote = async (portName: string, note: number, velocity: number) => {
  await invoke("send_midi_note", { portName, note, velocity });
};

export const sendMidiHeartRate = async (portName: string, heartrate: number) => {
  await invoke("send_midi_heartrate", { portName, heartrate });
};