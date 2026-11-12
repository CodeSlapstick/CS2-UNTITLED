
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const API = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    assetsDir: "_app",
    // Preserve the browser range previously targeted by Vite 5.
    target: ["es2020", "chrome87", "edge88", "firefox78", "safari14"],
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": API,
      "/auth": API,
      "/assets": API,
    },
  },
});
