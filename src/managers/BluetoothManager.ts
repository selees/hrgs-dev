import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Event } from "@tauri-apps/api/event";
import { HeartRateInputOutput } from "./HeartRateInputOutput";
import { Config } from "../types";

export class BluetoothManager {
  private config: Config;
  private heartRateIO: HeartRateInputOutput;
  private unlistenHandler: (() => void) | null = null;
  private isConnected: boolean = false;

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
    try {
      console.log(`Attempting to connect to Bluetooth device: ${deviceId}`);
      
      // 기존 이벤트 리스너 해제
      await this.cleanup();

      // Tauri 블루투스 연결
      await invoke("connect_bluetooth", { deviceId });
      this.isConnected = true;
      console.log(`Successfully connected to device: ${deviceId}`);
      this.heartRateIO.setConnected(true, "bluetooth");

      // 블루투스 심박수 이벤트 리스너 설정
      this.unlistenHandler = await listen<number>("heart_rate_update", (event: Event<number>) => {
        console.log("Heart rate update received:", event.payload);
        this.heartRateIO.updateHeartRate(event.payload);
      });
    } catch (error) {
      console.error(`Failed to connect to device: ${deviceId}`, error);
      this.isConnected = false;
      this.heartRateIO.setConnected(false, "bluetooth");
    }
  }

  async disconnect(): Promise<void> {
    try {
      console.log("Disconnecting from Bluetooth device...");
      await invoke("disconnect_bluetooth");
      await this.cleanup(); // 이벤트 리스너 정리 추가
      this.isConnected = false;
      console.log("Successfully disconnected from Bluetooth device.");
      this.heartRateIO.setConnected(false, "bluetooth");
    } catch (error) {
      console.error("Failed to disconnect from Bluetooth device:", error);
      this.isConnected = false;
      this.heartRateIO.setConnected(false, "bluetooth");
    }
  }

  private async cleanup(): Promise<void> {
    if (this.unlistenHandler) {
      console.log("Cleaning up previous Bluetooth event listeners...");
      await this.unlistenHandler();
      this.unlistenHandler = null;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}