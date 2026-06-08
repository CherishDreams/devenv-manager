import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function getFirstJsonObject(raw: string): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (!started) {
      if (/\s/.test(char)) {
        continue;
      }

      if (char !== "{") {
        return undefined;
      }

      started = true;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return raw.slice(0, index + 1);
      }
    }
  }

  return undefined;
}

export class JsonFileStore<TData extends object> {
  private writeQueue = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaults: TData,
  ) {}

  async read(): Promise<TData> {
    await this.writeQueue;

    try {
      const raw = await readFile(this.filePath, "utf8");
      return this.parse(raw);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.write(this.defaults);
        return this.defaults;
      }

      if (error instanceof SyntaxError) {
        const raw = await readFile(this.filePath, "utf8");
        const recovered = getFirstJsonObject(raw);
        const backupPath = `${this.filePath}.corrupt-${Date.now()}.bak`;
        await writeFile(backupPath, raw, "utf8");

        if (recovered) {
          const data = this.parse(recovered);
          await this.write(data);
          return data;
        }

        await this.write(this.defaults);
        return this.defaults;
      }

      throw error;
    }
  }

  async write(data: TData): Promise<TData> {
    const writeOperation = this.writeQueue.then(() => this.writeNow(data), () => this.writeNow(data));
    this.writeQueue = writeOperation.then(
      () => undefined,
      () => undefined,
    );
    return writeOperation;
  }

  async update(updater: (current: TData) => TData): Promise<TData> {
    const current = await this.read();
    const next = updater(current);
    return this.write(next);
  }

  private parse(raw: string): TData {
    const parsed = JSON.parse(raw) as Partial<TData>;
    return {
      ...this.defaults,
      ...parsed,
    };
  }

  private async writeNow(data: TData): Promise<TData> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      await writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }

    return data;
  }
}
