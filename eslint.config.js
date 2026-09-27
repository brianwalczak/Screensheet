const js = require("@eslint/js");
const globals = require("globals");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_$",
        "varsIgnorePattern": "^_$",
        "caughtErrorsIgnorePattern": "^_$"
      }]
    },
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["public/index.js", "public/libs/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        io: "readonly", // loaded by the socket.io script tag
      },
    },
  },
]);