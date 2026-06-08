import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Config Vitest minimale pour les tests métier (fonctions pures + actions
 * serveur avec Supabase mocké). Environnement `node` : aucun DOM requis en V1.
 * L'alias `@/` reflète celui de tsconfig.json.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
