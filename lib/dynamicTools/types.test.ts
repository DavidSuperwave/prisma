import { describe, expect, it } from "vitest";

import { DYNAMIC_TOOL_PREFIX, dynamicToolNameFromSpec, isDynamicToolName } from "./types";

describe("dynamic tool naming", () => {
  it("adds prefix when missing", () => {
    expect(dynamicToolNameFromSpec("auto.check")).toBe("dyn.auto.check");
  });

  it("leaves already-prefixed names", () => {
    expect(dynamicToolNameFromSpec("dyn.x")).toBe("dyn.x");
  });

  it("rejects empty", () => {
    expect(dynamicToolNameFromSpec("")).toBe("");
  });

  it("isDynamicToolName detects prefix", () => {
    expect(isDynamicToolName("dyn.a")).toBe(true);
    expect(isDynamicToolName("crm.x")).toBe(false);
  });

  it("DYNAMIC_TOOL_PREFIX is dyn.", () => {
    expect(DYNAMIC_TOOL_PREFIX).toBe("dyn.");
  });
});
