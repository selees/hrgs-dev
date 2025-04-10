import { invoke } from "@tauri-apps/api/core";

export const sendOsc = async (ip: string, port: number, address: string, value: number) => {
  await invoke("send_osc", { ip, port, address, value });
};

export const sendOscBool = async (ip: string, port: number, address: string, value: boolean) => {
  await invoke("send_osc_bool", { ip, port, address, value });
};