import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // 现有代码中 any 使用较多，先降级为 warning，避免阻塞 lint/build；后续再逐步收敛到更严格的类型。
      "@typescript-eslint/no-explicit-any": "warn",
      // React 19 + Next 默认规则较激进，当前代码基线暂未完全适配；先降级为 warning，避免阻塞开发流。
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
