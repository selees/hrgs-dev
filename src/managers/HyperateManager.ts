import { HeartRateInputOutput } from "./HeartRateInputOutput";
import { Config } from "../types";

export class HyperateManager {
  private config: Config;
  private ws: WebSocket | null = null;
  private heartRateIO: HeartRateInputOutput;
  private heartbeatTimer: number | null = null;
  private messageRef = 1;
  private readonly WEBSOCKET_TOKEN = 'bnQ1FoJmfiRprrSUJzrFxt8x8BbllHyqIWq4LsRjV7aCrLuLot6QyCQM9NZRkd9z';
  private readonly WS_URL = `wss://app.hyperate.io/socket/websocket?token=${this.WEBSOCKET_TOKEN}`;
  private readonly HEARTBEAT_MS = 30000;

  constructor(config: Config, heartRateIO: HeartRateInputOutput) {
    this.config = config;
    this.heartRateIO = heartRateIO;
  }

  updateConfig(config: Config): void {
    this.config = config;
  }

  async connect(): Promise<void> {
    const channelId = this.config.widget_id;
    if (!channelId) throw new Error("No HypeRate ID configured");

    this.disconnect();

    this.ws = new WebSocket(this.WS_URL);

    this.ws.onopen = () => {
      console.log("HypeRate WebSocket connection established");
      this.joinChannel(channelId);
      this.heartbeatTimer = window.setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_MS);
      this.heartRateIO.setConnected(true, "widget");
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg?.topic !== `hr:${channelId}`) return;
        
        const bpm = Number(msg?.payload?.hr);
        if (Number.isFinite(bpm) && bpm > 0) {
          this.heartRateIO.updateHeartRate(bpm);
        }
      } catch (error) {
        console.error("HypeRate WebSocket data parsing error:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("HypeRate WebSocket connection closed");
      this.cleanup();
      this.heartRateIO.setConnected(false, "widget");
    };

    this.ws.onerror = (error) => {
      console.error("HypeRate WebSocket error:", error);
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.leaveChannel(this.config.widget_id);
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
    this.heartRateIO.setConnected(false, "widget");
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendHeartbeat(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        topic: 'phoenix',
        event: 'heartbeat',
        payload: {},
        ref: this.messageRef++
      }));
    }
  }

  private joinChannel(channelId: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      topic: `hr:${channelId}`,
      event: 'phx_join',
      payload: {},
      ref: this.messageRef++
    }));
  }

  private leaveChannel(channelId: string): void {
    try {
      if (this.ws?.readyState === WebSocket.OPEN && channelId) {
        this.ws.send(JSON.stringify({
          topic: `hr:${channelId}`,
          event: 'phx_leave',
          payload: {},
          ref: this.messageRef++
        }));
      }
    } catch {}
  }
}
