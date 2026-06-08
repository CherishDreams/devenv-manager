import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";
import type { AppConfig } from "@shared/types";

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
      set({ error: (error as Error).message, loading: false });
    }
  },
  update: async (patch) => {
    set({ loading: true, error: undefined });
    try {
      const config = await envManagerApi.config.update(patch);
      set({ config, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },
}));
