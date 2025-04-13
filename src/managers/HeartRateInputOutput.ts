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
  private statusIntervalId: ReturnType<typeof setInterval> | null = null; // 새 타이머 추가
  private dispatch: AppDispatch;

  constructor(config: Config, dispatch: AppDispatch) {
    this.config = config;
    this.dispatch = dispatch;
  }

  updateConfig(config: Config): void {
    this.config = config;
  }

  updateHeartRate(value: number): void {
    if (this.connectionType === "widget" && this.config.mode === "widget") {
      console.warn("Ignoring heart rate update in widget mode");
      return;
    }
    console.log("Updating heart rate:", value);
    this.heartRate = value;
    this.dispatch(setHeartRate(value));
    this.notifyListeners();
    this.sendToOutputs();
    this.resetTimeout();
  }

  setConnected(connected: boolean, type: "bluetooth" | "widget"): void {
    this.isConnected = connected;
    this.connectionType = type;

    // OSC와 MIDI에 연결 상태 전송
    this.sendConnectionStatus();

    // 연결 상태 변경 이벤트 알림
    this.notifyConnectionListeners();

    if (connected) {
      // 연결되었을 때 타임아웃 시작
      this.resetTimeout();
      // 10초마다 연결 상태 갱신 시작
      this.startStatusInterval();
    } else {
      // 연결 끊어졌을 때 타임아웃 및 갱신 타이머 제거
      this.clearTimeout();
      this.stopStatusInterval();
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

  private resetTimeout(): void {
    this.clearTimeout();
    
    this.timeoutId = setTimeout(() => {
      if (this.isConnected) {
        console.warn("Connection timed out");
        this.setConnected(false, this.connectionType);
      }
    }, this.config.timeout * 1000);
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // 10초마다 연결 상태 갱신 시작
  private startStatusInterval(): void {
    this.stopStatusInterval(); // 기존 타이머 정리
    if (this.isConnected) {
      this.statusIntervalId = setInterval(() => {
        console.log("Sending periodic connection status: true");
        this.sendConnectionStatus();
      }, 10000); // 10초마다 실행
    }
  }

  // 연결 상태 갱신 타이머 중지
  private stopStatusInterval(): void {
    if (this.statusIntervalId) {
      clearInterval(this.statusIntervalId);
      this.statusIntervalId = null;
    }
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

  addHeartRateListener(callback: HeartRateCallback): void {
    this.listeners.push(callback);
  }

  removeHeartRateListener(callback: HeartRateCallback): void {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.heartRate));
  }

  getHeartRate(): number {
    return this.heartRate;
  }

  isDeviceConnected(): boolean {
    return this.isConnected;
  }

  disconnect(): void {
    this.setConnected(false, this.connectionType);
    this.clearTimeout();
    this.stopStatusInterval(); // 타이머 정리
  }
}