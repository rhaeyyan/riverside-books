import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";
import tsdoc from "eslint-plugin-tsdoc";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { jsdoc, tsdoc },
    rules: {
      // Required on the public surface, and only there.
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
      // A doc block that exists must be valid and must match the signature.
      "tsdoc/syntax": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-param-description": "error",
      "jsdoc/require-returns-description": "error",
      // Types live in TypeScript, not in the comment — don't duplicate them.
      "jsdoc/no-types": "error",

      // SOLID proxies. Warnings on purpose: they don't measure SOLID, they
      // just make the god-function visible. Not worth failing a build over.
      "max-lines-per-function": [
        "warn",
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["warn", { max: 12 }],
      "max-depth": ["warn", 4],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
