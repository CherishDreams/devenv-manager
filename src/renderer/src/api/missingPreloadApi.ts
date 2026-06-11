export function createMissingPreloadApi(): NonNullable<typeof window.envManager> {
  const message = "Electron preload 未加载，无法调用真实安装器。请重启应用或检查 preload 路径。";
  const reject = async (): Promise<never> => {
    throw new Error(message);
  };

  return {
    config: {
      get: reject,
      update: reject,
    },
    system: {
      getStatus: reject,
    },
    permissions: {
      check: reject,
    },
    environments: {
      getSummary: reject,
      discover: reject,
      adopt: reject,
      setActive: reject,
      uninstall: reject,
      onChanged: () => () => undefined,
    },
    tasks: {
      list: reject,
      createInstall: reject,
      cancel: reject,
      retry: reject,
      remove: reject,
      clearFinished: reject,
      onChanged: () => () => undefined,
    },
    catalog: {
      listVersions: reject,
    },
    dialog: {
      selectDirectory: reject,
    },
  };
}
