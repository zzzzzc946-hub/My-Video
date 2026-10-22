import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { runtimeConfigScript } from "./server/runtime.js";

export default defineConfig({
  root: "workbench/web",
  plugins: [
    react({}),
    {
      name: "videouse-workbench-runtime",
      transformIndexHtml() {
        const apiOrigin = process.env.WORKBENCH_API_ORIGIN;
        return apiOrigin
          ? [
              {
                tag: "script",
                children: runtimeConfigScript(apiOrigin),
                injectTo: "head-prepend" as const,
              },
            ]
          : [];
      },
    },
  ],
});
