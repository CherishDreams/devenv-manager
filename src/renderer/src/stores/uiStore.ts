import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  themeStyle: "solid" | "vibrant";
  setThemeStyle: (style: "solid" | "vibrant") => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeStyle: "solid",
      setThemeStyle: (style) => set({ themeStyle: style }),
    }),
    {
      name: "ui-storage",
    }
  )
);
