/**
 * Types de la base de données Supabase.
 *
 * ⚠️ Placeholder pour la V1 — étape Setup.
 * À remplacer par les types générés automatiquement depuis le schéma Supabase
 * (cf. docs/ARCHITECTURE.md §7.4) une fois les migrations créées :
 *
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 *
 * En attendant, ce squelette satisfait la contrainte générique de `@supabase/ssr`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
