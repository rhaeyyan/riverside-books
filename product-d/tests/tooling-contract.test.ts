import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface ProductPackage {
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface FlatConfig {
  files?: string[];
  plugins?: Record<string, unknown>;
  rules?: Record<string, unknown>;
}

interface DocumentedExport {
  name: string;
  declaration: string;
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

async function readEslintConfig(): Promise<FlatConfig[]> {
  const configUrl = pathToFileURL(
    resolve(productRoot, "eslint.config.mjs"),
  ).href;
  const configModule = await import(configUrl);

  return configModule.default as FlatConfig[];
}

async function expectDocumentedExports(
  relativePath: string,
  exportedSymbols: DocumentedExport[],
): Promise<void> {
  const source = await readFile(resolve(productRoot, relativePath), "utf8");

  for (const exportedSymbol of exportedSymbols) {
    expect(
      source,
      `${relativePath} must document exported ${exportedSymbol.name}`,
    ).toMatch(
      new RegExp(
        String.raw`\/\*\*[\s\S]*?\*\/\s*${exportedSymbol.declaration}`,
      ),
    );
  }
}

describe("Product D toolchain contract", () => {
  it("documents the Product D content-boundary public surface", async () => {
    await expectDocumentedExports("lib/content/contracts.ts", [
      { name: "RecordType", declaration: "export type RecordType\\b" },
      { name: "FactRecord", declaration: "export interface FactRecord\\b" },
      {
        name: "FactProtectionErrorCode",
        declaration: "export type FactProtectionErrorCode\\b",
      },
      {
        name: "FactProtectionError",
        declaration: "export class FactProtectionError\\b",
      },
      { name: "Channel", declaration: "export type Channel\\b" },
      {
        name: "GenerationRequest",
        declaration: "export interface GenerationRequest\\b",
      },
      {
        name: "GeneratedVariant",
        declaration: "export interface GeneratedVariant\\b",
      },
      {
        name: "ContentGenerator",
        declaration: "export interface ContentGenerator\\b",
      },
    ]);
    await expectDocumentedExports("lib/content/fact-protection.ts", [
      {
        name: "renderFactTemplate",
        declaration: "export function renderFactTemplate\\b",
      },
      {
        name: "findUnsupportedFacts",
        declaration: "export function findUnsupportedFacts\\b",
      },
    ]);
    await expectDocumentedExports("lib/content/fixture-generator.ts", [
      {
        name: "FixtureContentGenerator",
        declaration: "export class FixtureContentGenerator\\b",
      },
    ]);
    await expectDocumentedExports("lib/content/book.fixture.ts", [
      {
        name: "fixtureBook",
        declaration: "export const fixtureBook\\b",
      },
    ]);
  });

  it("documents the Product D UI public surface", async () => {
    await expectDocumentedExports("app/layout.tsx", [
      {
        name: "RootLayout",
        declaration: "export default function RootLayout\\b",
      },
    ]);
    await expectDocumentedExports("app/page.tsx", [
      {
        name: "HomePage",
        declaration: "export default function HomePage\\b",
      },
    ]);
    await expectDocumentedExports("app/generator-workspace.tsx", [
      {
        name: "GeneratorWorkspace",
        declaration: "export function GeneratorWorkspace\\b",
      },
    ]);
  });

  it("enforces the canonical Product D TSDoc and size rules", async () => {
    const packageJson = await readPackage();
    const eslintConfig = await readEslintConfig();
    const documentationRules = eslintConfig.find(
      (config) =>
        config.files?.length === 1 && config.files[0] === "**/*.{ts,tsx}",
    );

    expect(packageJson.devDependencies).toMatchObject({
      "eslint-plugin-jsdoc": "^64.2.1",
      "eslint-plugin-tsdoc": "^0.5.2",
    });
    expect(Object.keys(documentationRules?.plugins ?? {}).sort()).toEqual([
      "jsdoc",
      "tsdoc",
    ]);
    expect(documentationRules?.rules).toEqual({
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: ["TSInterfaceDeclaration", "TSTypeAliasDeclaration"],
        },
      ],
      "tsdoc/syntax": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",
      "jsdoc/no-types": "error",
      "max-lines-per-function": [
        "warn",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["warn", { max: 12 }],
      "max-depth": ["warn", 4],
    });
  });

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
