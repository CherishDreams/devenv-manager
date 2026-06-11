import {
  createOfficialMirrorSettings,
  getConfiguredMirrorEntries,
  getMirrorDisplayName,
  getMirrorPresets,
  getMirrorSelection,
  getMirrorSourceName,
  getMirrorVersionNote,
  isOfficialMirrorValue,
  normalizeMirrorValue,
  officialMirrorValue,
} from "./mirrorPresets";

describe("normalizeMirrorValue", () => {
  it("returns officialMirrorValue for undefined", () => {
    expect(normalizeMirrorValue(undefined)).toBe(officialMirrorValue);
  });

  it("returns officialMirrorValue for empty/whitespace strings", () => {
    expect(normalizeMirrorValue("")).toBe(officialMirrorValue);
    expect(normalizeMirrorValue("   ")).toBe(officialMirrorValue);
  });

  it("trims and returns non-empty values", () => {
    expect(normalizeMirrorValue("  https://example.com  ")).toBe("https://example.com");
  });
});

describe("isOfficialMirrorValue", () => {
  it("returns true for undefined", () => {
    expect(isOfficialMirrorValue(undefined)).toBe(true);
  });

  it("returns true for the official value", () => {
    expect(isOfficialMirrorValue(officialMirrorValue)).toBe(true);
  });

  it("returns false for custom URLs", () => {
    expect(isOfficialMirrorValue("https://mirrors.example.com")).toBe(false);
  });
});

describe("getMirrorPresets", () => {
  it("always includes official and custom presets", () => {
    const presets = getMirrorPresets("java");
    expect(presets[0].id).toBe(officialMirrorValue);
    expect(presets[presets.length - 1].id).toBe("custom");
  });

  it("includes environment-specific presets for python", () => {
    const presets = getMirrorPresets("python");
    expect(presets.length).toBe(3); // official + huaweicloud + custom
    expect(presets[1].id).toBe("huaweicloud");
  });

  it("returns only official and custom for environments without presets", () => {
    const presets = getMirrorPresets("java");
    expect(presets.length).toBe(2);
  });
});

describe("getMirrorSelection", () => {
  it("returns disabled selection for official value", () => {
    const selection = getMirrorSelection("python", officialMirrorValue);
    expect(selection.enabled).toBe(false);
    expect(selection.presetId).toBe(officialMirrorValue);
    expect(selection.customValue).toBe("");
  });

  it("returns enabled selection with matched preset id", () => {
    const selection = getMirrorSelection("python", "https://mirrors.huaweicloud.com/python");
    expect(selection.enabled).toBe(true);
    expect(selection.presetId).toBe("huaweicloud");
    expect(selection.customValue).toBe("");
  });

  it("returns enabled selection with custom preset for unknown URLs", () => {
    const selection = getMirrorSelection("python", "https://unknown.mirror.com");
    expect(selection.enabled).toBe(true);
    expect(selection.presetId).toBe("custom");
    expect(selection.customValue).toBe("https://unknown.mirror.com");
  });
});

describe("getMirrorDisplayName", () => {
  it("returns preset name for known values", () => {
    expect(getMirrorDisplayName("python", "https://mirrors.huaweicloud.com/python")).toBe("华为云 Python");
  });

  it("returns official preset name for official value", () => {
    expect(getMirrorDisplayName("python", officialMirrorValue)).toBe("官方源");
  });

  it("returns '自定义 URL' for unknown values", () => {
    expect(getMirrorDisplayName("python", "https://unknown.mirror.com")).toBe("自定义 URL");
  });
});

describe("getMirrorSourceName", () => {
  it("returns official source name for official mirror", () => {
    expect(getMirrorSourceName("python", officialMirrorValue, "python.org")).toBe("python.org");
  });

  it("returns mirror display name for custom mirror", () => {
    expect(getMirrorSourceName("python", "https://mirrors.huaweicloud.com/python", "python.org")).toBe("华为云 Python");
  });
});

describe("getMirrorVersionNote", () => {
  it("returns official note for official mirror", () => {
    expect(getMirrorVersionNote("python", officialMirrorValue, "from python.org")).toBe("from python.org");
  });

  it("returns mirror note for custom mirror", () => {
    const note = getMirrorVersionNote("python", "https://mirrors.huaweicloud.com/python", "from python.org");
    expect(note).toBe("来自 华为云 Python");
  });
});

describe("createOfficialMirrorSettings", () => {
  it("returns a copy with all official values", () => {
    const settings = createOfficialMirrorSettings();
    for (const value of Object.values(settings)) {
      expect(value).toBe(officialMirrorValue);
    }
  });

  it("returns a new object (not the same reference)", () => {
    const settings = createOfficialMirrorSettings();
    expect(settings).not.toBe(officialMirrorValue);
  });
});

describe("getConfiguredMirrorEntries", () => {
  it("returns empty array when all mirrors are official", () => {
    const settings = createOfficialMirrorSettings();
    expect(getConfiguredMirrorEntries(settings)).toEqual([]);
  });

  it("returns entries for non-official mirrors", () => {
    const settings = createOfficialMirrorSettings();
    settings.python = "https://mirrors.huaweicloud.com/python";
    const entries = getConfiguredMirrorEntries(settings);
    expect(entries.length).toBe(1);
    expect(entries[0].environment).toBe("python");
    expect(entries[0].displayName).toBe("华为云 Python");
  });
});
