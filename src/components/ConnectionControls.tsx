import { Bluetooth, RefreshCw, Settings } from "lucide-react";
import React, { useEffect } from "react";
import { Config } from "../types";

interface Props {
  tempConfig: Config;
  reconnect: () => Promise<void>;
  selectBluetoothDevice: () => Promise<[string, string][]>;
  setShowSettings: (value: boolean) => void;
  showSettings: boolean;
  isWidgetMode: boolean;
  isBluetoothConnected: boolean; // Bluetooth 연결 상태
  addBluetoothListener: () => void; // Bluetooth 리스너 추가
  removeBluetoothListener: () => void; // Bluetooth 리스너 제거
  connectToDevice: (deviceId: string) => Promise<void>; // Bluetooth 장치 연결
}

export default function ConnectionControls({
  reconnect,
  selectBluetoothDevice,
  setShowSettings,
  showSettings,
  isWidgetMode,
  isBluetoothConnected,
  addBluetoothListener,
  removeBluetoothListener,
  tempConfig,
  connectToDevice,
}: Props) {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleReconnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await reconnect();
      console.log("Reconnection successful");
    } catch (err) {
      console.error("Reconnect failed:", err);
      setError(err instanceof Error ? err.message : "Reconnection failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBluetoothDevice = async () => {
    if (isBluetoothConnected) {
      console.log("Device is already connected. Cancelling scan.");
      return; // 이미 연결되어 있으면 작업 취소
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("Starting periodic Bluetooth device scan...");
      const intervalId = setInterval(async () => {
        try {
          const devices: [string, string][] = await selectBluetoothDevice();
          console.log("Scanned devices:", devices);

          // 저장된 Bluetooth ID와 일치하는 장치 검색
          const targetDevice = devices.find(([id]) => id === tempConfig.bluetooth_device_id);

          if (targetDevice) {
            console.log(`Target device found: ${targetDevice[1]} (${targetDevice[0]})`);
            clearInterval(intervalId); // 검색 종료
            await connectToDevice(targetDevice[0]); // 해당 장치에 연결
          }
        } catch (scanError) {
          console.error("Error during Bluetooth scan:", scanError);
        }
      }, 1000); // 1초마다 검색
    } catch (err) {
      console.error("Bluetooth selection failed:", err);
      setError("Failed to select Bluetooth device.");
    } finally {
      setIsLoading(false);
    }
  };

  // Bluetooth 연결 상태에 따라 리스너 관리
  useEffect(() => {
    if (isBluetoothConnected) {
      console.log("Bluetooth connected. Adding listener...");
      addBluetoothListener();
    } 
  }, [isBluetoothConnected, addBluetoothListener]);

  return (
    <div className="flex items-center gap-1">
      {/* Reconnect 버튼 */}
      <button
        onClick={handleReconnect}
        className={`flex items-center justify-center rounded-md p-1 ${
          isBluetoothConnected || isLoading
            ? "bg-gray-300 cursor-not-allowed"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
        disabled={isBluetoothConnected || isLoading}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
      </button>

      {/* Bluetooth 스캔 버튼 */}
      <button
        onClick={handleSelectBluetoothDevice}
        className={`flex items-center justify-center rounded-md p-1 text-white transition-colors ${
          isWidgetMode
            ? "bg-gray-300 cursor-not-allowed"
            : isLoading
            ? "bg-blue-500 opacity-50 cursor-not-allowed"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
        disabled={isWidgetMode || isLoading} // isWidgetMode가 true일 때 비활성화
        aria-label="Scan Bluetooth Devices"
      >
        <Bluetooth className="h-3.5 w-3.5" />
      </button>

      {/* 설정 버튼 */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center justify-center rounded-md bg-gray-200 p-1 text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        aria-label="Settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {/* 에러 메시지 */}
      {error && (
        <span className="ml-2 text-sm text-red-500" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}