import { useDispatch, useSelector } from "react-redux";
import { setConfig } from "../store";
import { invoke } from "@tauri-apps/api/core";
import { Config } from "../types";
import { RootState } from "../store";
import { Save, X } from "lucide-react";
import React from "react";

interface Props {
  setShowSettings: (value: boolean) => void;
  bluetoothDevices: [string, string][];
  isLoadingConfig: boolean;
  onSaveComplete?: () => void;
}

export default function SettingsPanel({ 
  setShowSettings, 
  bluetoothDevices: initialDevices, 
  isLoadingConfig,
  onSaveComplete 
}: Props) {
  const dispatch = useDispatch();
  const config = useSelector((state: RootState) => state.app.config);
  const [bluetoothDevices, setBluetoothDevices] = React.useState<[string, string][]>(initialDevices);

  const updateTempConfig = (key: keyof Config, value: string | number) => {
    if (config) {
      const updatedConfig = {
        ...config,
        [key]: typeof value === "string" && typeof config[key] === "number" ? Number(value) : value,
      };
      dispatch(setConfig(updatedConfig));
    } else {
      console.error("No config available to update");
    }
  };

  const saveConfig = async () => {
    if (config) {
      try {
        await invoke("save_config", { config });
        console.log("Config saved successfully");
        setShowSettings(false);
        if (onSaveComplete) onSaveComplete();
      } catch (error) {
        console.error("Failed to save config:", error);
        alert("Failed to save config: " + (error instanceof Error ? error.message : String(error)));
      }
    } else {
      console.error("No config to save");
      alert("No config available to save");
    }
  };

  const scanBluetoothDevices = async () => {
    try {
      const devices: [string, string][] = await invoke("scan_bluetooth_devices");
      setBluetoothDevices(devices);
      if (devices.length > 0 && !config?.bluetooth_device_id) {
        updateTempConfig("bluetooth_device_id", devices[0][0]);
      }
    } catch (error) {
      console.error("Bluetooth scan failed:", error);
      alert("Bluetooth scan failed: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleBack = () => {
    setShowSettings(false);
  };

  if (isLoadingConfig) {
    return (
      <div className="bg-white dark:bg-gray-800 h-full p-3 flex items-center justify-center">
        <p className="text-gray-800 dark:text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 h-full p-3 overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Settings</h2>
        <button
          onClick={handleBack}
          className="rounded-md bg-gray-200 p-1 text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          aria-label="Close Settings"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {config ? (
        <div className="grid gap-2">
          {/* Mode 선택 */}
          <div className="space-y-0.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Mode</label>
            <select
              value={config.mode}
              onChange={(e) => updateTempConfig("mode", e.target.value as "bluetooth" | "widget")}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="bluetooth">Bluetooth</option>
              <option value="widget">Widget</option>
            </select>
          </div>

          {/* Bluetooth 모드 UI */}
          {config.mode === "bluetooth" && (
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Bluetooth Device</label>
              <div className="flex items-center gap-2">
                <select
                  value={config.bluetooth_device_id || ""}
                  onChange={(e) => updateTempConfig("bluetooth_device_id", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  <option value="">Select Device</option>
                  {bluetoothDevices.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={scanBluetoothDevices}
                  className="rounded-md bg-blue-500 p-1 text-white hover:bg-blue-600"
                >
                  Scan
                </button>
              </div>
            </div>
          )}

          {/* 위젯 모드 UI */}
          {config.mode === "widget" && (
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Widget ID</label>
              <input
                type="text"
                value={config.widget_id}
                onChange={(e) => updateTempConfig("widget_id", e.target.value)}
                className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="Enter Widget ID"
              />
            </div>
          )}

          {/* Max HR Setting */}
          <div className="space-y-0.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Max HR</label>
            <input
              type="number"
              value={config.max_hr}
              onChange={(e) => updateTempConfig("max_hr", e.target.value)}
              className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Connection Timeout */}
          <div className="space-y-0.5">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Connection Timeout (seconds)</label>
            <input
              type="number"
              value={config.timeout}
              onChange={(e) => updateTempConfig("timeout", e.target.value)}
              className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* OSC Settings Section */}
          <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">OSC Settings</h3>
            
            <div className="space-y-0.5 mb-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">OSC IP</label>
              <input
                type="text"
                value={config.osc_ip}
                onChange={(e) => updateTempConfig("osc_ip", e.target.value)}
                className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="127.0.0.1"
              />
            </div>
            
            <div className="space-y-0.5 mb-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">OSC Port</label>
              <input
                type="number"
                value={config.osc_port}
                onChange={(e) => updateTempConfig("osc_port", e.target.value)}
                className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            
            <div className="space-y-0.5 mb-1">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">HR Percent Address</label>
              <input
                type="text"
                value={config.hr_percent_address}
                onChange={(e) => updateTempConfig("hr_percent_address", e.target.value)}
                className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="/avatar/parameters/hr_percent"
              />
            </div>
            
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">HR Connected Address</label>
              <input
                type="text"
                value={config.hr_connected_address}
                onChange={(e) => updateTempConfig("hr_connected_address", e.target.value)}
                className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="/avatar/parameters/hr_connected"
              />
            </div>
          </div>

          {/* MIDI Settings Section */}
          <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">MIDI Settings</h3>
            
            <div className="space-y-0.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">MIDI Port</label>
              <input
                type="text"
                value={config.midi_port}
                onChange={(e) => updateTempConfig("midi_port", e.target.value)}
                className="w-full rounded-md border border-gray-300 p-1 text-xs text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="hroscmidi"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              onClick={saveConfig}
              className="flex items-center gap-1 rounded-md bg-blue-500 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-600"
            >
              <Save className="h-3 w-3" />
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="text-gray-800 dark:text-white">No config available</p>
      )}
    </div>
  );
}