import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ root: "workbench/web", plugins: [react({})] });
