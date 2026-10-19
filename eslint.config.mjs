// Lints the desk's own code. vendor/ is picnic-web's code, copied as is by
// scripts/vendor.mjs, and picnic_desk/dist is built output, so neither is linted.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["vendor/", "picnic_desk/dist/", "node_modules/", "src/server/routes.generated.ts", "test-results/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // A leading underscore marks a value left out on purpose, e.g. the
      // password token taken off a response with { partialToken: _held, ...rest }.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}", "tests/browser/**/*.mjs"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // The two classic hook rules. The plugin's newer rules (set-state-in-effect,
    // purity, refs, ...) are written for the React Compiler, which the desk
    // does not use; they flag ordinary effects that work as intended.
    files: ["src/ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // Tests read whatever JSON a response holds, and the demo shop reads
    // request bodies as loosely as a server does; typing those buys nothing.
    files: ["tests/**", "src/server/demo/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
