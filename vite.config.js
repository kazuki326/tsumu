// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/tsumu/",            // ← リポジトリ名
  plugins: [react()],
  server: { port: 5173, open: true },
  preview: { port: 5173 }
});
