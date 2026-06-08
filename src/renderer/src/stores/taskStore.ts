import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";
import type { InstallTaskInput, ManagedTask } from "@shared/types";

interface TaskState {
  tasks: ManagedTask[];
  loading: boolean;
  error?: string;
  load: () => Promise<void>;
  createInstall: (input: InstallTaskInput) => Promise<ManagedTask>;
  cancel: (id: string) => Promise<void>;
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
      set({ error: (error as Error).message, loading: false });
    }
  },
  createInstall: async (input) => {
    set({ loading: true, error: undefined });
    try {
      const task = await envManagerApi.tasks.createInstall(input);
      set((state) => ({
        tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
        loading: false,
      }));
      return task;
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
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
      set({ error: (error as Error).message, loading: false });
      throw error;
    }
  },
  subscribeToTaskEvents: () =>
    envManagerApi.tasks.onChanged((tasks) => {
      set({ tasks });
    }),
}));
