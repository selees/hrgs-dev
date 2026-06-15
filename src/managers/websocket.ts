import { invoke } from "@tauri-apps/api/core";
import { HeartRateInputOutput } from "./HeartRateInputOutput";
import { Config } from "../types";

export class WebSocketManager {
  private config: Config;
  private ws: WebSocket | null = null;
  private heartRateIO: HeartRateInputOutput;

  constructor(config: Config, heartRateIO: HeartRateInputOutput) {
    this.config = config;
    this.heartRateIO = heartRateIO;
  }

  updateConfig(config: Config): void {
    this.config = config;
  }

  async connect(): Promise<void> {
    const wsUrl = await this.getWebSocketUrl(this.config.widget_id);
    if (!wsUrl) throw new Error("No WebSocket URL available");

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connection established");
      this.heartRateIO.setConnected(true, "widget");
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        const heartRate = data.data?.heartRate || data.data;

        if (this.heartRateIO) {
          this.heartRateIO.updateHeartRate(heartRate); // 심박수 업데이트
        }
      } catch (error) {
        console.error("WebSocket data parsing error:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed");
      this.heartRateIO.setConnected(false, "widget");
      this.ws = null;
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.heartRateIO.setConnected(false, "widget");
    }
  }

  // WebSocket URL 가져오기
  private async getWebSocketUrl(widgetId: string): Promise<string> {
    try {
      const url: string = await invoke("get_websocket_url", { widgetId });
      if (!url) {
        console.error("Failed to fetch WebSocket URL: Returned empty string");
      }
      return url;
    } catch (error) {
      console.error("Error fetching WebSocket URL:", error);
      return "";
    }
  }
}