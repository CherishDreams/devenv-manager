import type { InstallRecord } from "@shared/types";
import { getErrorMessage } from "@shared/errorUtils";
import { App as AntdApp } from "antd";
import { useCallback } from "react";
import { useEnvironmentStore } from "../stores/environmentStore";
import { usePrivilegeGuard } from "./usePrivilegeGuard";

export function useEnvironmentActions(): {
  switchActive: (record: InstallRecord) => Promise<void>;
  uninstallRecord: (record: InstallRecord) => Promise<void>;
} {
  const { message } = AntdApp.useApp();
  const { runWithPrivilege } = usePrivilegeGuard();
  const setActive = useEnvironmentStore((state) => state.setActive);
  const uninstall = useEnvironmentStore((state) => state.uninstall);

  const switchActive = useCallback(
    async (record: InstallRecord) => {
      try {
        const completed = await runWithPrivilege(
          { type: "set-active", environment: record.environment, id: record.id },
          async (authorized) => {
            await setActive(record.environment, record.id, authorized);
            return true;
          },
        );

        if (completed) {
          message.success(`已切换到 ${record.name} ${record.version}`);
        }
      } catch (error) {
        message.error(getErrorMessage(error));
      }
    },
    [message, runWithPrivilege, setActive],
  );

  const uninstallRecord = useCallback(
    async (record: InstallRecord) => {
      try {
        const completed = await runWithPrivilege({ type: "uninstall", id: record.id }, async (authorized) => {
          await uninstall(record.id, authorized);
          return true;
        });

        if (completed) {
          message.success(
            record.uninstallPolicy === "delete-directory"
              ? `已卸载 ${record.name} ${record.version}`
              : `已移除 ${record.name} ${record.version} 的接管记录`,
          );
        }
      } catch (error) {
        message.error(getErrorMessage(error));
      }
    },
    [message, runWithPrivilege, uninstall],
  );

  return { switchActive, uninstallRecord };
}
