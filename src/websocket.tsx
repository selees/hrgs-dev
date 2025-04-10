import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { v4 as uuidv4 } from "uuid";
import { Config } from "./types";

export const connectWebSocket = async (
  config: Config,
  setHr: (hr: number) => void,
  setIsWidgetConnected: (connected: boolean) => void,
  setWsInstance: (ws: WebSocket | null) => void
) => {
  const wsUrl = await getWebSocketUrl(config.widget_id);
  if (!wsUrl) throw new Error("No WebSocket URL available");

  const ws = new WebSocket(wsUrl);
  setWsInstance(ws);

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearExistingTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const startTimeout = () => {
    timeoutId = setTimeout(() => {
      console.warn("WebSocket timed out - closing connection");
      setIsWidgetConnected(false);
      invoke("send_osc_bool", {
        ip: config.osc_ip,
        port: config.osc_port,
        address: config.hr_connected_address,
        value: false,
      }).catch((err) => console.error("OSC timeout error:", err));
      invoke("send_midi_note", {
        portName: config.midi_port,
        note: 60,
        velocity: 0,
      }).catch((err) => console.error("MIDI timeout error:", err));
      ws.close();
    }, config.timeout * 1000);
  };

  ws.onopen = () => {
    console.log("WebSocket connection established");
    setIsWidgetConnected(true);
    invoke("send_osc_bool", {
      ip: config.osc_ip,
      port: config.osc_port,
      address: config.hr_connected_address,
      value: true,
    }).catch((err) => console.error("Failed to send OSC (onopen):", err));
    invoke("send_midi_note", {
      portName: config.midi_port,
      note: 60,
      velocity: 127,
    }).catch((err) => console.error("Failed to send MIDI (onopen):", err));
  };

  ws.onmessage = (event) => {
    clearExistingTimeout();

    try {
      const data = JSON.parse(event.data as string);
      const heartRate = data.data?.heartRate || data.data;
      setHr(heartRate);
      const hrPercent = heartRate / config.max_hr;

      invoke("send_osc", {
        ip: config.osc_ip,
        port: config.osc_port,
        address: config.hr_percent_address,
        value: hrPercent,
      }).catch((err) => console.error("Failed to send OSC (onmessage):", err));

      let heartRate_midi = Math.round(heartRate);
      if (heartRate_midi < 0) heartRate_midi = 0;
      else if (heartRate_midi > 200) heartRate_midi = 200;

      invoke("send_midi_heartrate", {
        portName: config.midi_port,
        heartrate: heartRate_midi,
      }).catch((err) => console.error("Failed to send MIDI (onmessage):", err));
    } catch (error) {
      console.error("WebSocket data parsing error:", error);
    }

    startTimeout();
  };

  ws.onclose = () => {
    setIsWidgetConnected(false);
    clearExistingTimeout();
    invoke("send_osc_bool", {
      ip: config.osc_ip,
      port: config.osc_port,
      address: config.hr_connected_address,
      value: false,
    }).catch((err) => console.error("Failed to send OSC (onclose):", err));
    invoke("send_midi_note", {
      portName: config.midi_port,
      note: 60,
      velocity: 0,
    }).catch((err) => console.error("Failed to send MIDI (onclose):", err));
    setWsInstance(null);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    setIsWidgetConnected(false);
    ws.close();
  };
};

export const getWebSocketUrl = async (widgetId: string): Promise<string> => {
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
    return "";
  }

  return responseData.result.ramielUrl;
};