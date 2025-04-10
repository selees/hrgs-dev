import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDispatch } from "react-redux";
import { setConnected } from "../store";

export const useBluetoothManager = () => {
  const dispatch = useDispatch();
  const [devices, setDevices] = useState<[string, string][]>([]);

  const scanDevices = async () => {
    try {
      const scannedDevices: [string, string][] = await invoke("scan_bluetooth_devices");
      setDevices(scannedDevices);
      return scannedDevices;
    } catch (error) {
      console.error("Bluetooth scan failed:", error);
      return [];
    }
  };

  const connect = async (deviceId: string) => {
    try {
      await invoke("connect_bluetooth", { deviceId });
      dispatch(setConnected(true));
    } catch (error) {
      console.error("Bluetooth connect failed:", error);
    }
  };

  return { devices, scanDevices, connect };
};