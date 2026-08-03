import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(cwd(), "src/cvf-genomic-search.css"), "utf8");

describe("component CSS boundary", () => {
  it("uses only project-owned selector roots", () => {
    expect(styles.length).toBeGreaterThan(0);
    expect(styles).not.toMatch(/\.Mui/);

    const uncommentedStyles = styles.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectorBlocks = uncommentedStyles.matchAll(/(?:^|})\s*([^@{}]+)\{/g);
    for (const [, selectorBlock] of selectorBlocks) {
      for (const selector of selectorBlock.split(",")) {
        expect(selector.trim()).toMatch(/^\.cvf-/);
      }
    }
  });
});
