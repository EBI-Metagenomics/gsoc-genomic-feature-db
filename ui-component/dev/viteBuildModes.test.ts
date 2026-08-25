// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";

import config from "../vite.config";

function resolveConfig(mode: string): UserConfig {
  if (typeof config !== "function") throw new Error("Expected a mode-aware Vite config");
  return config({
    command: "build",
    mode,
    isSsrBuild: false,
    isPreview: false,
  } satisfies ConfigEnv) as UserConfig;
}

describe("Vite data bundling modes", () => {
  it("keeps the local fixture out of a normal production build", () => {
    const production = resolveConfig("production");

    expect(production.publicDir).toBe(false);
    expect(production.build?.copyPublicDir).toBe(false);
  });

  it("includes the local fixture only in an explicit demo build", () => {
    const demo = resolveConfig("demo");

    expect(demo.publicDir).toBe("../sample_data");
    expect(demo.build?.copyPublicDir).toBe(true);
  });
});
