import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildRef =
  process.env.COMMIT_REF ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  "local";
const shortRef = String(buildRef).slice(0, 7);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(`Beta build ${shortRef}`),
  },
  server: {
    port: 5173,
  },
});
