import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: './', 
  plugins: [
    tsconfigPaths(),
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  css: {
    devSourcemap: false 
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    modulePreload: {
      polyfill: false
    }
  },
  server: {
    host: true,
    port: 3000
  }
});