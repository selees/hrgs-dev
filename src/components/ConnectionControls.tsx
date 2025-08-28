import { Bluetooth, RefreshCw, Settings } from "lucide-react";
import React, { useEffect, forwardRef, useImperativeHandle } from "react";
import { Config } from "../types";

interface Props {
  handleReconnect?: () => Promise<void>;
  tempConfig: Config;
  reconnect: () => Promise<void>;
  selectBluetoothDevice: () => Promise<[string, string][]>;
  setShowSettings: (value: boolean) => void;
  showSettings: boolean;
  isWidgetMode: boolean;
  isBluetoothConnected: boolean; // Bluetooth 연결 상태
  connectToDevice: (deviceId: string) => Promise<void>; // Bluetooth 장치 연결
  isScanning?: boolean;
  setIsScanning: React.Dispatch<React.SetStateAction<boolean>>;
  isReconnecting?: boolean;
  isConnecting?: boolean;
  scanAndConnectBluetoothDevice?: (deviceId?: string) => Promise<void>;
  canReconnect?: boolean;
  guiIsConnected: boolean; // GUI 연결 상태
}

const ConnectionControls = forwardRef<{ handleReconnect: () => Promise<void> }, Props>((
  {
    reconnect,
    selectBluetoothDevice,
    setShowSettings,
    showSettings,
    isWidgetMode,
    tempConfig,
    connectToDevice,
    isReconnecting = false,
    isConnecting = false,
    guiIsConnected,
  }: Props,
  ref
) => {
  const [isLoading, setIsLoading] = React.useState(false); // 로컬 즉시 피드백용
  const [error, setError] = React.useState<string | null>(null);

  const handleReconnect = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isWidgetMode) {
        // 위젯 모드일 때는 일반 재접속 함수 호출
        await reconnect();
      } else {
        // 블루투스 모드일 때
        let found = false;
        while (!found) {
          // 5초간 스캔
          const scanEnd = Date.now() + 5000;
          while (Date.now() < scanEnd) {
            const devices: [string, string][] = await selectBluetoothDevice();
            const targetDevice = devices.find(([id]) => id === tempConfig.bluetooth_device_id);
            if (targetDevice) {
              await connectToDevice(targetDevice[0]);
              found = true;
              break;
            }
            await new Promise(res => setTimeout(res, 1000));
          }
          // 5초 동안 못 찾으면 다시 반복
          if (!found) {
            console.log("Saved device not found, continuing scan...");
          }
        }
      }
      console.log("Reconnection successful");
    } catch (err) {
      console.error("Reconnect failed:", err);
      setError(err instanceof Error ? err.message : "Reconnection failed.");
    } finally {
      setIsLoading(false);
    }
  };

  // 외부에서 handleReconnect를 사용할 수 있도록 노출
  useImperativeHandle(ref, () => ({
    handleReconnect
  }));

  return (
    <div className="flex items-center gap-1">
      {/* Reconnect 버튼만 남김 */}
      <button
        onClick={handleReconnect}
        className={`flex items-center justify-center rounded-md p-1 ${
          isLoading || isReconnecting || isConnecting || guiIsConnected
            ? "bg-gray-300 cursor-not-allowed"
            : "bg-blue-500 hover:bg-blue-600"
        }`}
        disabled={isLoading || isReconnecting || isConnecting || guiIsConnected}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isReconnecting || isConnecting ? "animate-spin" : ""}`} />
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
});

export default ConnectionControls;