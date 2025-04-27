import { useEffect, useState, useRef, useCallback } from "react";
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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSystemConnected, setIsSystemConnected] = useState<boolean>(false); // 시스템 연결 상태
  const [guiIsConnected, setGuiIsConnected] = useState<boolean>(false); // GUI 연결 상태
  
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
      heartRateIORef.current.updateConfig(config);
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
          setIsWidgetConnected(isConnected);
          if (isConnected && heartRateIORef.current) {
            console.log("Setting HeartRateInputOutput to widget mode connected");
            heartRateIORef.current.setConnected(true, "widget");
          }
        }
      } else if (localConfig.mode === "bluetooth") {
        if (!localConfig.bluetooth_device_id) {
          console.error("Bluetooth device ID is not configured");
          return;
        }
        console.log(`Reconnecting to Bluetooth device: ${localConfig.bluetooth_device_id}`);
        await connectToDevice(localConfig.bluetooth_device_id);
      }
    } catch (error) {
      console.error("Reconnection failed:", error);
      setIsWidgetConnected(false);
      setIsBluetoothConnected(false);
    }
  };

  const disconnectAll = async () => {
    try {
      if (webSocketManagerRef.current) {
        console.log("Disconnecting WebSocket...");
        webSocketManagerRef.current.disconnect();
        setIsWidgetConnected(false);
      }
  
      if (bluetoothManagerRef.current) {
        console.log("Disconnecting Bluetooth...");
        await bluetoothManagerRef.current.disconnect();
        setIsBluetoothConnected(false);
      }
  
      if (heartRateIORef.current) {
        console.log("Resetting HeartRateInputOutput connection...");
        heartRateIORef.current.setConnected(false, "bluetooth");
      }
    } catch (error) {
      console.error("Error during disconnectAll:", error);
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
  
      // 기존 리스너 정리
      if (heartRateIORef.current) {
        heartRateIORef.current.removeConnectionListener(handleConnectionChange);
      }
  
      await disconnectAll();
  
      const newConfig = {
        ...config,
        mode: newMode,
      };
  
      await invoke("save_config", { config: newConfig });
      dispatch(setConfig(newConfig));
      
      if (heartRateIORef.current) {
        heartRateIORef.current.updateConfig(newConfig);
        heartRateIORef.current.setConnected(false, currentMode as "bluetooth" | "widget");
      }
  
      await reconnectWithConfig(newConfig);
    } catch (error) {
      console.error("Failed to toggle mode:", error);
      setIsBluetoothConnected(false);
      setIsWidgetConnected(false);
    }
  };
  
  const reconnect = async () => {
    if (isReconnecting) {
      console.warn("Reconnection is already in progress.");
      return;
    }

    setIsReconnecting(true);
    try {
      if (!config) {
        console.error("No configuration provided for reconnection");
        return;
      }

      console.log("Starting reconnection...");

      // 기존 연결 종료 및 리스너 정리
      await disconnectAll();

      // 새로운 연결 수행
      await reconnectWithConfig(config);

      console.log("Reconnection completed.");
    } catch (error) {
      console.error("Reconnection failed:", error);
      setError("Reconnection failed.");
    } finally {
      setIsReconnecting(false);
    }
  };

  const addBluetoothListener = () => {
    if (bluetoothManagerRef.current) {
      bluetoothManagerRef.current.addBluetoothListener();
    }
  };

  const removeBluetoothListener = () => {
    if (bluetoothManagerRef.current) {
      bluetoothManagerRef.current.removeBluetoothListener();
    }
  };

  const handleConnectionChange = useCallback(
    (isConnected: boolean, type: "bluetooth" | "widget") => {
      console.log(`System connection status changed: ${isConnected}, type: ${type}`);
      setIsSystemConnected(isConnected); // 시스템 연결 상태 업데이트

      // GUI 상태 업데이트
      if (isConnected) {
        setGuiIsConnected(true);
      } else {
        setTimeout(() => {
          setGuiIsConnected(false); // 타임아웃 후 GUI 상태 업데이트
        }, 1000); // 사용자 경험을 위해 약간의 지연 추가
      }
    },
    []
  );

  useEffect(() => {
    loadConfig();
    
    return () => {
      // 컴포넌트 언마운트 시 정리
      disconnectAll();
    };
  }, []);

  useEffect(() => {
    if (heartRateIORef.current) {
      heartRateIORef.current.addConnectionListener(handleConnectionChange);
  
      return () => {
        heartRateIORef.current?.removeConnectionListener(handleConnectionChange);
      };
    }
  }, [handleConnectionChange]);

  useEffect(() => {
    if (heartRateIORef.current) {
      const handleGuiConnectionChange = (isConnected: boolean) => {
        console.log(`GUI connection status changed: ${isConnected}`);
        setGuiIsConnected(isConnected);
      };
  
      console.log("Adding GUI connection listener...");
      heartRateIORef.current.addGuiConnectionListener(handleGuiConnectionChange);
  
      return () => {
        console.log("Removing GUI connection listener...");
        heartRateIORef.current?.removeGuiConnectionListener(handleGuiConnectionChange);
      };
    }
  }, [heartRateIORef.current]);

  const hrPercentage = config ? Math.min(100, (heartRate / config.max_hr) * 100) : 0;
  const isConnected = heartRateIORef.current?.isDeviceConnected() ?? false;
  
  return (
    <div className="bg-gray-100 dark:bg-gray-900 w-[320px] h-[260px] overflow-hidden">
      {!showSettings ? (
        <div className="bg-white dark:bg-gray-800 h-full p-3">
          <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <div className={`h-2 w-2 rounded-full ${guiIsConnected ? "bg-green-500" : "bg-red-500"}`}></div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {guiIsConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <ConnectionControls
              tempConfig={config as Config}
              reconnect={reconnect}
              selectBluetoothDevice={selectBluetoothDevice}
              setShowSettings={setShowSettings}
              showSettings={showSettings}
              isWidgetMode={config?.mode === "widget"}
              isBluetoothConnected={isBluetoothConnected}
              addBluetoothListener={addBluetoothListener}
              removeBluetoothListener={removeBluetoothListener}
              connectToDevice={connectToDevice}
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
