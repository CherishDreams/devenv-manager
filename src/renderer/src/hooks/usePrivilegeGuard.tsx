import type { PrivilegeCheckInput, PrivilegeRequirement } from "@shared/types";
import { SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Space, Typography } from "antd";
import { useCallback } from "react";
import { envManagerApi } from "../api/envManagerApi";

type PrivilegeChoice = "authorize" | "cancel";
type RuntimeApi = typeof envManagerApi;

async function checkPrivilegeRequirement(input: PrivilegeCheckInput): Promise<PrivilegeRequirement> {
  const permissions = (envManagerApi as Partial<RuntimeApi>).permissions;

  if (permissions?.check) {
    return permissions.check(input);
  }

  // Fallback for mock/browser mode.
  // Environment variable writes go to HKCU by default (no admin needed).
  // Only database Windows service registration needs elevation.
  // When envScope is "system", env writes go to HKLM and need admin.
  const [status, config] = await Promise.all([envManagerApi.system.getStatus(), envManagerApi.config.get()]);

  if (status.isAdministrator) {
    return {
      required: false,
      authorized: false,
      reason: "",
      canSwitchToSymlink: false,
      currentMode: config.environmentManagement.mode,
      authorizationMode: "none",
    };
  }

  const installInput = input.type === "install" ? input.input : undefined;
  const needsServiceElevation = Boolean(
    installInput?.databaseConfig?.enabled && installInput.databaseConfig.installAsService,
  );
  const needsEnvElevation = config.environmentManagement.envScope === "system";
  const required = needsServiceElevation || needsEnvElevation;

  let reason = "";
  if (needsServiceElevation) {
    reason = "注册数据库 Windows 系统服务需要管理员权限。";
  } else if (needsEnvElevation) {
    reason = "环境变量写入系统级注册表 (HKLM) 需要管理员权限。";
  }

  return {
    required,
    authorized: false,
    reason,
    canSwitchToSymlink: false,
    currentMode: config.environmentManagement.mode,
    authorizationMode: required ? "restart-app" : "none",
  };
}

export function usePrivilegeGuard(): {
  runWithPrivilege: <T>(
    input: PrivilegeCheckInput,
    action: (authorized: boolean) => Promise<T>,
  ) => Promise<T | undefined>;
} {
  const { modal } = AntdApp.useApp();

  const promptForPrivilege = useCallback(
    (requirement: PrivilegeRequirement): Promise<PrivilegeChoice> =>
      new Promise((resolve) => {
        let settled = false;
        let instance: ReturnType<typeof modal.confirm> | undefined;
        const finish = (choice: PrivilegeChoice): void => {
          if (settled) {
            return;
          }

          settled = true;
          instance?.destroy();
          resolve(choice);
        };

        instance = modal.confirm({
          className: "privilege-modal",
          title: "需要管理员权限",
          icon: <WarningOutlined />,
          width: 520,
          content: (
            <Space direction="vertical" size={12} className="full-width">
              <Alert type="warning" showIcon message={requirement.reason} />
              <Typography.Text type="secondary">
                授权后应用会以管理员身份重启，并自动继续创建任务。
              </Typography.Text>
            </Space>
          ),
          okText: "授权并重启",
          okButtonProps: { icon: <SafetyCertificateOutlined /> },
          cancelText: "取消",
          onOk: () => finish("authorize"),
          onCancel: () => finish("cancel"),
        });
      }),
    [modal],
  );

  const runWithPrivilege = useCallback(
    async <T,>(input: PrivilegeCheckInput, action: (authorized: boolean) => Promise<T>): Promise<T | undefined> => {
      const requirement = await checkPrivilegeRequirement(input);

      if (!requirement.required) {
        return action(false);
      }

      if (requirement.authorized) {
        return action(true);
      }

      const choice = await promptForPrivilege(requirement);

      if (choice === "cancel") {
        return undefined;
      }

      return action(true);
    },
    [promptForPrivilege],
  );

  return { runWithPrivilege };
}
