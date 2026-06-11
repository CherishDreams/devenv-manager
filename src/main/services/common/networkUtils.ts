import type { Dispatcher } from "undici";
import type { AppConfig } from "../../../shared/types";
import { ProxyAgent } from "undici";
import { getErrorMessage } from "../../../shared/errorUtils";

/** Extracts error cause chain into a readable string. */
export function describeFetchError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const details = [getErrorMessage(error), cause?.code, cause?.message].filter(Boolean);
  return details.join(" / ");
}

/** Resolves the appropriate proxy URL based on request protocol and config. */
export function getProxyUrl(url: string, config: AppConfig): string | undefined {
  if (!config.proxy.enabled) {
    return undefined;
  }

  const requestProtocol = new URL(url).protocol;
  const preferredProxy = requestProtocol === "http:" ? config.proxy.httpProxy : config.proxy.httpsProxy;
  const fallbackProxy = requestProtocol === "http:" ? config.proxy.httpsProxy : config.proxy.httpProxy;
  const proxyUrl = (preferredProxy || fallbackProxy).trim();
  return proxyUrl || undefined;
}

/** Creates a proxy dispatcher for the given URL, with error wrapping. */
export function createProxyDispatcher(url: string, config: AppConfig): Dispatcher | undefined {
  const proxyUrl = getProxyUrl(url, config);

  if (!proxyUrl) {
    return undefined;
  }

  try {
    return new ProxyAgent(proxyUrl);
  } catch (error) {
    throw new Error(`代理地址无效：${proxyUrl}\n${describeFetchError(error)}`);
  }
}

/** Closes a dispatcher, ignoring any errors. */
export async function closeDispatcher(dispatcher: Dispatcher | undefined): Promise<void> {
  await dispatcher?.close().catch(() => undefined);
}
