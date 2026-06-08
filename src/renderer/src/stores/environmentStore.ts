import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";
import type { EnvironmentKind, EnvironmentSummary } from "@shared/types";

interface EnvironmentState {
  summary?: EnvironmentSummary;
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  setActive: (environment: EnvironmentKind, id: string) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  subscribeToEnvironmentEvents: () => () => void;
}

export const useEnvironmentStore = create<EnvironmentState>((set) => ({
  summary: undefined,
  loading: false,
  error: undefined,
  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.getSummary();
      set({ summary, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },
  setActive: async (environment, id) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.setActive(environment, id);
      set({ summary, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },
  uninstall: async (id) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.uninstall(id);
      set({ summary, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },
  subscribeToEnvironmentEvents: () =>
    envManagerApi.environments.onChanged((summary) => {
      set({ summary });
    }),
}));
