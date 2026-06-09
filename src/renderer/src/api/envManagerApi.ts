import { createMissingPreloadApi } from "./missingPreloadApi";
import { createMockApi } from "./mockEnvManagerApi";

const runningInElectron = navigator.userAgent.includes("Electron");

export const envManagerApi = window.envManager ?? (runningInElectron ? createMissingPreloadApi() : createMockApi());
