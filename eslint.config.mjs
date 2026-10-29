import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // O estado da agenda é um JSON livre lido do banco: tipar cada campo não traz segurança real aqui.
    // O vinext não tem a pré-busca do next/link, então <a> comum é o certo para as páginas.
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-html-link-for-pages": "off",
      // Recomendações de desempenho do React Compiler (o projeto não usa o compilador): ficam como aviso.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  globalIgnores([
    "dist/**",
    ".vinext/**",
    ".wrangler/**",
    ".sites-runtime/**",
    "outputs/**",
    "work/**",
    "agente-remarcacao/**",
  ]),
]);

export default eslintConfig;
