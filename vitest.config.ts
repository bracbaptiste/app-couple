import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { defineConfig } from "vitest/config"

const rootDir = dirname(fileURLToPath(import.meta.url))

/**
 * Config Vitest minimale pour les tests métier (fonctions pures + actions
 * serveur avec Supabase mocké). Environnement `node` : aucun DOM requis en V1.
 * L'alias `@/` reflète celui de tsconfig.json.
 */
export default defineConfig({
  root: rootDir,
  cacheDir: resolve(rootDir, "node_modules/.vitest"),
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
