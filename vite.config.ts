import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const env = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};
const commit =
  env.VITE_VERCEL_GIT_COMMIT_SHA ?? env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? "local";

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(commit.slice(0, 7)) },
});
