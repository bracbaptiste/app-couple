# CLAUDE.md

Ce fichier guide Claude Code (claude.ai/code) lorsqu'il travaille sur ce dépôt.

@AGENTS.md

> ⚠️ **Next.js 16** (cf. AGENTS.md). Les API et conventions diffèrent des versions antérieures — lire le guide concerné dans `node_modules/next/dist/docs/01-app/` avant d'écrire du code framework. En particulier, le middleware est renommé **Proxy** (`src/proxy.ts`).

Le code et les commentaires sont en **français** — s'y conformer lors des modifications.

## Commandes

```bash
npm run dev          # serveur de dev (localhost:3000)
npm run build        # build de production
npm run lint         # eslint (flat config, next core-web-vitals + typescript)
npm run test         # vitest, une passe
npm run test:watch   # vitest, mode watch
```

Lancer un seul fichier de test ou filtrer par nom :

```bash
npx vitest run src/lib/utils/guess-category.test.ts
npx vitest run -t "priorise les mots-clés composés"
```

Les tests sont colocalisés (`*.test.ts` à côté du code). Il n'y a pas de fichier de config vitest dédié — les réglages par défaut s'appliquent.

### Migrations Supabase

Le CLI Supabase est lié au projet `app-couple`. Tout changement de schéma passe par un fichier de migration, jamais par du SQL ad-hoc contre la prod :

```bash
supabase migration new <nom>    # crée supabase/migrations/<ts>_<nom>.sql
supabase db push                # applique au remote lié
```

Les migrations peuvent aussi être appliquées via le MCP Supabase (`apply_migration`). Les fichiers sont nommés par version de fonctionnalité (`v1` → `v4_1`) ; lire les plus récents pour comprendre l'état actuel du schéma. `supabase/seed.sql` initialise les données par défaut (ex. les 12 catégories par défaut).

## Architecture

Une PWA pour couples : listes de courses, tâches, recettes et planning de repas partagés. **Next.js 16 App Router + Supabase (Auth/Postgres/RLS/Realtime) + IA Anthropic.**

### Multi-tenancy par couple (l'invariant central)

Chaque ligne métier appartient à un **couple**. Un utilisateur a un seul `profiles.couple_id` ; toutes les données (`lists`, `list_items`, `library_items`, `categories`, `tasks`, `recipes`, `meal_slots`, `brain_commands`) sont cadrées par `couple_id`. **La Row-Level Security est la vraie barrière de sécurité** — le code serveur ajoute des filtres `couple_id`/`id` par-dessus, pour la défense en profondeur et pour borner les ids venus du client, jamais en remplacement de la RLS.

**Garde-fou :** ne jamais écrire un `DELETE`/`UPDATE` clé uniquement sur un nom. Les tables sont multi-couples et certaines cascadent — toujours filtrer par `couple_id` (et/ou `id`). Le soft-delete est la norme : les lignes portent `deleted_at` et les lectures filtrent `.is("deleted_at", null)`.

### Auth & routing

- Groupes de routes : `src/app/(auth)/` (login/signup/reset), `src/app/(app)/` (l'app authentifiée), `src/app/onboarding/` (rejoindre/créer un couple).
- `src/proxy.ts` → `src/lib/supabase/middleware.ts` : s'exécute à chaque requête, rafraîchit la session Supabase et redirige (non connecté → `/login` ; connecté sur une page d'auth → `/lists` ou `/onboarding`). **Utiliser `getUser()`, pas `getSession()`**, et ne rien exécuter entre `createServerClient` et `getUser` (les commentaires du fichier expliquent pourquoi — sinon déconnexions aléatoires).
- Deux clients Supabase : `src/lib/supabase/server.ts` (Server Components / Actions, à base de cookies) et `src/lib/supabase/client.ts` (navigateur). Les règles de redirection vivent dans `src/lib/supabase/redirects.ts`.

### Pattern des Server Actions

Les mutations sont des actions `"use server"` colocalisées par route (ex. `src/app/(app)/lists/[listId]/actions.ts`). Elles suivent une forme constante :

1. `requireMembership()` → `{ supabase, userId, coupleId }` (redirige si non connecté / sans couple).
2. Vérifier que la ligne cible appartient au couple (ex. `assertCoursesListOwned`) avant d'écrire — les Actions sont POST-ables directement, donc ne jamais se fier à l'UI pour l'autorisation.
3. Renvoyer un `ActionResult = { ok: true } | { ok: false; error }` uniforme.

### Realtime = « écouter puis rafraîchir », pas de cache client

`src/lib/realtime.ts` s'abonne aux `postgres_changes` et déclenche un **`router.refresh()` débouncé** sur les events pertinents, qui re-exécute le Server Component avec la même lecture serveur (filtrée par RLS). Conséquences : aucune logique de fetch dupliquée côté client, aucune fusion d'events à la main, la RLS reste la frontière. `postgres_changes` respecte la RLS ; les filtres de canal `couple_id`/`list_id` ne font que réduire le trafic. Une table doit être ajoutée au Realtime Supabase (une migration) pour émettre des events — ça a été un angle mort par le passé.

### Fonctionnalités IA (clé serveur uniquement)

`ANTHROPIC_API_KEY` est lue **côté serveur uniquement**, jamais `NEXT_PUBLIC_`. L'IA vit derrière des route handlers dans `src/app/api/` (`runtime = "nodejs"` pour le SDK Anthropic) :

- `api/brain-command` — le routeur d'intentions vocal V4 : texte dicté → Claude Haiku → une **liste d'actions structurées** validée. La route ne fait que *structurer et valider* (résolution des ids sous RLS) ; rien n'est écrit ici. L'exécution vit dans `src/lib/brain/execute.ts` après confirmation graduée côté client.
- `api/parse-task`, `api/recipes/extract`, `api/recipes/generate`, `api/planning/propose-week` — les autres endpoints IA.
- Rate limiting : `src/lib/ai/rate-limit.ts` + table `ai_route_limits`.

Le contexte d'écran (listes, bibliothèque, recettes, date du jour) est **recalculé côté serveur sous RLS** ; le client ne transmet que les défauts d'ambiguïté (`contexte_ecran`), jamais de données pour contourner la RLS.

### Devinette de catégorie

Le rayon d'un produit se devine en cascade :

1. `src/lib/utils/guess-category.ts` (`guessCategory`) — dictionnaire mot-clé → catégorie, **sans IA**, instantané et gratuit ; couvre le gros des courses.
2. `src/lib/ai/categorize-item.ts` (`resolveCategoryName`) — enveloppe le dictionnaire et, **seulement si celui-ci renvoie « Autre »**, appelle Claude Haiku pour choisir parmi les rayons réels du couple. Repli silencieux sur « Autre » si clé absente / quota / erreur / timeout : **sans `ANTHROPIC_API_KEY`, comportement identique au dictionnaire seul** (d'où des tests d'intégration inchangés).

La **mémoire par produit est native** : `library_items.category_id` n'est écrit qu'à la **création** du produit (jamais réécrit ensuite) et le produit est réutilisé par `nom_normalise` à chaque ajout — la correction d'un rayon par le couple persiste donc toute seule, l'IA n'est appelée qu'une fois par nouveau produit inconnu.

Sites de création interactive branchés sur `resolveCategoryName` : `addItemToList` (lists), `addLibraryItem` (library), et le vocal (`brain/execute` : `trouverOuCreerArticle`, `addOrMergeListItem`). Les chemins **en lot** (recettes, planning) restent sur `guessCategory` seul pour éviter des rafales d'appels. Chaque site résout ensuite `name → id` via son `resolveCategoryId` local.

### Conventions

- Alias de chemin `@/*` → `./src/*`.
- UI : Tailwind CSS v4, Base UI (`@base-ui/react`), un petit set de composants maison (`riso-*` dans `src/components/ui/`), icônes lucide. Server Components par défaut ; `"use client"` seulement au besoin.
- La logique métier est extraite dans des modules purs et testés sous `src/lib/` (`tasks/`, `recipes/`, `planning/`, `brain/`, `utils/`) — préférer y ajouter la logique plutôt que dans les composants.
- Les specs produit vivent dans `docs/Doc V1…V4.1/` (PRD). Consulter la dernière version quand l'intention d'une fonctionnalité est floue.
