import type { AdoptEnvironmentInput, DiscoveredEnvironment, EnvironmentKind, EnvironmentSummary } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";

interface EnvironmentState {
  summary?: EnvironmentSummary;
  discovered: DiscoveredEnvironment[];
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  discoverExisting: (force?: boolean) => Promise<DiscoveredEnvironment[]>;
  adoptExisting: (inputs: AdoptEnvironmentInput[]) => Promise<void>;
  setActive: (environment: EnvironmentKind, id: string) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  subscribeToEnvironmentEvents: () => () => void;
}

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  summary: undefined,
  discovered: [],
  loading: false,
  error: undefined,
  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.getSummary();
      set({ summary, loading: false });
    } catch (error) {
      console.error("[environmentStore] Failed to load summary:", error);
      set({ error: `加载环境列表失败: ${getErrorMessage(error)}`, loading: false });
    }
  },
  discoverExisting: async (force = false) => {
    // Return cached results unless force is true
    if (!force && get().discovered.length > 0) {
      return get().discovered;
    }
    set({ loading: true, error: undefined });
    try {
      const discovered = await envManagerApi.environments.discover();
      set({ discovered, loading: false });
      return discovered;
    } catch (error) {
      console.error("[environmentStore] Failed to discover:", error);
      set({ error: `扫描环境失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  adoptExisting: async (inputs) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.adopt(inputs);
      set({ summary, loading: false });
    } catch (error) {
      console.error("[environmentStore] Failed to adopt:", error);
      set({ error: `接管环境失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  setActive: async (environment, id) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.setActive(environment, id);
      set({ summary, loading: false });
    } catch (error) {
      console.error("[environmentStore] Failed to switch:", error);
      set({ error: `切换激活环境失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  uninstall: async (id) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.uninstall(id);
      set({ summary, loading: false });
    } catch (error) {
      console.error("[environmentStore] Failed to uninstall:", error);
      set({ error: `卸载环境失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  subscribeToEnvironmentEvents: () =>
    envManagerApi.environments.onChanged((summary) => {
      set({ summary });
    }),
}));
