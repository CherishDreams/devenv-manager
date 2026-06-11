/** Extracts a human-readable message from an unknown error value. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** Parses a JSON string with basic object-type validation. */
export function parseJsonAs<T>(text: string, context: string): T {
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null) {
    throw new Error(`${context}: 数据格式异常`);
  }
  return data as T;
}

/** Parses a response JSON body with basic object-type validation. */
export async function parseResponseJsonAs<T>(response: { json: () => Promise<unknown> }, context: string): Promise<T> {
  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) {
    throw new Error(`${context}: 响应数据格式异常`);
  }
  return data as T;
}
