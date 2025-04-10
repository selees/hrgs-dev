import { invoke } from "@tauri-apps/api/core";
import { Config } from "../types";

export const useWidgetManager = (config: Config) => {
  const setupWebSocket = async () => {
    const wsUrl = await invoke<string>("get_websocket_url", { widgetId: config.widget_id });
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      invoke("send_osc_bool", {
        ip: config.osc_ip,
        port: config.osc_port,
        address: config.hr_connected_address,
        value: true,
      });
    };
    // 추가 WebSocket 로직 필요 시 구현
  };

  return { setupWebSocket };
};