import { create } from "zustand";
import { envManagerApi } from "../api/envManagerApi";
import type { AvailableVersion, VersionCatalogQuery } from "@shared/types";

interface CatalogState {
  versionsByKey: Record<string, AvailableVersion[]>;
  loadingByKey: Record<string, boolean>;
  errorByKey: Record<string, string | undefined>;
  loadVersions: (query: VersionCatalogQuery) => Promise<AvailableVersion[]>;
}

function getCatalogKey(query: VersionCatalogQuery): string {
  return `${query.environment}:${query.vendor}`;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  versionsByKey: {},
  loadingByKey: {},
  errorByKey: {},
  loadVersions: async (query) => {
    const key = getCatalogKey(query);
    const cached = get().versionsByKey[key];

    if (cached) {
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
      set((state) => ({
        loadingByKey: {
          ...state.loadingByKey,
          [key]: false,
        },
        errorByKey: {
          ...state.errorByKey,
          [key]: (error as Error).message,
        },
      }));
      throw error;
    }
  },
}));
