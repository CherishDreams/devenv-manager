import type { ThemeStyle } from "../theme/themeDefinitions";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultThemeStyle, normalizeThemeStyle } from "../theme/themeDefinitions";

interface UiState {
  themeStyle: ThemeStyle;
  setThemeStyle: (style: ThemeStyle) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      themeStyle: defaultThemeStyle,
      setThemeStyle: (style) => set({ themeStyle: style }),
    }),
    {
      name: "ui-storage",
      merge: (persistedState, currentState) => ({
        ...currentState,
        themeStyle: normalizeThemeStyle((persistedState as Partial<UiState> | undefined)?.themeStyle),
      }),
    },
  ),
);
