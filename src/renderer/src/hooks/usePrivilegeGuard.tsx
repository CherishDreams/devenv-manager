import type { PrivilegeCheckInput, PrivilegeRequirement } from "@shared/types";
import { LinkOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Space, Typography } from "antd";
import { useCallback } from "react";
import { envManagerApi } from "../api/envManagerApi";
import { useConfigStore } from "../stores/configStore";

type PrivilegeChoice = "authorize" | "symlink" | "cancel";
type RuntimeApi = typeof envManagerApi;

async function checkPrivilegeRequirement(input: PrivilegeCheckInput): Promise<PrivilegeRequirement> {
  const permissions = (envManagerApi as Partial<RuntimeApi>).permissions;

  if (permissions?.check) {
    return permissions.check(input);
  }

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
  const canSwitchToSymlink =
    config.environmentManagement.mode === "direct" &&
    !needsServiceElevation &&
    (input.type === "set-active" || input.type === "install" || input.type === "retry");

  return {
    required: true,
    authorized: false,
    reason: needsServiceElevation ? "注册数据库 Windows 系统服务需要管理员权限。" : "当前操作需要更新系统环境变量。",
    canSwitchToSymlink,
    currentMode: config.environmentManagement.mode,
    authorizationMode: "restart-app",
  };
}

function getAuthorizationLabel(requirement: PrivilegeRequirement): string {
  return requirement.authorizationMode === "restart-app" ? "授权并重启" : "授权并继续";
}

export function usePrivilegeGuard(): {
  runWithPrivilege: <T>(
    input: PrivilegeCheckInput,
    action: (authorized: boolean) => Promise<T>,
  ) => Promise<T | undefined>;
} {
  const { message, modal } = AntdApp.useApp();
  const updateConfig = useConfigStore((state) => state.update);

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
                {requirement.authorizationMode === "restart-app"
                  ? "授权后应用会以管理员身份重启，并自动继续创建任务。"
                  : "授权后会启动或复用管理员辅助进程，当前应用窗口不会重启，本次应用会话内后续同类操作不再重复授权。"}
              </Typography.Text>
              {requirement.canSwitchToSymlink ? (
                <Button icon={<LinkOutlined />} onClick={() => finish("symlink")}>
                  切换为软件软链接
                </Button>
              ) : null}
            </Space>
          ),
          okText: getAuthorizationLabel(requirement),
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
      while (true) {
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

        if (choice === "symlink") {
          await updateConfig({
            environmentManagement: {
              mode: "symlink",
            },
          });
          message.success("已切换为软件软链接模式，正在重新检查权限");
          continue;
        }

        return action(true);
      }
    },
    [message, promptForPrivilege, updateConfig],
  );

  return { runWithPrivilege };
}
