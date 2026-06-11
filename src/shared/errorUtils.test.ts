import { getErrorMessage, parseJsonAs } from "./errorUtils";

describe("getErrorMessage", () => {
  it("returns the message from an Error instance", () => {
    const error = new Error("something went wrong");
    expect(getErrorMessage(error)).toBe("something went wrong");
  });

  it("returns the string representation of a non-Error value", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});

describe("parseJsonAs", () => {
  it("parses valid JSON objects", () => {
    const result = parseJsonAs<{ name: string }>('{"name": "test"}', "test context");
    expect(result).toEqual({ name: "test" });
  });

  it("throws when JSON is not an object", () => {
    expect(() => parseJsonAs('"just a string"', "test context")).toThrow("test context: 数据格式异常");
    expect(() => parseJsonAs("42", "test context")).toThrow("test context: 数据格式异常");
    expect(() => parseJsonAs("null", "test context")).toThrow("test context: 数据格式异常");
  });

  it("throws on invalid JSON syntax", () => {
    expect(() => parseJsonAs("{invalid}", "test context")).toThrow();
  });
});
