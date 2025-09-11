import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages が "https://<user>.github.io/<repo>/" の場合、base を "/<repo>/" に。
// ユーザーページなら "/" のままでOK。
export default defineConfig({
  plugins: [react()],
  base: "/tsumu/",    // ← リポジトリ名に置換（例: "/tsumu/"）
});
