import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next already registers the jsx-a11y plugin itself, so pull
  // in only jsx-a11y's recommended rules here rather than its full flat
  // config — spreading the whole thing redefines the plugin and ESLint
  // errors out ("Cannot redefine plugin \"jsx-a11y\"").
  {
    languageOptions: jsxA11y.flatConfigs.recommended.languageOptions,
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
