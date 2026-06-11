import type { AdoptEnvironmentInput, DiscoveredEnvironment, EnvironmentKind, EnvironmentSummary } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";

interface EnvironmentState {
  summary?: EnvironmentSummary;
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  discoverExisting: () => Promise<DiscoveredEnvironment[]>;
  adoptExisting: (inputs: AdoptEnvironmentInput[]) => Promise<void>;
  setActive: (environment: EnvironmentKind, id: string, authorized?: boolean) => Promise<void>;
  uninstall: (id: string, authorized?: boolean) => Promise<void>;
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
      console.error("[environmentStore] Failed to load summary:", error);
      set({ error: `加载环境列表失败: ${getErrorMessage(error)}`, loading: false });
    }
  },
  discoverExisting: async () => {
    set({ loading: true, error: undefined });
    try {
      const discovered = await envManagerApi.environments.discover();
      set({ loading: false });
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
  setActive: async (environment, id, authorized = false) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.setActive(environment, id, authorized);
      set({ summary, loading: false });
    } catch (error) {
      console.error("[environmentStore] Failed to switch:", error);
      set({ error: `切换激活环境失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  uninstall: async (id, authorized = false) => {
    set({ loading: true, error: undefined });
    try {
      const summary = await envManagerApi.environments.uninstall(id, authorized);
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
