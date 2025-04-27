import { invoke } from "@tauri-apps/api/core";
import { AppDispatch } from "../store";
import { setHeartRate } from "../store";
import { Config } from "../types";

type HeartRateCallback = (hr: number) => void;
type ConnectionStatusCallback = (isConnected: boolean, type: "bluetooth" | "widget") => void;
type GuiConnectionStatusCallback = (isConnected: boolean) => void;

export class HeartRateInputOutput {
  private config: Config;
  private heartRate: number = 0;
  private isConnected: boolean = false; // 내부 연결 상태
  private guiIsConnected: boolean = false; // GUI 상태
  private connectionType: "bluetooth" | "widget" = "bluetooth";
  private listeners: HeartRateCallback[] = [];
  private connectionListeners: ConnectionStatusCallback[] = [];
  private guiConnectionListeners: GuiConnectionStatusCallback[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private statusIntervalId: ReturnType<typeof setInterval> | null = null;
  private dispatch: AppDispatch;

  constructor(config: Config, dispatch: AppDispatch) {
    this.config = config;
    this.dispatch = dispatch;
  }

  updateConfig(config: Config): void {
    this.config = config;
  }

  updateHeartRate(value: number): void {
    console.log(`Received heart rate update: ${value}`);
    this.heartRate = value;
    this.dispatch(setHeartRate(value));

    if (value > 0) {
      this.guiIsConnected = true; // GUI 상태를 true로 설정
      this.notifyGuiConnectionListeners(true);
    }

    this.resetTimeout(); // 타임아웃 재설정
    this.notifyListeners();
    this.sendToOutputs();
  }

  isDeviceConnected(): boolean {
    return this.isConnected;
  }

  private resetTimeout(): void {
    this.clearTimeout();

    this.timeoutId = setTimeout(() => {
      console.warn("Heart rate data timeout - setting GUI isConnected to false");
      this.guiIsConnected = false; // GUI 상태를 false로 설정
      this.notifyGuiConnectionListeners(false);
    }, this.config.timeout * 1000);
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  setConnected(connected: boolean, type: "bluetooth" | "widget"): void {
    if (this.isConnected !== connected) {
      console.log(`Connection status changed: ${connected}, type: ${type}`);
      this.isConnected = connected;
      this.connectionType = type;

      if (connected) {
        this.startStatusUpdates(); // 내부 연결 상태가 true일 때 값 전송 시작
      } else {
        this.sendConnectionStatus();
        this.stopStatusUpdates(); // 값 전송 중단 및 정리
      }

      this.notifyConnectionListeners();
    }
  }

  private startStatusUpdates(): void {
    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId);
    }

    this.statusIntervalId = setInterval(() => {
      this.sendConnectionStatus();
    }, 5000); // 5초마다 상태 전송
  }

  private stopStatusUpdates(): void {
    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId);
      this.statusIntervalId = null;
    }
  }

  private sendConnectionStatus(): void {
    invoke("send_osc_bool", {
      ip: this.config.osc_ip,
      port: this.config.osc_port,
      address: this.config.hr_connected_address,
      value: this.guiIsConnected, // GUI 상태를 기반으로 전송
    }).catch(err => console.error("Failed to send OSC connection status:", err));
  }

  addConnectionListener(callback: ConnectionStatusCallback): void {
    this.removeConnectionListener(callback);
    this.connectionListeners.push(callback);
  }

  removeConnectionListener(callback: ConnectionStatusCallback): void {
    this.connectionListeners = this.connectionListeners.filter(listener => listener !== callback);
  }

  private notifyConnectionListeners(): void {
    this.connectionListeners.forEach(listener => listener(this.isConnected, this.connectionType));
  }

  addGuiConnectionListener(callback: GuiConnectionStatusCallback): void {
    this.guiConnectionListeners.push(callback);
  }

  removeGuiConnectionListener(callback: GuiConnectionStatusCallback): void {
    this.guiConnectionListeners = this.guiConnectionListeners.filter(listener => listener !== callback);
  }

  private notifyGuiConnectionListeners(isConnected: boolean): void {
    console.log("Notifying GUI connection listeners with value:", isConnected);
    this.guiConnectionListeners.forEach(listener => listener(isConnected));
  }

  addHeartRateListener(callback: HeartRateCallback): void {
    this.listeners.push(callback);
  }

  removeHeartRateListener(callback: HeartRateCallback): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.heartRate));
  }

  private sendToOutputs(): void {
    if (!this.isConnected) return;

    const hrPercent = this.heartRate / this.config.max_hr;

    invoke("send_osc", {
      ip: this.config.osc_ip,
      port: this.config.osc_port,
      address: this.config.hr_percent_address,
      value: hrPercent,
    }).catch(err => console.error("Failed to send OSC heart rate:", err));

    let heartRate_midi = Math.round(this.heartRate);
    if (heartRate_midi < 0) heartRate_midi = 0;
    else if (heartRate_midi > 200) heartRate_midi = 200;

    invoke("send_midi_heartrate", {
      portName: this.config.midi_port,
      heartrate: heartRate_midi,
    }).catch(err => console.error("Failed to send MIDI heart rate:", err));
  }

  getHeartRate(): number {
    return this.heartRate;
  }

  disconnect(): void {
    this.setConnected(false, this.connectionType);
    this.clearTimeout();
    this.stopStatusUpdates();
  }
}