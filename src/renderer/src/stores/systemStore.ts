import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";
import type { SystemStatus } from "@shared/types";

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
      set({ error: (error as Error).message, loading: false });
    }
  },
}));
