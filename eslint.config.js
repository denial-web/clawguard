import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "bench-results/**", "docs-site/**", "hf-space/**", "web/**"]
  },
  {
    ...js.configs.recommended,
    files: [
      "src/**/*.js",
      "bench/agent-policy/**/*.js",
      "scripts/**/*.{js,mjs}",
      "test/agent-gate-bypass.test.js",
      "test/agent-policy-enforcement.test.js",
      "test/agent-protected-assets.test.js"
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
    }
  }
];
