import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Event } from "@tauri-apps/api/event";
import { HeartRateInputOutput } from "./HeartRateInputOutput";
import { Config } from "../types";

export class BluetoothManager {
  private config: Config;
  private heartRateIO: HeartRateInputOutput;
  private unlistenHandler: (() => void) | null = null;
  private currentDeviceId: string | null = null;

  constructor(config: Config, heartRateIO: HeartRateInputOutput) {
    this.config = config;
    this.heartRateIO = heartRateIO;
  }

  updateConfig(config: Config): void {
    this.config = config;
    console.log("BluetoothManager config updated:", config);
  }

  async scanDevices(): Promise<[string, string][]> {
    try {
      console.log("Starting Bluetooth device scan...");
      const scannedDevices: [string, string][] = await invoke("scan_bluetooth_devices");
      console.log("Scanned devices:", scannedDevices);
      return scannedDevices;
    } catch (error) {
      console.error("Bluetooth scan failed:", error);
      return [];
    }
  }

  async connect(deviceId: string): Promise<void> {
    if (this.currentDeviceId === deviceId) {
      console.warn(`Device ${deviceId} is already connected.`);
      return;
    }

    if (this.currentDeviceId) {
      console.warn(`Another device (${this.currentDeviceId}) is already connected. Disconnecting first.`);
      await this.disconnect();
    }

    try {
      console.log(`Attempting to connect to Bluetooth device: ${deviceId}`);
      await invoke("connect_bluetooth", { deviceId });
      this.currentDeviceId = deviceId;
      this.heartRateIO.setConnected(true, "bluetooth");
      this.removeBluetoothListener(); // 기존 리스너 제거
      this.addBluetoothListener();    // 새 리스너 추가
    } catch (error) {
      console.error(`Failed to connect to device: ${deviceId}`, error);
      this.heartRateIO.setConnected(false, "bluetooth");
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.currentDeviceId) {
      console.warn("No Bluetooth device connected, skipping disconnect.");
      return;
    }
  
    try {
      console.log(`Disconnecting from Bluetooth device: ${this.currentDeviceId}`);
      await invoke("disconnect_bluetooth", { deviceId: this.currentDeviceId });
      await this.cleanup();
      this.removeBluetoothListener(); // 연결 해제 시 리스너 제거
      this.currentDeviceId = null;
      this.heartRateIO.setConnected(false, "bluetooth");
    } catch (error) {
      console.error(`Failed to disconnect from Bluetooth device: ${this.currentDeviceId}`, error);
    }
  }

  private async cleanup(): Promise<void> {
  // cleanup에서 리스너 제거하지 않음. (removeBluetoothListener에서만 관리)
  }

  addBluetoothListener(): void {
    // 항상 기존 리스너 제거 후 새로 등록
    this.removeBluetoothListener();
    listen<number>("heart_rate_update", (event: Event<number>) => {
      console.log("Heart rate update received:", event.payload);
      this.heartRateIO.updateHeartRate(event.payload);
    }).then((unlisten) => {
      this.unlistenHandler = unlisten;
    }).catch((error) => {
      console.error("Failed to add Bluetooth listener:", error);
    });
  }

  removeBluetoothListener(): void {
    if (!this.unlistenHandler) {
      console.warn("No Bluetooth listener to remove. Skipping...");
      return; // 중복 제거 방지
    }
  
    console.log("Removing Bluetooth listener...");
    this.unlistenHandler();
    this.unlistenHandler = null;
  }
}