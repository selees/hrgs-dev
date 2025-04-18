import { invoke } from "@tauri-apps/api/core";
import { AppDispatch } from "../store";
import { setHeartRate } from "../store";
import { Config } from "../types";

type HeartRateCallback = (hr: number) => void;
type ConnectionStatusCallback = (isConnected: boolean, type: "bluetooth" | "widget") => void;

export class HeartRateInputOutput {
  private config: Config;
  private heartRate: number = 0;
  private isConnected: boolean = false;
  private connectionType: "bluetooth" | "widget" = "bluetooth";
  private listeners: HeartRateCallback[] = [];
  private connectionListeners: ConnectionStatusCallback[] = [];
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
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
      this.setConnected(true, this.connectionType);
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
      console.warn("Heart rate data timeout - setting isConnected to false");
      this.setConnected(false, this.connectionType); // 연결 상태를 false로 설정
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

      // OSC와 MIDI에 연결 상태 전송
      this.sendConnectionStatus();

      // 연결 상태 변경 이벤트 알림
      this.notifyConnectionListeners();
    }
  }

  addConnectionListener(callback: ConnectionStatusCallback): void {
    this.connectionListeners.push(callback);
  }

  removeConnectionListener(callback: ConnectionStatusCallback): void {
    this.connectionListeners = this.connectionListeners.filter(listener => listener !== callback);
  }

  private notifyConnectionListeners(): void {
    this.connectionListeners.forEach(listener => listener(this.isConnected, this.connectionType));
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

  private sendConnectionStatus(): void {
    invoke("send_osc_bool", {
      ip: this.config.osc_ip,
      port: this.config.osc_port,
      address: this.config.hr_connected_address,
      value: this.isConnected,
    }).catch(err => console.error("Failed to send OSC connection status:", err));

    invoke("send_midi_note", {
      portName: this.config.midi_port,
      note: 60,
      velocity: this.isConnected ? 127 : 0,
    }).catch(err => console.error("Failed to send MIDI connection status:", err));
  }

  getHeartRate(): number {
    return this.heartRate;
  }

  disconnect(): void {
    this.setConnected(false, this.connectionType);
    this.clearTimeout();
  }
}