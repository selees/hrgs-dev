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
import { HyperateManager } from "./managers/HyperateManager";

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
  const [isScanning, setIsScanning] = useState(false); // 스캔 진행 상태 (UI용)
  const [isConnecting, setIsConnecting] = useState(false); // 장치 연결 시도 상태 (UI용)
  const [isSystemConnected, setIsSystemConnected] = useState<boolean>(false); // 시스템 연결 상태
  const [guiIsConnected, setGuiIsConnected] = useState<boolean>(false); // GUI 연결 상태
  const [isVrcDetected, setIsVrcDetected] = useState<boolean>(false); // VRChat OSCQuery 감지 상태
  const [isMidiActive, setIsMidiActive] = useState<boolean>(false); // MIDI 활성화 상태
  
  const [oscRate, setOscRate] = useState<number>(0);
  const [oscPackets, setOscPackets] = useState<number>(0);
  const oscTimestampsRef = useRef<number[]>([]);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // 매니저 인스턴스를 ref로 관리
  const heartRateIORef = useRef<HeartRateInputOutput | null>(null);
  const bluetoothManagerRef = useRef<BluetoothManager | null>(null);
  const webSocketManagerRef = useRef<WebSocketManager | null>(null);
  const hyperateManagerRef = useRef<HyperateManager | null>(null);
  const connectionControlsRef = useRef<{ handleReconnect: () => Promise<void> }>(null);

  const loadConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const loadedConfig: Config | null = await invoke("load_config");
      let finalConfig: Config;
  
      if (loadedConfig) {
        finalConfig = {
          ...loadedConfig,
          osc_auto: loadedConfig.osc_auto ?? true,
        };
        console.log("Loaded config:", finalConfig);

        // If osc_auto is enabled, attempt auto-detection of VRChat on startup
        if (finalConfig.osc_auto) {
          try {
            const service: { name: string; osc_ip: string; osc_port: number } | null = await invoke("detect_vrchat_osc");
            if (service) {
              finalConfig.osc_ip = service.osc_ip;
              finalConfig.osc_port = service.osc_port;
              console.log("OSCQuery Auto-detected on startup:", service);
              setIsVrcDetected(true);
            } else {
              setIsVrcDetected(false);
            }
          } catch (e) {
            console.error("OSCQuery auto-detect on startup failed:", e);
            setIsVrcDetected(false);
          }
        } else {
          setIsVrcDetected(false);
        }
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
          bluetooth_device_name: "",
          osc_auto: true,
        };
        await invoke("save_config", { config: defaultConfig });
        finalConfig = defaultConfig;
        console.log("Initialized default config:", finalConfig);
        setIsVrcDetected(false);
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
        reconnectWithConfig(finalConfig).catch(console.error);
      } else if (finalConfig.mode === "bluetooth" && finalConfig.bluetooth_device_id) {
        console.log("Config mode is 'bluetooth', initiating reconnect with loaded config...");
        reconnectWithConfig(finalConfig).catch(console.error);
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
        bluetooth_device_name: "",
        osc_auto: true,
      };
      await invoke("save_config", { config: defaultConfig });
      dispatch(setConfig(defaultConfig));
      initializeManagers(defaultConfig);
      setIsVrcDetected(false);
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
    heartRateIORef.current.setMidiActive(isMidiActive);
  
    if (config.mode === "bluetooth") {
      if (!bluetoothManagerRef.current) {
        bluetoothManagerRef.current = new BluetoothManager(config, heartRateIORef.current);
      } else {
        bluetoothManagerRef.current.updateConfig(config);
      }
      
      // 위젯 모듈 캐시 정리
      if (webSocketManagerRef.current) {
        webSocketManagerRef.current.disconnect();
        webSocketManagerRef.current = null;
      }
      if (hyperateManagerRef.current) {
        hyperateManagerRef.current.disconnect();
        hyperateManagerRef.current = null;
      }
    } else if (config.mode === "widget") {
      // HypeRate ID vs Pulsoid ID 구분
      const isHyperate = config.widget_id && config.widget_id.length <= 10 && !config.widget_id.includes("-");
      
      if (isHyperate) {
        if (!hyperateManagerRef.current) {
          hyperateManagerRef.current = new HyperateManager(config, heartRateIORef.current);
        } else {
          hyperateManagerRef.current.updateConfig(config);
        }
        
        // 펄소이드 모듈 캐시 정리
        if (webSocketManagerRef.current) {
          webSocketManagerRef.current.disconnect();
          webSocketManagerRef.current = null;
        }
      } else {
        if (!webSocketManagerRef.current) {
          webSocketManagerRef.current = new WebSocketManager(config, heartRateIORef.current);
        } else {
          webSocketManagerRef.current.updateConfig(config);
        }
        
        // HypeRate 모듈 캐시 정리
        if (hyperateManagerRef.current) {
          hyperateManagerRef.current.disconnect();
          hyperateManagerRef.current = null;
        }
      }

      // 블루투스 모듈 캐시 정리
      if (bluetoothManagerRef.current) {
        bluetoothManagerRef.current.disconnect();
        bluetoothManagerRef.current = null;
      }
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
        
        // HypeRate ID vs Pulsoid ID 구분 (HypeRate는 대체로 7자리 또는 하이픈 없음)
        if (localConfig.widget_id.length <= 10 && !localConfig.widget_id.includes("-")) {
          if (hyperateManagerRef.current) {
            console.log("Reconnecting to HypeRate WebSocket...");
            await hyperateManagerRef.current.connect();
          }
        } else {
          if (webSocketManagerRef.current) {
            console.log("Reconnecting to Pulsoid WebSocket...");
            await webSocketManagerRef.current.connect();
            // setIsWidgetConnected is handled via event listener
          }
        }
      } else if (localConfig.mode === "bluetooth") {
        if(localConfig.bluetooth_device_id !== ""){
          if (connectionControlsRef.current && connectionControlsRef.current.handleReconnect) {
              await connectionControlsRef.current.handleReconnect();
          }
        }
      }
    }catch (error) {
            console.error("Reconnection failed:", error);
            setIsWidgetConnected(false);
            setIsBluetoothConnected(false);
            setIsScanning(false);
            setIsConnecting(false);
    }
  }
    
  const disconnectAll = async () => {
    try {
      if (webSocketManagerRef.current) {
        console.log("Disconnecting WebSocket...");
        webSocketManagerRef.current.disconnect();
        setIsWidgetConnected(false);
      }

      if (hyperateManagerRef.current) {
        console.log("Disconnecting HypeRate WebSocket...");
        hyperateManagerRef.current.disconnect();
        // Uses the same widget status
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
      setIsConnecting(true);
      try {
        console.log(`Connecting to Bluetooth device with ID: ${deviceId}`);
        await bluetoothManagerRef.current.connect(deviceId);
        console.log(`Connection attempt to device ${deviceId} completed.`);
        // Assume success if no exception thrown
        setIsBluetoothConnected(true);
      } catch (err) {
        console.error(`Failed to connect to Bluetooth device ${deviceId}:`, err);
        setIsBluetoothConnected(false);
        setError(typeof err === "string" ? err : (err as Error)?.message ?? "Bluetooth connect failed");
      } finally {
        setIsConnecting(false);
      }
    } else {
      console.warn("BluetoothManager is not initialized.");
      setIsBluetoothConnected(false);
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
  
      const newConfig: Config = {
        ...config,
        mode: newMode as "bluetooth" | "widget",
      };
  
      await invoke("save_config", { config: newConfig });
      dispatch(setConfig(newConfig));
      
      if (heartRateIORef.current) {
        heartRateIORef.current.updateConfig(newConfig);
        heartRateIORef.current.setConnected(false, currentMode as "bluetooth" | "widget");
      }
  
      // 최신 config를 바탕으로 매니저 초기화 및 불필요한 매니저 제거
      initializeManagers(newConfig);

      reconnectWithConfig(newConfig).catch(console.error);
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

      // 최신 config를 바탕으로 매니저 초기화 및 불필요한 매니저 제거
      initializeManagers(config);

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


  const handleConnectionChange = useCallback(
    (isConnected: boolean, type: "bluetooth" | "widget") => {
      console.log(`System connection status changed: ${isConnected}, type: ${type}`);
      setIsSystemConnected(isConnected);
      if (isConnected) {
        setGuiIsConnected(true);
        if (type === "bluetooth") setIsBluetoothConnected(true);
        if (type === "widget") setIsWidgetConnected(true);
      } else {
        setTimeout(() => {
          setGuiIsConnected(false);
          if (type === "bluetooth") setIsBluetoothConnected(false);
          if (type === "widget") setIsWidgetConnected(false);
        }, 1000);
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

  // 1. Calculate OSC rate and prune timestamps every second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const threshold = now - 5000;
      oscTimestampsRef.current = oscTimestampsRef.current.filter(t => t > threshold);
      const rate = oscTimestampsRef.current.length / 5;
      setOscRate(rate);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Track heart rate changes to count OSC messages
  useEffect(() => {
    if (heartRate > 0 && guiIsConnected) {
      const now = Date.now();
      oscTimestampsRef.current.push(now);
      setOscPackets(prev => prev + 1);
      
      const threshold = now - 5000;
      oscTimestampsRef.current = oscTimestampsRef.current.filter(t => t > threshold);
      const rate = oscTimestampsRef.current.length / 5;
      setOscRate(rate);
    } else {
      setOscRate(0);
    }
  }, [heartRate, guiIsConnected]);
 
  // 2.5. Check MIDI port existence and disable it if not found when connected
  useEffect(() => {
    const verifyMidiPort = async () => {
      if (!config || !config.midi_port || config.midi_port === "None" || config.midi_port === "none") {
        setIsMidiActive(false);
        if (heartRateIORef.current) {
          heartRateIORef.current.setMidiActive(false);
        }
        return;
      }
      
      try {
        const exists = await invoke<boolean>("check_midi_port", { portName: config.midi_port });
        setIsMidiActive(exists);
        if (heartRateIORef.current) {
          heartRateIORef.current.setMidiActive(exists);
        }
      } catch (err) {
        console.error("Failed to check MIDI port:", err);
        setIsMidiActive(false);
        if (heartRateIORef.current) {
          heartRateIORef.current.setMidiActive(false);
        }
      }
    };

    if (!showSettings) {
      verifyMidiPort();
    }
  }, [config?.midi_port, showSettings]);

  // 3. Background search for VRChat if osc_auto is true
  useEffect(() => {
    let intervalId: any = null;
    let isChecking = false;

    if (config?.osc_auto) {
      if (!isVrcDetected) {
        const checkOsc = async () => {
          if (isChecking) return;
          isChecking = true;
          try {
            const service: { name: string; osc_ip: string; osc_port: number } | null = await invoke("detect_vrchat_osc");
            if (service) {
              console.log("OSCQuery background detection found VRChat:", service);
              const currentConfig = configRef.current;
              if (currentConfig) {
                const updatedConfig = {
                  ...currentConfig,
                  osc_ip: service.osc_ip,
                  osc_port: service.osc_port,
                };
                dispatch(setConfig(updatedConfig));
                await invoke("save_config", { config: updatedConfig });
              }
              setIsVrcDetected(true);
              
              // Clear interval once VRChat is detected
              if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
              }
            }
          } catch (err) {
            console.error("OSCQuery background detection failed:", err);
          } finally {
            isChecking = false;
          }
        };

        // Run check immediately
        checkOsc();

        // Schedule interval to run every 5 seconds until VRChat is found
        intervalId = setInterval(checkOsc, 5000);
      }
    } else {
      setIsVrcDetected(false);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [config?.osc_auto, isVrcDetected]);

  const hrPercentage = config ? Math.min(100, (heartRate / config.max_hr) * 100) : 0;
  const isConnected = heartRateIORef.current?.isDeviceConnected() ?? false;
  
  return (
    <div className="bg-gray-100 dark:bg-gray-900 w-[320px] h-[260px] overflow-hidden select-none">
      {!showSettings ? (
        <div className="bg-white dark:bg-gray-800 h-full p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700/50 pb-1.5">
            {/* BLE/Widget status with mode toggle button */}
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
              <span className={`h-1.5 w-1.5 rounded-full ${guiIsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
              <button
                onClick={toggleMode}
                className="px-1 py-0.5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-650 text-gray-700 dark:text-gray-200 font-bold text-[9px] transition-colors uppercase cursor-pointer"
                title="Click to toggle connection mode"
              >
                {config?.mode === "bluetooth" ? "BLE" : "Widget"}
              </button>
              <span className="truncate max-w-[170px]">
                {guiIsConnected
                  ? (config?.mode === "bluetooth" 
                    ? `${config?.bluetooth_device_name || "Device"} Connected` 
                    : `${config?.widget_id && config.widget_id.length <= 10 && !config.widget_id.includes("-") ? "HypeRate" : "Pulsoid"} Connected`)
                  : "Disconnected"}
              </span>
            </div>
            <ConnectionControls
              ref={connectionControlsRef}
              tempConfig={config as Config}
              reconnect={reconnect}
              guiIsConnected={guiIsConnected}
              selectBluetoothDevice={selectBluetoothDevice}
              setShowSettings={setShowSettings}
              showSettings={showSettings}
              isWidgetMode={config?.mode === "widget"}
              isBluetoothConnected={isBluetoothConnected}
              connectToDevice={connectToDevice}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              isReconnecting={isReconnecting}
              isConnecting={isConnecting}
            />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-2">
            <div className="relative h-36 w-36">
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-extrabold text-gray-800 dark:text-white leading-tight">{Math.round(heartRate)}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-none mb-0.5">BPM</span>
                {config && (
                  <span className="text-xs text-blue-500 dark:text-blue-400 font-bold mt-0.5 leading-none">
                    {(heartRate / config.max_hr).toFixed(2)}
                  </span>
                )}
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
          </div>

          {/* OSC and MIDI Bottom Status Bar */}
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700/50 pt-1.5 text-[9px] font-semibold text-gray-500 dark:text-gray-400 select-none">
            <div className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${
                config?.osc_auto && !isVrcDetected
                  ? "bg-yellow-500 animate-pulse"
                  : guiIsConnected 
                    ? "bg-green-500 animate-pulse" 
                    : "bg-gray-400"
              }`}></span>
              <span>
                OSC: {
                  config?.osc_auto && !isVrcDetected
                    ? "Wait.."
                    : guiIsConnected 
                      ? `Out (${config?.osc_port}/${oscRate.toFixed(1)} fps)` 
                      : `Idle (${config?.osc_port || 9000})`
                }
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${
                guiIsConnected && isMidiActive
                  ? "bg-green-500 animate-pulse" 
                  : "bg-gray-400"
              }`}></span>
              <span className="truncate max-w-[130px]">
                MIDI: {
                  !isMidiActive
                    ? "Off"
                    : guiIsConnected 
                      ? `Out (${config?.midi_port})` 
                      : `Idle (${config?.midi_port})`
                }
              </span>
            </div>
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
