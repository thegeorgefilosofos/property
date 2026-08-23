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
    // Ο πάγκος των δοκιμών χρημάτων: παραγόμενο πακέτο, όχι πηγή. Ο κανόνας
    // των hooks δεν έχει νόημα πάνω σε μεταγλωττισμένο κώδικα, και το ταβάνι
    // του lint δεν επιτρέπεται να μετράει γραμμές που δεν γράφτηκαν με το χέρι.
    ".e2e-money/**",
    ".perf-bench/**",
  ]),
]);

export default eslintConfig;
