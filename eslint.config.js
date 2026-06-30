import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "bench-results/**", "docs-site/**", "hf-space/**"]
  },
  {
    ...js.configs.recommended,
    files: [
      "src/**/*.js",
      "bench/agent-policy/**/*.js",
      "scripts/**/*.{js,mjs}",
      "test/**/*.js",
      "web/**/*.js"
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
