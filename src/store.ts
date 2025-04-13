import { configureStore, createSlice } from "@reduxjs/toolkit";
import { Config } from "./types";

interface AppState {
  config: Config | null;
  isConnected: boolean;
  heartRate: number;
}

const initialState: AppState = {
  config: null,
  isConnected: false,
  heartRate: 0,
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setConfig: (state, action) => {
      state.config = action.payload;
    },
    setConnected: (state, action) => {
      state.isConnected = action.payload;
    },
    setHeartRate: (state, action) => {
      state.heartRate = action.payload;
    },
  },
});

export const { setConfig, setConnected, setHeartRate } = appSlice.actions;
export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch; // AppDispatch 타입 추가