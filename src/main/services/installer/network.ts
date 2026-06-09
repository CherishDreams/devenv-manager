import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { finished } from "node:stream/promises";
import { fetch, ProxyAgent, type Dispatcher } from "undici";
import type { AppConfig, TaskDownloadProgress } from "../../../shared/types";

function describeFetchError(error: unknown): string {
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const details = [error instanceof Error ? error.message : String(error), cause?.code, cause?.message].filter(Boolean);
  return details.join(" / ");
}

function getProxyUrl(url: string, config: AppConfig): string | undefined {
  if (!config.proxy.enabled) {
    return undefined;
  }

  const requestProtocol = new URL(url).protocol;
  const preferredProxy = requestProtocol === "http:" ? config.proxy.httpProxy : config.proxy.httpsProxy;
  const fallbackProxy = requestProtocol === "http:" ? config.proxy.httpsProxy : config.proxy.httpProxy;
  const proxyUrl = (preferredProxy || fallbackProxy).trim();
  return proxyUrl || undefined;
}

function createProxyDispatcher(url: string, config: AppConfig): Dispatcher | undefined {
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

async function closeDispatcher(dispatcher: Dispatcher | undefined): Promise<void> {
  await dispatcher?.close().catch(() => undefined);
}

export async function fetchText(url: string, config: AppConfig, signal: AbortSignal): Promise<string> {
  const dispatcher = createProxyDispatcher(url, config);
  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(url, { dispatcher, signal });
  } catch (error) {
    await closeDispatcher(dispatcher);
    throw new Error(`请求失败：${url}\n${describeFetchError(error)}`);
  }

  try {
    if (!response.ok) {
      throw new Error(`请求失败 ${response.status}: ${url}`);
    }

    return await response.text();
  } finally {
    await closeDispatcher(dispatcher);
  }
}

export async function fetchJson<TData>(url: string, config: AppConfig, signal: AbortSignal): Promise<TData> {
  const dispatcher = createProxyDispatcher(url, config);
  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(url, { dispatcher, signal });
  } catch (error) {
    await closeDispatcher(dispatcher);
    throw new Error(`请求失败：${url}\n${describeFetchError(error)}`);
  }

  try {
    if (!response.ok) {
      throw new Error(`请求失败 ${response.status}: ${url}`);
    }

    return (await response.json()) as TData;
  } finally {
    await closeDispatcher(dispatcher);
  }
}

export async function fetchJsonFromSources<TData>(
  sources: Array<{ name: string; url: string; downloadBaseUrl: string }>,
  config: AppConfig,
  signal: AbortSignal,
): Promise<{ data: TData; source: { name: string; downloadBaseUrl: string } }> {
  const errors: string[] = [];

  for (const source of sources) {
    try {
      return {
        data: await fetchJson<TData>(source.url, config, signal),
        source,
      };
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      errors.push(`${source.name}: ${(error as Error).message}`);
    }
  }

  throw new Error(`所有下载源请求失败：\n${errors.join("\n")}`);
}

export async function downloadFile(
  url: string,
  targetFile: string,
  config: AppConfig,
  signal: AbortSignal,
  onProgress: (progress: TaskDownloadProgress) => void,
): Promise<void> {
  const dispatcher = createProxyDispatcher(url, config);
  let response: Awaited<ReturnType<typeof fetch>>;

  try {
    response = await fetch(url, {
      dispatcher,
      redirect: "follow",
      signal,
    });
  } catch (error) {
    await closeDispatcher(dispatcher);
    throw new Error(`下载失败：${url}\n${describeFetchError(error)}`);
  }

  if (!response.ok || !response.body) {
    await closeDispatcher(dispatcher);
    throw new Error(`下载失败 ${response.status}: ${url}`);
  }

  try {
    await mkdir(dirname(targetFile), { recursive: true });
    const total = Number(response.headers.get("content-length") ?? 0);
    const file = createWriteStream(targetFile);
    const reader = response.body.getReader();
    let received = 0;
    const startedAt = Date.now();
    let lastReportedAt = 0;
    let lastSpeedAt = startedAt;
    let lastSpeedBytes = 0;
    let bytesPerSecond = 0;

    const emitProgress = (completed: boolean): void => {
      const now = Date.now();
      const speedElapsedSeconds = Math.max((now - lastSpeedAt) / 1000, 0.001);

      if (completed || now - lastSpeedAt >= 500) {
        bytesPerSecond = Math.max(0, Math.round((received - lastSpeedBytes) / speedElapsedSeconds));
        lastSpeedAt = now;
        lastSpeedBytes = received;
      }

      onProgress({
        url,
        fileName: basename(targetFile),
        receivedBytes: received,
        totalBytes: total > 0 ? total : undefined,
        bytesPerSecond,
        percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : undefined,
        updatedAt: new Date(now).toISOString(),
        completed,
      });
      lastReportedAt = now;
    };

    const writeChunk = (chunk: Buffer): Promise<void> => {
      if (file.write(chunk)) {
        return Promise.resolve();
      }

      return new Promise((resolveWrite, rejectWrite) => {
        file.once("drain", resolveWrite);
        file.once("error", rejectWrite);
      });
    };

    try {
      emitProgress(false);

      while (true) {
        if (signal.aborted) {
          throw new Error("任务已取消。");
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        received += value.byteLength;
        await writeChunk(Buffer.from(value));

        if (Date.now() - lastReportedAt >= 500) {
          emitProgress(false);
        }
      }
    } finally {
      file.end();
    }

    await finished(file);
    emitProgress(true);
  } finally {
    await closeDispatcher(dispatcher);
  }
}
