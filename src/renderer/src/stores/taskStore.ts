import type { InstallTaskInput, ManagedTask } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";

interface TaskState {
  tasks: ManagedTask[];
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  createInstall: (input: InstallTaskInput, authorized?: boolean) => Promise<ManagedTask>;
  cancel: (id: string) => Promise<void>;
  retry: (id: string, authorized?: boolean) => Promise<ManagedTask>;
  remove: (id: string) => Promise<void>;
  clearFinished: () => Promise<void>;
  subscribeToTaskEvents: () => () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,
  error: undefined,
  load: async () => {
    set({ loading: true, error: undefined });
    try {
      const tasks = await envManagerApi.tasks.list();
      set({ tasks, loading: false });
    } catch (error) {
      console.error("[taskStore] Failed to load tasks:", error);
      set({ error: `加载任务列表失败: ${getErrorMessage(error)}`, loading: false });
    }
  },
  createInstall: async (input, authorized = false) => {
    set({ loading: true, error: undefined });
    try {
      const task = await envManagerApi.tasks.createInstall(input, authorized);
      set((state) => ({
        tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
        loading: false,
      }));
      return task;
    } catch (error) {
      console.error("[taskStore] Failed to create install task:", error);
      set({ error: `创建安装任务失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  cancel: async (id) => {
    set({ loading: true, error: undefined });
    try {
      const task = await envManagerApi.tasks.cancel(id);
      set((state) => ({
        tasks: task ? state.tasks.map((item) => (item.id === task.id ? task : item)) : state.tasks,
        loading: false,
      }));
    } catch (error) {
      console.error("[taskStore] Failed to cancel task:", error);
      set({ error: `取消任务失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  retry: async (id, authorized = false) => {
    set({ loading: true, error: undefined });
    try {
      const task = await envManagerApi.tasks.retry(id, authorized);
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === task.id ? task : item)),
        loading: false,
      }));
      return task;
    } catch (error) {
      console.error("[taskStore] Failed to retry task:", error);
      set({ error: `重试任务失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  remove: async (id) => {
    set({ loading: true, error: undefined });
    try {
      const tasks = await envManagerApi.tasks.remove(id);
      set({ tasks, loading: false });
    } catch (error) {
      console.error("[taskStore] Failed to remove task:", error);
      set({ error: `移除任务失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  clearFinished: async () => {
    set({ loading: true, error: undefined });
    try {
      const tasks = await envManagerApi.tasks.clearFinished();
      set({ tasks, loading: false });
    } catch (error) {
      console.error("[taskStore] Failed to clear finished:", error);
      set({ error: `清理历史任务失败: ${getErrorMessage(error)}`, loading: false });
      throw error;
    }
  },
  subscribeToTaskEvents: () =>
    envManagerApi.tasks.onChanged((tasks) => {
      set({ tasks });
    }),
}));
