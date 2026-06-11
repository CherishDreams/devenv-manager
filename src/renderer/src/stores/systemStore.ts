import type { SystemStatus } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";

interface SystemState {
  status?: SystemStatus;
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
}

export const useSystemStore = create<SystemState>((set) => ({
  status: undefined,
  loading: false,
  error: undefined,
  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const status = await envManagerApi.system.getStatus();
      set({ status, loading: false });
    } catch (error) {
      console.error("[systemStore] Failed to load system status:", error);
      set({ error: `获取系统状态失败: ${getErrorMessage(error)}`, loading: false });
    }
  },
}));
