import type { AppConfig } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";

interface ConfigState {
  config?: AppConfig;
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  update: (patch: Partial<AppConfig>) => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: undefined,
  loading: false,
  error: undefined,
  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const config = await envManagerApi.config.get();
      set({ config, loading: false });
    } catch (error) {
      console.error("[configStore] Failed to load config:", error);
      set({ error: `加载配置失败: ${getErrorMessage(error)}`, loading: false });
    }
  },
  update: async (patch) => {
    set({ loading: true, error: undefined });
    try {
      const config = await envManagerApi.config.update(patch);
      set({ config, loading: false });
    } catch (error) {
      console.error("[configStore] Failed to update config:", error);
      set({ error: `更新配置失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
}));
