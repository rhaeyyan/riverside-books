import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const productRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(productRoot, "..");

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

async function readPackage(): Promise<ProductPackage> {
  const contents = await readFile(resolve(productRoot, "package.json"), "utf8");

  return JSON.parse(contents) as ProductPackage;
}

function yamlJob(workflow: string, jobName: string): string {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${jobName}:`);
  if (start === -1) return "";

  const nextJob = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:$/.test(line),
  );

  return lines.slice(start, nextJob === -1 ? undefined : nextJob).join("\n");
}

function yamlStepForCommand(job: string, command: string): string {
  return (
    job
      .split(/(?=^      - )/m)
      .find((step) => step.includes(`run: ${command}`)) ?? ""
  );
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

  it("uses the canonical Product D test and script policy", async () => {
    const packageJson = await readPackage();
    const vitestConfig = await readVitestConfig();

    expect(packageJson.scripts).toEqual({
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint .",
      typecheck: "next typegen && tsc --noEmit",
      test: "vitest run",
      "test:watch": "vitest",
    });
    expect(packageJson.engines?.node).toBe("22.x");
    expect(packageJson.devDependencies).not.toHaveProperty(
      "@vitest/coverage-v8",
    );
    expect(packageJson.devDependencies).not.toHaveProperty("prettier");
    expect(vitestConfig.test).not.toHaveProperty("coverage");
  });

  it("wires Product D CI and main-only deployment", async () => {
    const workflow = await readFile(
      resolve(repositoryRoot, ".github/workflows/ci.yml"),
      "utf8",
    );
    const productDJob = yamlJob(workflow, "ci-product-d");

    expect(productDJob).not.toBe("");
    expect(productDJob).toContain("runs-on: ubuntu-latest");
    expect(productDJob).toContain("node-version: 22");
    expect(productDJob).toContain("cache: npm");
    expect(productDJob).toContain(
      "cache-dependency-path: product-d/package-lock.json",
    );

    for (const command of [
      "npm ci",
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "npm run build",
    ]) {
      const step = yamlStepForCommand(productDJob, command);

      expect(step, `Product D CI must run ${command}`).not.toBe("");
      expect(step).toContain("working-directory: product-d");
    }

    const mainOnlyGuard =
      "github.event_name == 'push' && github.ref == 'refs/heads/main'";
    const deploymentCommands = [
      "npm install --global vercel@latest",
      "vercel pull --yes --environment=production --token=${{ secrets.VERCEL_PRODUCT_D_TOKEN }}",
      "vercel build --prod --token=${{ secrets.VERCEL_PRODUCT_D_TOKEN }}",
      "vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_PRODUCT_D_TOKEN }}",
    ];

    for (const command of deploymentCommands) {
      const step = yamlStepForCommand(productDJob, command);

      expect(step, `Product D deployment must run ${command}`).not.toBe("");
      expect(step.match(/^        if: (.+)$/m)?.[1]).toBe(mainOnlyGuard);

      if (!command.startsWith("npm install")) {
        expect(step).toContain("working-directory: product-d");
        expect(step).toContain("VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}");
        expect(step).toContain(
          "VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PRODUCT_D_PROJECT_ID }}",
        );
      }
    }
  });
});
