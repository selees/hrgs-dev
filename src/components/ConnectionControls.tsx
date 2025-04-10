import { Bluetooth, RefreshCw, Settings } from "lucide-react";
import React from "react";
import { Config } from "../types";

interface Props {
  tempConfig: Config;
  reconnect: () => Promise<void>;
  selectBluetoothDevice: () => Promise<[string, string][]>;
  setShowSettings: (value: boolean) => void;
  showSettings: boolean;
}

export default function ConnectionControls({ reconnect, selectBluetoothDevice, setShowSettings, showSettings }: Props) {
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
    setIsLoading(true);
    setError(null);
    try {
      await selectBluetoothDevice(); // 반환값은 여기서 사용하지 않음
      console.log("Bluetooth device selection initiated");
    } catch (err) {
      console.error("Bluetooth selection failed:", err);
      setError("Failed to select Bluetooth device.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleReconnect}
        className={`flex items-center justify-center rounded-md bg-blue-500 p-1 text-white transition-colors ${
          isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-600"
        }`}
        disabled={isLoading}
        aria-label="Reconnect"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
      </button>
      <button
        onClick={handleSelectBluetoothDevice}
        className={`flex items-center justify-center rounded-md bg-blue-500 p-1 text-white transition-colors ${
          isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-600"
        }`}
        disabled={isLoading}
        aria-label="Scan Bluetooth Devices"
      >
        <Bluetooth className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center justify-center rounded-md bg-gray-200 p-1 text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        aria-label="Settings"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
      {error && (
        <span className="ml-2 text-sm text-red-500" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}