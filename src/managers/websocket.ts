import { fetch } from "@tauri-apps/plugin-http";
import { v4 as uuidv4 } from "uuid";
import { HeartRateInputOutput } from "./HeartRateInputOutput";
import { Config } from "../types";

export class WebSocketManager {
  private config: Config;
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private heartRateIO: HeartRateInputOutput;

  constructor(config: Config, heartRateIO: HeartRateInputOutput) {
    if (!heartRateIO) {
      throw new Error("HeartRateInputOutput instance is required");
    }
    this.config = config;
    this.heartRateIO = heartRateIO;
  }

  // WebSocket 연결
  async connect(): Promise<void> {
    const wsUrl = await this.getWebSocketUrl(this.config.widget_id);
    if (!wsUrl) throw new Error("No WebSocket URL available");

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connection established");
      this.isConnected = true;
      if (this.heartRateIO) {
        this.heartRateIO.setConnected(true, "widget");
      }
    };

    this.ws.onmessage = (event) => {
      this.clearTimeout();

      try {
        const data = JSON.parse(event.data as string);
        const heartRate = data.data?.heartRate || data.data;

        if (this.heartRateIO) {
          // 심박수 업데이트 처리
          this.heartRateIO.updateHeartRate(heartRate);
        } else {
          console.error("HeartRateInputOutput is not initialized");
        }
      } catch (error) {
        console.error("WebSocket data parsing error:", error);
      }

      this.startTimeout();
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed");
      this.isConnected = false;
      this.clearTimeout();
      if (this.heartRateIO) {
        this.heartRateIO.setConnected(false, "widget");
      }
      this.ws = null;
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.isConnected = false;
      this.ws?.close();
    };

    this.startTimeout();
  }

  // WebSocket 연결 해제
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      this.clearTimeout();
      if (this.heartRateIO) {
        this.heartRateIO.setConnected(false, "widget");
      }
    }
  }

  // WebSocket 연결 상태 확인
  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  // 설정 업데이트
  updateConfig(config: Config): void {
    this.config = config;
    console.log("WebSocketManager config updated:", config);
  }

  // WebSocket URL 가져오기
  private async getWebSocketUrl(widgetId: string): Promise<string> {
    const requestId = uuidv4();

    const response = await fetch("https://api.stromno.com/v1/api/public/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: requestId,
        jsonrpc: "2.0",
        method: "getWidget",
        params: {
          widgetId,
        },
      }),
    });

    const responseData = await response.json();

    if (response.status !== 200 || responseData.error) {
      console.error("Failed to fetch WebSocket URL:", responseData.error || response.statusText);
      return "";
    }

    return responseData.result.ramielUrl;
  }

  // 타임아웃 시작
  private startTimeout(): void {
    this.timeoutId = setTimeout(() => {
      console.warn("WebSocket timed out - closing connection");
      this.isConnected = false;
      if (this.heartRateIO) {
        this.heartRateIO.setConnected(false, "widget");
      }
      this.ws?.close();
    }, this.config.timeout * 1000);
  }

  // 기존 타임아웃 제거
  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}