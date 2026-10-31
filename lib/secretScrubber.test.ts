import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/store", () => ({
  createIntegration: vi.fn(),
}));

import { createIntegration } from "@/lib/integrations/store";
import { detectSecrets, scrubAndStoreSecrets } from "./secretScrubber";

const mockedCreateIntegration = vi.mocked(createIntegration);

describe("secretScrubber", () => {
  beforeEach(() => {
    mockedCreateIntegration.mockReset();
  });

  it("detects Close and Bearer-shaped secrets", () => {
    expect(
      detectSecrets(
        "Close key api_1234567890abcdef1234567890 and Bearer token Bearer abcdefghijklmnopqrstuvwxyz123456",
      ).map((entry) => entry.provider),
    ).toEqual(["close", "generic_http"]);
  });

  it("scrubs detected secrets and creates encrypted integrations", async () => {
    mockedCreateIntegration.mockImplementation(async (input) => {
      const provider = (input as { provider: string }).provider;
      if (provider === "close") {
        return {
          id: "int-close",
          slug: "close-auto",
          provider: "close",
          label: "Close (auto-detected)",
        } as never;
      }
      return {
        id: "int-bearer",
        slug: "bearer-auto",
        provider: "generic_http",
        label: "Bearer token (auto-detected)",
      } as never;
    });

    const result = await scrubAndStoreSecrets(
      "Use Close api_1234567890abcdef1234567890 and Bearer abcdefghijklmnopqrstuvwxyz123456 right away.",
      { workspaceId: "ws-1", createdBy: "user-1" },
    );

    expect(result.detected).toBe(true);
    expect(result.scrubbedContent).toContain("<redacted:close:close-auto>");
    expect(result.scrubbedContent).toContain("<redacted:generic_http:bearer-auto>");
    expect(result.systemNotes).toEqual([
      'User pasted a generic_http secret. Saved as integration slug="bearer-auto". Use integrations.call with that slug; do not ask the user to paste the secret again.',
      'User pasted a close secret. Saved as integration slug="close-auto". Use integrations.call with that slug; do not ask the user to paste the secret again.',
    ]);
    expect(mockedCreateIntegration).toHaveBeenCalledTimes(2);
  });

  it("still redacts the token when persistence fails", async () => {
    mockedCreateIntegration.mockRejectedValueOnce(new Error("vault unavailable"));

    const result = await scrubAndStoreSecrets(
      "Bearer abcdefghijklmnopqrstuvwxyz123456",
      { workspaceId: "ws-1" },
    );

    expect(result.scrubbedContent).toContain("<redacted:generic_http:store-failed>");
    expect(result.systemNotes[0]).toContain("vault unavailable");
  });
});

