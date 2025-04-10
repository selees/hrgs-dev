import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Event } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";

import { Activity, Bluetooth } from "lucide-react";
import SettingsPanel from "./components/SettingsPanel";
import ConnectionControls from "./components/ConnectionControls";
import "./App.css";
import { Config } from "./types";
import { setConfig, RootState } from "./store";
import { useDispatch, useSelector } from "react-redux";
import { connectWebSocket, getWebSocketUrl } from "./websocket";

function App() {
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.app.config);
  
  const [hr, setHr] = useState<number>(0);
  const [wsInstance, setWsInstance] = useState<WebSocket | null>(null);
  const [isWidgetConnected, setIsWidgetConnected] = useState<boolean>(false);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [bluetoothDevices, setBluetoothDevices] = useState<[string, string][]>([]);
  const [bluetoothCleanup, setBluetoothCleanup] = useState<(() => void) | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<number>("heart_rate_update", (event: Event<number>) => {
        console.log("Received heart rate update (Tauri event):", event.payload);
        setHr((prevHr) => {
          console.log("Updating hr state from", prevHr, "to", event.payload);
          return event.payload;
        });
      });
    };

    setupListener().catch((err) => console.error("Failed to setup listener:", err));

    return () => {
      console.log("Cleaning up heart_rate_update listener");
      if (unlisten) unlisten();
    };
  }, []);

  const loadConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const loadedConfig: Config | null = await invoke("load_config");
      let finalConfig: Config;
  
      if (loadedConfig) {
        finalConfig = loadedConfig;
        console.log("Loaded config:", finalConfig);
      } else {
        const defaultConfig: Config = {
          mode: "bluetooth",
          widget_id: "",
          max_hr: 200,
          osc_ip: "127.0.0.1",
          osc_port: 9000,
          hr_percent_address: "/avatar/parameters/hr_percent",
          hr_connected_address: "/avatar/parameters/hr_connected",
          midi_port: "hroscmidi",
          timeout: 10,
          bluetooth_device_id: "",
        };
        await invoke("save_config", { config: defaultConfig });
        finalConfig = defaultConfig;
        console.log("Initialized default config:", finalConfig);
      }
  
      // Redux 상태 업데이트
      dispatch(setConfig(finalConfig));
  
      // 상태가 반영될 시간을 주기 위해 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100));
  
      // config가 위젯 모드일 경우 직접 finalConfig를 사용하여 reconnect 호출
      if (finalConfig.mode === "widget") {
        console.log("Config mode is 'widget', initiating reconnect with loaded config...");
        await reconnectWithConfig(finalConfig);
      } else {
        console.log("Config mode is not 'widget', skipping reconnect");
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
      const defaultConfig: Config = {
        mode: "bluetooth",
        widget_id: "",
        max_hr: 200,
        osc_ip: "127.0.0.1",
        osc_port: 9000,
        hr_percent_address: "/avatar/parameters/hr_percent",
        hr_connected_address: "/avatar/parameters/hr_connected",
        midi_port: "hroscmidi",
        timeout: 10,
        bluetooth_device_id: "",
      };
      await invoke("save_config", { config: defaultConfig });
      dispatch(setConfig(defaultConfig));
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const connectBluetooth = async (config: Config): Promise<(() => void) | null> => {
    try {
      console.log("Connecting to Bluetooth device:", config.bluetooth_device_id);
      await invoke("connect_bluetooth", { deviceId: config.bluetooth_device_id });
      setIsBluetoothConnected(true);
      
      await invoke("send_osc_bool", {
        ip: config.osc_ip,
        port: config.osc_port,
        address: config.hr_connected_address,
        value: true,
      }).catch(err => console.error("Failed to send OSC on connect:", err));
      
      await invoke("send_midi_note", {
        portName: config.midi_port,
        note: 60,
        velocity: 127,
      }).catch(err => console.error("Failed to send MIDI on connect:", err));
      
      return () => {
        console.log("Executing Bluetooth cleanup function");
        invoke("disconnect_bluetooth", { deviceId: config.bluetooth_device_id })
          .catch(err => console.error("Failed to disconnect Bluetooth:", err));
        
        invoke("send_osc_bool", {
          ip: config.osc_ip,
          port: config.osc_port,
          address: config.hr_connected_address,
          value: false,
        }).catch(err => console.error("Failed to send OSC on disconnect:", err));
        
        invoke("send_midi_note", {
          portName: config.midi_port,
          note: 60,
          velocity: 0,
        }).catch(err => console.error("Failed to send MIDI on disconnect:", err));
        
        setIsBluetoothConnected(false);
      };
    } catch (error) {
      console.error("Bluetooth connection failed:", error);
      setIsBluetoothConnected(false);
      return null;
    }
  };

  const selectBluetoothDevice = async (): Promise<[string, string][]> => {
    try {
      const devices: [string, string][] = await invoke("scan_bluetooth_devices");
      console.log("Scanned devices:", devices);
      setBluetoothDevices(devices);
      return devices;
    } catch (error) {
      console.error("Bluetooth scan failed:", error);
      return [];
    }
  };

  const safelyCloseAllConnections = async () => {
    if (wsInstance) {
      console.log("Safely closing WebSocket connection");
      wsInstance.close();
      setWsInstance(null);
      setIsWidgetConnected(false);
    }
    
    if (bluetoothCleanup) {
      console.log("Safely closing Bluetooth connection");
      bluetoothCleanup();
      setBluetoothCleanup(null);
      setIsBluetoothConnected(false);
    }
    
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log("All connections closed safely");
  };

  useEffect(() => {
    loadConfig();
  }, []); // 앱 시작 시 한 번만 실행

  useEffect(() => {
    if (config) {
      const intervalId = setInterval(() => {
        sendHrConnectedStatus();
      }, 10000);
      return () => clearInterval(intervalId);
    }
  }, [config, wsInstance, isBluetoothConnected, isWidgetConnected]);

  const sendHrConnectedStatus = () => {
    if (config) {
      const connected = config.mode === "widget" ? isWidgetConnected : isBluetoothConnected;
      invoke("send_osc_bool", {
        ip: config.osc_ip,
        port: config.osc_port,
        address: config.hr_connected_address,
        value: connected,
      });
      
      invoke("send_midi_note", {
        portName: config.midi_port,
        note: 60,
        velocity: connected ? 127 : 0,
      });
    }
  };

  const toggleMode = async () => {
    if (!config) {
      console.warn("No configuration available. Cannot toggle mode.");
      return;
    }

    try {
      const currentMode = config.mode;
      const newMode = currentMode === "bluetooth" ? "widget" : "bluetooth";
      console.log(`Switching mode from ${currentMode} to ${newMode}`);

      await safelyCloseAllConnections();

      const newConfig = {
        ...config,
        mode: newMode,
      };

      await invoke("save_config", { config: newConfig });
      dispatch(setConfig(newConfig));

      await new Promise(resolve => setTimeout(resolve, 500));

      if (newMode === "widget") {
        if (!newConfig.widget_id) {
          console.error("Widget ID is not configured");
          return;
        }

        console.log("Attempting to connect to widget...");
        if (wsInstance) {
          console.warn("Existing WebSocket connection found, closing it...");
          wsInstance.close();
          setWsInstance(null);
          setIsWidgetConnected(false);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        await connectWebSocket(newConfig, setHr, setIsWidgetConnected, setWsInstance);
        console.log("Widget connection established");
      } else {
        if (!newConfig.bluetooth_device_id) {
          console.log("No Bluetooth device configured, scanning...");
          const devices = await selectBluetoothDevice();
          if (devices.length > 0) {
            const updatedConfig = { ...newConfig, bluetooth_device_id: devices[0][0] };
            await invoke("save_config", { config: updatedConfig });
            dispatch(setConfig(updatedConfig));
            newConfig.bluetooth_device_id = updatedConfig.bluetooth_device_id;
          } else {
            console.error("No Bluetooth devices found");
            return;
          }
        }

        console.log("Attempting to connect to Bluetooth device...");
        if (bluetoothCleanup) {
          console.warn("Existing Bluetooth connection found, closing it...");
          bluetoothCleanup();
          setBluetoothCleanup(null);
          setIsBluetoothConnected(false);
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        const cleanup = await connectBluetooth(newConfig);
        if (cleanup) {
          setBluetoothCleanup(() => cleanup);
          console.log("Bluetooth connection established with cleanup");
        }
      }

      sendHrConnectedStatus();

    } catch (error) {
      console.error("Failed to toggle mode:", error);
      setIsBluetoothConnected(false);
      setIsWidgetConnected(false);
      alert("Mode toggle failed. Please check connections and try again.");
    }
  };

  const reconnectWithConfig = async (localConfig: Config) => {
    try {
      console.log(`Reconnecting with mode: ${localConfig.mode}`);
  
      await safelyCloseAllConnections();
  
      if (localConfig.mode === "widget") {
        if (!localConfig.widget_id) {
          console.error("Widget ID is not configured");
          return;
        }
  
        console.log("Reconnecting to widget...");
        if (wsInstance) {
          console.warn("Existing WebSocket connection found, closing it...");
          wsInstance.close();
          setWsInstance(null);
          setIsWidgetConnected(false);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
  
        await connectWebSocket(localConfig, setHr, setIsWidgetConnected, setWsInstance);
        console.log("Widget reconnection successful");
      } else {
        if (!localConfig.bluetooth_device_id) {
          console.log("No Bluetooth device configured, scanning...");
          const devices = await selectBluetoothDevice();
          if (devices.length > 0) {
            const updatedConfig = { ...localConfig, bluetooth_device_id: devices[0][0] };
            await invoke("save_config", { config: updatedConfig });
            dispatch(setConfig(updatedConfig));
          } else {
            console.error("No Bluetooth devices found");
            return;
          }
        }
  
        console.log("Reconnecting to Bluetooth device...");
        if (bluetoothCleanup) {
          console.warn("Existing Bluetooth connection found, closing it...");
          bluetoothCleanup();
          setBluetoothCleanup(null);
          setIsBluetoothConnected(false);
          await new Promise(resolve => setTimeout(resolve, 300));
        }
  
        const cleanup = await connectBluetooth(localConfig);
        if (cleanup) {
          setBluetoothCleanup(() => cleanup);
          console.log("Bluetooth reconnection successful with cleanup");
        }
      }
  
      sendHrConnectedStatus();
  
    } catch (error) {
      console.error("Reconnection failed:", error);
      setIsBluetoothConnected(false);
      setIsWidgetConnected(false);
    }
  };
  
  const reconnect = async () => {
    if (!config) {
      console.error("No configuration provided for reconnection");
      return;
    }
  
    await reconnectWithConfig(config);
  };

  const hrPercentage = config ? Math.min(100, (hr / config.max_hr) * 100) : 0;
  const isConnected = config?.mode === "bluetooth" ? isBluetoothConnected : isWidgetConnected;

  console.log("Rendering with hr:", hr, "hrPercentage:", hrPercentage, "isConnected:", isConnected);

  return (
    <div className="bg-gray-100 dark:bg-gray-900 w-[320px] h-[260px] overflow-hidden">
      {!showSettings ? (
        <div className="bg-white dark:bg-gray-800 h-full p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <ConnectionControls
              tempConfig={config as Config}
              reconnect={reconnect}
              selectBluetoothDevice={selectBluetoothDevice}
              setShowSettings={setShowSettings}
              showSettings={showSettings}
            />
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="relative h-32 w-32 mb-2">
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-gray-800 dark:text-white">{Math.round(hr)}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">BPM</span>
              </div>
              <svg className="h-full w-full" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  className="dark:stroke-gray-700"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="8"
                  strokeDasharray={`${hrPercentage * 2.83} 283`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                />
              </svg>
            </div>

            {config && (
              <div className="grid w-full grid-cols-2 gap-2 mt-1">
                <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-700">
                  <div className="flex items-center justify-center gap-1">
                    <Activity className="h-3 w-3 text-blue-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">HR %</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-white text-center">
                    {hrPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-lg bg-gray-100 p-2 dark:bg-gray-700">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={toggleMode}
                      className={`flex items-center justify-center rounded-md p-1 ${
                        config.mode === "bluetooth" ? "bg-blue-500" : "bg-gray-200"
                      }`}
                    >
                      <Bluetooth
                        className={`h-4 w-4 ${
                          config.mode === "bluetooth" ? "text-white" : "text-gray-700"
                        }`}
                      />
                    </button>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">ConnectType</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-white truncate text-center">
                    {config.mode === "widget" ? "Widget ID" : "Bluetooth"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <SettingsPanel
          setShowSettings={setShowSettings}
          bluetoothDevices={bluetoothDevices}
          isLoadingConfig={isLoadingConfig}
          onSaveComplete={reconnect}
        />
      )}
    </div>
  );
}

export default App;