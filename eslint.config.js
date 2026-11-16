import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "legacy/", "node_modules/", "tests/e2e/out/", ".claude/", "coverage/"] },
  js.configs.recommended,
  { rules: { "no-empty": ["error", { allowEmptyCatch: true }] } },
  { files: ["src/**/*.js"], languageOptions: { globals: globals.browser } },
  { files: ["tests/**/*.js", "*.config.js"], languageOptions: { globals: globals.node } },
  { files: ["tests/e2e/injected.js"], languageOptions: { globals: globals.browser } },
];
