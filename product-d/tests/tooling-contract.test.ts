import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface ProductPackage {
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface V8CoverageConfig {
  provider: "v8";
  include?: string[];
  exclude?: string[];
  thresholds?: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
  };
}

function isV8CoverageConfig(value: unknown): value is V8CoverageConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    "provider" in value &&
    value.provider === "v8"
  );
}

async function readPackage(): Promise<ProductPackage> {
  const contents = await readFile(resolve(productRoot, "package.json"), "utf8");

  return JSON.parse(contents) as ProductPackage;
}

async function readVitestConfig() {
  const configModule = await import("../vitest.config");

  return configModule.default;
}

describe("Product D toolchain contract", () => {
  it("provides the documented npm commands and Node 22 runtime", async () => {
    const packageJson = await readPackage();

    expect(packageJson.scripts).toEqual({
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint .",
      format: "prettier --write .",
      "format:check": "prettier --check .",
      typecheck: "next typegen && tsc --noEmit",
      test: "vitest run --coverage",
      "test:watch": "vitest",
    });
    expect(packageJson.engines?.node).toBe("22.x");
  });

  it("keeps the V8 coverage plugin compatible with Vitest", async () => {
    const packageJson = await readPackage();
    const vitestVersion = packageJson.devDependencies?.vitest;
    const coverageVersion =
      packageJson.devDependencies?.["@vitest/coverage-v8"];

    expect(vitestVersion).toBeDefined();
    expect(coverageVersion).toBeDefined();
    expect(
      coverageVersion,
      "@vitest/coverage-v8 must use the same version range as vitest",
    ).toBe(vitestVersion);
  });

  it("collects V8 coverage from Product D source with the agreed exclusions", async () => {
    const config = await readVitestConfig();
    const coverage = config.test?.coverage;

    expect(coverage?.provider).toBe("v8");
    if (!isV8CoverageConfig(coverage)) return;

    expect(coverage?.include).toEqual([
      "app/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ]);
    expect(coverage?.exclude).toEqual([
      "app/layout.tsx",
      "**/*.d.ts",
      "**/*.config.*",
      "**/*.fixture.ts",
      ".next/**",
      "coverage/**",
    ]);
  });

  it("enforces the initial 80 percent coverage floor for every metric", async () => {
    const config = await readVitestConfig();
    const coverage = config.test?.coverage;

    expect(coverage?.provider).toBe("v8");
    if (!isV8CoverageConfig(coverage)) return;

    expect(coverage.thresholds).toEqual({
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    });
  });
});
