import type { AvailableVersion, EnvironmentKind, VersionCatalogQuery } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { getStaticVersions } from "@shared/versionCatalog";
import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";

interface CatalogState {
  versionsByKey: Record<string, AvailableVersion[]>;
  loadingByKey: Record<string, boolean>;
  errorByKey: Record<string, string | undefined>;
  loadVersions: (query: VersionCatalogQuery, options?: { force?: boolean }) => Promise<AvailableVersion[]>;
  clearVersions: (environment?: EnvironmentKind) => void;
}

function getCatalogKey(query: VersionCatalogQuery): string {
  return `${query.environment}:${query.vendor}`;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  versionsByKey: {},
  loadingByKey: {},
  errorByKey: {},
  loadVersions: async (query, options) => {
    const key = getCatalogKey(query);
    const cached = get().versionsByKey[key];

    if (cached && !options?.force) {
      return cached;
    }

    set((state) => ({
      loadingByKey: {
        ...state.loadingByKey,
        [key]: true,
      },
      errorByKey: {
        ...state.errorByKey,
        [key]: undefined,
      },
    }));

    try {
      const versions = await envManagerApi.catalog.listVersions(query);
      set((state) => ({
        versionsByKey: {
          ...state.versionsByKey,
          [key]: versions,
        },
        loadingByKey: {
          ...state.loadingByKey,
          [key]: false,
        },
      }));
      return versions;
    } catch (error) {
      const fallback = getStaticVersions(query);
      if (fallback.length > 0) {
        const fallbackVersions = fallback.map((v) => ({
          ...v,
          notes: `在线获取失败，已使用内置目录：${getErrorMessage(error)}`,
        }));
        set((state) => ({
          versionsByKey: { ...state.versionsByKey, [key]: fallbackVersions },
          loadingByKey: { ...state.loadingByKey, [key]: false },
        }));
        return fallbackVersions;
      }

      console.error("[catalogStore] Failed to load versions:", error);
      set((state) => ({
        loadingByKey: {
          ...state.loadingByKey,
          [key]: false,
        },
        errorByKey: {
          ...state.errorByKey,
          [key]: `获取版本列表失败: ${getErrorMessage(error)}`,
        },
      }));
      throw error;
    }
  },
  clearVersions: (environment) => {
    if (!environment) {
      set({
        versionsByKey: {},
        loadingByKey: {},
        errorByKey: {},
      });
      return;
    }

    const prefix = `${environment}:`;
    const removeEnvironmentKeys = <T>(records: Record<string, T>): Record<string, T> =>
      Object.fromEntries(Object.entries(records).filter(([key]) => !key.startsWith(prefix)));

    set((state) => ({
      versionsByKey: removeEnvironmentKeys(state.versionsByKey),
      loadingByKey: removeEnvironmentKeys(state.loadingByKey),
      errorByKey: removeEnvironmentKeys(state.errorByKey),
    }));
  },
}));
