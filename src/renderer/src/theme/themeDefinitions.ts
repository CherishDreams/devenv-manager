export type ThemeStyle = "default" | "liquidGlass";

interface ThemeDefinition {
  id: ThemeStyle;
  label: string;
  bodyClass: string;
  token: {
    borderRadius: number;
    colorPrimary: string;
    fontFamily: string;
    colorBgContainer: string;
    colorBgElevated: string;
  };
}

const appFontFamily =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const defaultThemeStyle: ThemeStyle = "default";

export const themeDefinitions: Record<ThemeStyle, ThemeDefinition> = {
  default: {
    id: "default",
    label: "默认主题",
    bodyClass: "theme-default",
    token: {
      borderRadius: 8,
      colorPrimary: "#1668dc",
      fontFamily: appFontFamily,
      colorBgContainer: "rgba(255, 255, 255, 0.4)",
      colorBgElevated: "rgba(255, 255, 255, 0.8)",
    },
  },
  liquidGlass: {
    id: "liquidGlass",
    label: "液态玻璃",
    bodyClass: "theme-liquid-glass",
    token: {
      borderRadius: 8,
      colorPrimary: "#0f79d8",
      fontFamily: appFontFamily,
      colorBgContainer: "rgba(255, 255, 255, 0.32)",
      colorBgElevated: "rgba(255, 255, 255, 0.72)",
    },
  },
};

export const themeOptions = Object.values(themeDefinitions).map((theme) => ({
  value: theme.id,
  label: theme.label,
}));

export const themeBodyClasses = Object.values(themeDefinitions).map((theme) => theme.bodyClass);

export function getThemeDefinition(themeStyle: ThemeStyle): ThemeDefinition {
  return themeDefinitions[themeStyle];
}

export function normalizeThemeStyle(value: unknown): ThemeStyle {
  if (value === "liquidGlass" || value === "liquid-glass") {
    return "liquidGlass";
  }

  return defaultThemeStyle;
}
