import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Activity, Bluetooth } from "lucide-react";
import SettingsPanel from "./components/SettingsPanel";
import ConnectionControls from "./components/ConnectionControls";
import "./App.css";
import { Config } from "./types";
import { setConfig, RootState } from "./store";
import { useDispatch, useSelector } from "react-redux";
import { HeartRateInputOutput } from "./managers/HeartRateInputOutput";
import { BluetoothManager } from "./managers/BluetoothManager";
import { WebSocketManager } from "./managers/websocket";

function App() {
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.app.config);
  const heartRate = useSelector((state: RootState) => state.app.heartRate);
  
  const [isWidgetConnected, setIsWidgetConnected] = useState<boolean>(false);
  const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [bluetoothDevices, setBluetoothDevices] = useState<[string, string][]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);
  
  // 매니저 인스턴스를 ref로 관리
  const heartRateIORef = useRef<HeartRateInputOutput | null>(null);
  const bluetoothManagerRef = useRef<BluetoothManager | null>(null);
  const webSocketManagerRef = useRef<WebSocketManager | null>(null);

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
      
      // 각 매니저 초기화
      initializeManagers(finalConfig);
      
      // 상태가 반영될 시간을 주기 위해 잠시 대기
      await new Promise(resolve => setTimeout(resolve, 100));
  
      // 설정된 모드에 따라 연결 시도
      if (finalConfig.mode === "widget") {
        console.log("Config mode is 'widget', initiating reconnect with loaded config...");
        await reconnectWithConfig(finalConfig);
      } else if (finalConfig.mode === "bluetooth" && finalConfig.bluetooth_device_id) {
        console.log("Config mode is 'bluetooth', initiating reconnect with loaded config...");
        await reconnectWithConfig(finalConfig);
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
      initializeManagers(defaultConfig);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  const initializeManagers = (config: Config) => {
    // HeartRateInputOutput 초기화
    if (!heartRateIORef.current) {
      heartRateIORef.current = new HeartRateInputOutput(config, dispatch);
    } else {
      heartRateIORef.current.updateConfig(config);
    }
  
    // BluetoothManager 초기화
    if (!bluetoothManagerRef.current) {
      if (!heartRateIORef.current) {
        console.error("HeartRateInputOutput is not initialized");
        return;
      }
      bluetoothManagerRef.current = new BluetoothManager(config, heartRateIORef.current);
    } else {
      bluetoothManagerRef.current.updateConfig(config);
    }
  
    // WebSocketManager 초기화
    if (!webSocketManagerRef.current) {
      if (!heartRateIORef.current) {
        console.error("HeartRateInputOutput is not initialized");
        return;
      }
      webSocketManagerRef.current = new WebSocketManager(config, heartRateIORef.current);
    } else {
      webSocketManagerRef.current.updateConfig(config);
    }
  };

  const reconnectWithConfig = async (localConfig: Config) => {
    try {
      await disconnectAll();
  
      if (localConfig.mode === "widget") {
        if (!localConfig.widget_id) {
          console.error("Widget ID is not configured");
          return;
        }
  
        if (webSocketManagerRef.current) {
          console.log("Reconnecting to WebSocket...");
          await webSocketManagerRef.current.connect();
          setIsWidgetConnected(webSocketManagerRef.current.isConnectedStatus());
        }
      } else if (localConfig.mode === "bluetooth") {
        if (!localConfig.bluetooth_device_id) {
          console.error("Bluetooth device ID is not configured");
          return;
        }
  
        console.log(`Reconnecting to Bluetooth device: ${localConfig.bluetooth_device_id}`);
        await connectToDevice(localConfig.bluetooth_device_id); // connectToDevice 호출
      }
    } catch (error) {
      console.error("Reconnection failed:", error);
      setIsWidgetConnected(false);
      setIsBluetoothConnected(false);
    }
  };

  const disconnectAll = async () => {
    if (webSocketManagerRef.current) {
      webSocketManagerRef.current.disconnect();
      setIsWidgetConnected(false);
    }
    if (bluetoothManagerRef.current) {
      console.log("Disconnecting Bluetooth in disconnectAll...");
      await bluetoothManagerRef.current.disconnect();
      setIsBluetoothConnected(false);
    }
  };

  const selectBluetoothDevice = async (): Promise<[string, string][]> => {
    if (bluetoothManagerRef.current) {
      console.log("Scanning for Bluetooth devices...");
      const devices = await bluetoothManagerRef.current.scanDevices();
      setBluetoothDevices(devices);
      console.log("Available devices:", devices);
      return devices;
    }
    console.warn("BluetoothManager is not initialized.");
    return [];
  };
  
  const connectToDevice = async (deviceId: string) => {
    if (bluetoothManagerRef.current) {
      console.log(`Connecting to Bluetooth device with ID: ${deviceId}`);
      await bluetoothManagerRef.current.connect(deviceId);
      console.log(`Connection attempt to device ${deviceId} completed.`);
    } else {
      console.warn("BluetoothManager is not initialized.");
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
  
      await disconnectAll();
  
      const newConfig = {
        ...config,
        mode: newMode,
      };
  
      await invoke("save_config", { config: newConfig });
      dispatch(setConfig(newConfig));
      
      if (heartRateIORef.current) {
        heartRateIORef.current.updateConfig(newConfig);
        if (newMode === "widget") {
          heartRateIORef.current.setConnected(false, "bluetooth"); // 블루투스 상태 초기화
        }
      }
      if (bluetoothManagerRef.current) bluetoothManagerRef.current.updateConfig(newConfig);
      if (webSocketManagerRef.current) webSocketManagerRef.current.updateConfig(newConfig);
  
      await reconnectWithConfig(newConfig);
    } catch (error) {
      console.error("Failed to toggle mode:", error);
      setIsBluetoothConnected(false);
      setIsWidgetConnected(false);
      alert("Mode toggle failed. Please check connections and try again.");
    }
  };
  
  const reconnect = async () => {
    if (!config) {
      console.error("No configuration provided for reconnection");
      return;
    }
  
    await reconnectWithConfig(config);
  };

  useEffect(() => {
    loadConfig();
    
    return () => {
      // 컴포넌트 언마운트 시 정리
      disconnectAll();
    };
  }, []);

  useEffect(() => {
    // 연결 상태 업데이트
    if (webSocketManagerRef.current && config?.mode === "widget") {
      setIsWidgetConnected(webSocketManagerRef.current.isConnectedStatus());
    }
  
    if (bluetoothManagerRef.current && config?.mode === "bluetooth") {
      setIsBluetoothConnected(bluetoothManagerRef.current.getConnectionStatus());
    }
  }, [config?.mode]);

  useEffect(() => {
    if (heartRateIORef.current) {
      const handleConnectionChange = (isConnected: boolean, type: "bluetooth" | "widget") => {
        console.log(`Connection status changed: ${isConnected}, type: ${type}`);
        if (type === "bluetooth") {
          setIsBluetoothConnected(isConnected);
        } else if (type === "widget") {
          setIsWidgetConnected(isConnected);
        }
      };
  
      // 연결 상태 변경 리스너 등록
      heartRateIORef.current.addConnectionListener(handleConnectionChange);
  
      // 컴포넌트 언마운트 시 리스너 제거
      return () => {
        heartRateIORef.current?.removeConnectionListener(handleConnectionChange);
      };
    }
  }, [heartRateIORef.current]);

  const hrPercentage = config ? Math.min(100, (heartRate / config.max_hr) * 100) : 0;
  const isConnected = config?.mode === "bluetooth" ? isBluetoothConnected : isWidgetConnected;
  
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
                <span className="text-4xl font-bold text-gray-800 dark:text-white">{Math.round(heartRate)}</span>
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