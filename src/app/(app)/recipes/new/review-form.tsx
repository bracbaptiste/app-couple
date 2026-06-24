"use client"

import Image from "next/image"
import { Plus, Trash2, Clock, Users, Sparkles } from "lucide-react"
import { useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoInput } from "@/components/ui/riso-input"
import { FormFeedback, Field } from "@/app/(auth)/form-ui"
import { cn } from "@/lib/utils"
import {
  TYPES_PLAT,
  TAGS,
  UNITES,
  type RecetteExtraite,
  type TypePlat,
  type Tag,
  type Unite,
} from "@/lib/recipes/extraction"
import { LABELS_TYPE_PLAT, LABELS_TAG, LABELS_UNITE } from "@/lib/recipes/labels"

import { createRecipe, type RecipeIngredientInput } from "../actions"

/**
 * Écran de relecture éditable (PRD_recettes §7.5) — ÉTAPE CENTRALE, non
 * optionnelle. L'IA n'est jamais parfaite sur de l'écriture manuscrite : ici
 * l'utilisateur corrige TOUT avant d'enregistrer (titre, durée, type, étiquettes,
 * personnes, ingrédients ajout/suppression, étapes, calories/macros).
 *
 * Le bouton « Enregistrer » appelle la Server Action {@link createRecipe}, qui
 * recalcule `nom_normalise` côté serveur (règle d'or §5).
 */

/** Style partagé des `<select>` natifs habillés Riso (cf. library-client). */
const SELECT_CLASS =
  "h-12 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base font-medium text-ink outline-none focus-visible:shadow-riso-sauge"

/** Mention d'estimation imposée par le §7.5 (texte exact). */
const MENTION_ESTIMATION =
  "Estimation indicative (± ~15–20 %) — ne pas utiliser à des fins médicales/nutritionnelles précises."

/** Une ligne d'ingrédient éditable (avec une clé stable pour le rendu). */
type IngredientRow = {
  key: string
  nom: string
  /** Saisie libre tant qu'on édite ; convertie en nombre/null à l'envoi. */
  quantite: string
  unite: Unite | null
}

/** Une étape éditable (clé stable pour ajout/suppression sans saut de focus). */
type EtapeRow = { key: string; texte: string }

/** Identifiant local unique pour les clés de liste (ajout/suppression). */
function makeKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

/** Nombre → chaîne d'édition (`null` → champ vide). */
function numToStr(n: number | null): string {
  return n === null ? "" : String(n)
}

/** Chaîne d'édition → nombre fini, sinon `null`. */
function strToNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export function ReviewForm({
  recette,
  photoPreviewUrls,
  onCancel,
  onSaved,
  source = "photo",
  suggestions = [],
}: {
  recette: RecetteExtraite
  /** Aperçus mémoire des photos (URL.createObjectURL), le temps de la relecture. */
  photoPreviewUrls: string[]
  onCancel: () => void
  onSaved: (recipeId: string) => void
  /**
   * Origine de la recette enregistrée (§4) : `'photo'` (extraction, défaut),
   * `'manuelle'` ou `'ia'` (mode « Créer / Améliorer », §9.3). Transmis tel quel
   * à {@link createRecipe}.
   */
  source?: "photo" | "manuelle" | "ia"
  /**
   * Suggestions concrètes du mode créatif (§9.2). Affichées en encart (jamais
   * d'interface de notation) ; non enregistrées avec la recette.
   */
  suggestions?: string[]
}) {
  const [titre, setTitre] = useState(recette.titre)
  const [duree, setDuree] = useState(numToStr(recette.duree_minutes))
  const [typePlat, setTypePlat] = useState<TypePlat>(recette.type_plat)
  const [tags, setTags] = useState<Set<Tag>>(new Set(recette.tags))
  const [personnes, setPersonnes] = useState(
    numToStr(recette.nombre_personnes),
  )
  const [calories, setCalories] = useState(
    numToStr(recette.calories_par_portion),
  )
  const [proteines, setProteines] = useState(numToStr(recette.proteines_g))
  const [glucides, setGlucides] = useState(numToStr(recette.glucides_g))
  const [lipides, setLipides] = useState(numToStr(recette.lipides_g))

  const [ingredients, setIngredients] = useState<IngredientRow[]>(() =>
    recette.ingredients.map((i) => ({
      key: makeKey(),
      nom: i.nom,
      quantite: numToStr(i.quantite),
      unite: i.unite,
    })),
  )
  const [etapes, setEtapes] = useState<EtapeRow[]>(() =>
    recette.etapes.map((texte) => ({ key: makeKey(), texte })),
  )

  const [error, setError] = useState<string | undefined>()
  const [isPending, startTransition] = useTransition()

  function toggleTag(tag: Tag) {
    setTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // --- Ingrédients : modification / ajout / suppression --------------------
  function updateIngredient(key: string, patch: Partial<IngredientRow>) {
    setIngredients((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }
  function addIngredient() {
    setIngredients((prev) => [
      ...prev,
      { key: makeKey(), nom: "", quantite: "", unite: null },
    ])
  }
  function removeIngredient(key: string) {
    setIngredients((prev) => prev.filter((row) => row.key !== key))
  }

  // --- Étapes : modification / ajout / suppression -------------------------
  function updateEtape(key: string, texte: string) {
    setEtapes((prev) =>
      prev.map((row) => (row.key === key ? { ...row, texte } : row)),
    )
  }
  function addEtape() {
    setEtapes((prev) => [...prev, { key: makeKey(), texte: "" }])
  }
  function removeEtape(key: string) {
    setEtapes((prev) => prev.filter((row) => row.key !== key))
  }

  function save() {
    if (!titre.trim()) {
      setError("Donne un titre à la recette.")
      return
    }
    setError(undefined)

    const ingredientsInput: RecipeIngredientInput[] = ingredients
      .map((row) => ({
        nom: row.nom.trim(),
        quantite: strToNum(row.quantite),
        unite: row.unite,
      }))
      .filter((row) => row.nom.length > 0)

    const etapesInput = etapes.map((row) => row.texte.trim()).filter(Boolean)

    startTransition(async () => {
      const result = await createRecipe({
        titre: titre.trim(),
        dureeMinutes: strToNum(duree),
        typePlat,
        tags: [...tags],
        nombrePersonnes: strToNum(personnes) ?? 4,
        caloriesParPortion: strToNum(calories),
        proteinesG: strToNum(proteines),
        glucidesG: strToNum(glucides),
        lipidesG: strToNum(lipides),
        ingredients: ingredientsInput,
        etapes: etapesInput,
        source,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onSaved(result.recipeId)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête : aperçu photo + titre */}
      <header className="flex flex-col gap-4">
        <h1 className="font-display text-xl uppercase text-ink">
          Relire & corriger
        </h1>
        <p className="-mt-2 text-[13px] leading-snug text-ink-soft">
          {source === "ia"
            ? "Voici la proposition de l’IA. Ajuste tout ce que tu veux avant d’enregistrer."
            : "L’IA fait au mieux sur l’écriture manuscrite. Vérifie et corrige tout avant d’enregistrer."}
        </p>

        {/* Suggestions concrètes du mode créatif (§9.2) — affichage seul, jamais
            de notation. */}
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2 rounded-[12px] border-2 border-ink bg-paper-light p-3 shadow-riso-sauge">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              <Sparkles className="size-3.5" strokeWidth={2.5} aria-hidden />
              Suggestions de l’IA
            </span>
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((s, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-[13px] leading-snug text-ink"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brique" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {photoPreviewUrls.length === 1 && (
          <div className="relative h-44 w-full overflow-hidden rounded-[12px] border-2 border-ink shadow-riso-sauge">
            <Image
              src={photoPreviewUrls[0]}
              alt="Photo de la recette"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
        )}

        {/* Plusieurs photos : galerie en défilement horizontal. */}
        {photoPreviewUrls.length > 1 && (
          <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
            {photoPreviewUrls.map((url, index) => (
              <div
                key={url}
                className="relative h-32 w-44 shrink-0 snap-start overflow-hidden rounded-[12px] border-2 border-ink shadow-riso-sauge"
              >
                <Image
                  src={url}
                  alt={`Photo ${index + 1} de la recette`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </header>

      {/* Titre */}
      <Field label="Titre" htmlFor="recipe_titre">
        <RisoInput
          id="recipe_titre"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre de la recette"
          maxLength={120}
          autoComplete="off"
        />
      </Field>

      {/* Durée + nombre de personnes côte à côte */}
      <div className="flex gap-3">
        <Field label="Durée (min)" htmlFor="recipe_duree">
          <div className="relative">
            <Clock
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <RisoInput
              id="recipe_duree"
              type="number"
              inputMode="numeric"
              min={0}
              value={duree}
              onChange={(e) => setDuree(e.target.value)}
              placeholder="—"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Personnes" htmlFor="recipe_personnes">
          <div className="relative">
            <Users
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <RisoInput
              id="recipe_personnes"
              type="number"
              inputMode="numeric"
              min={1}
              value={personnes}
              onChange={(e) => setPersonnes(e.target.value)}
              placeholder="4"
              className="pl-9"
            />
          </div>
        </Field>
      </div>

      {/* Type de plat (un seul, §10) */}
      <Field label="Type de plat" htmlFor="recipe_type">
        <select
          id="recipe_type"
          value={typePlat}
          onChange={(e) => setTypePlat(e.target.value as TypePlat)}
          className={SELECT_CLASS}
        >
          {TYPES_PLAT.map((t) => (
            <option key={t} value={t}>
              {LABELS_TYPE_PLAT[t]}
            </option>
          ))}
        </select>
      </Field>

      {/* Étiquettes (plusieurs, jeu fermé §10) */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Étiquettes
        </span>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((tag) => {
            const active = tags.has(tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-[8px] border-2 border-ink px-3 py-2 font-body text-[13px] font-medium outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                  active
                    ? "bg-sauge text-ink shadow-riso-ink-sm"
                    : "bg-paper-light text-ink-soft opacity-70",
                )}
              >
                {LABELS_TAG[tag]}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ingrédients (nom / quantité / unité) — ajout & suppression */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] uppercase text-ink">
            Ingrédients
          </h2>
          <span className="font-mono text-[11px] text-ink-soft">
            {ingredients.length}
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {ingredients.map((row) => (
            <li
              key={row.key}
              className="flex items-start gap-2 rounded-[10px] border-2 border-ink bg-paper-light p-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <RisoInput
                  value={row.nom}
                  onChange={(e) => updateIngredient(row.key, { nom: e.target.value })}
                  placeholder="Nom de l’ingrédient"
                  aria-label="Nom de l’ingrédient"
                  maxLength={80}
                  className="h-11"
                />
                <div className="flex gap-2">
                  <RisoInput
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={row.quantite}
                    onChange={(e) =>
                      updateIngredient(row.key, { quantite: e.target.value })
                    }
                    placeholder="Quantité"
                    aria-label="Quantité"
                    className="h-11 flex-1"
                  />
                  <select
                    value={row.unite ?? ""}
                    onChange={(e) =>
                      updateIngredient(row.key, {
                        unite: (e.target.value || null) as Unite | null,
                      })
                    }
                    aria-label="Unité"
                    className={cn(SELECT_CLASS, "h-11 w-28 shrink-0")}
                  >
                    <option value="">au goût</option>
                    {UNITES.map((u) => (
                      <option key={u} value={u}>
                        {LABELS_UNITE[u]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeIngredient(row.key)}
                aria-label={`Supprimer ${row.nom || "cet ingrédient"}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-brique text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
              >
                <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <RisoButton
          variant="ghost"
          size="sm"
          onClick={addIngredient}
          className="self-start"
        >
          <Plus aria-hidden /> Ajouter un ingrédient
        </RisoButton>
      </section>

      {/* Étapes éditables — ajout & suppression */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[15px] uppercase text-ink">Étapes</h2>
          <span className="font-mono text-[11px] text-ink-soft">
            {etapes.length}
          </span>
        </div>

        <ol className="flex flex-col gap-2">
          {etapes.map((row, index) => (
            <li
              key={row.key}
              className="flex items-start gap-2 rounded-[10px] border-2 border-ink bg-paper-light p-2.5"
            >
              <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] border-2 border-ink bg-sauge font-display text-[13px] text-ink">
                {index + 1}
              </span>
              <textarea
                value={row.texte}
                onChange={(e) => updateEtape(row.key, e.target.value)}
                placeholder="Décris cette étape…"
                aria-label={`Étape ${index + 1}`}
                rows={2}
                className="min-h-11 w-full resize-y rounded-[8px] border-2 border-ink bg-paper-light px-3 py-2 text-base text-ink outline-none focus-visible:shadow-riso-sauge"
              />
              <button
                type="button"
                onClick={() => removeEtape(row.key)}
                aria-label={`Supprimer l’étape ${index + 1}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-brique text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
              >
                <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
              </button>
            </li>
          ))}
        </ol>

        <RisoButton
          variant="ghost"
          size="sm"
          onClick={addEtape}
          className="self-start"
        >
          <Plus aria-hidden /> Ajouter une étape
        </RisoButton>
      </section>

      {/* Calories & macros (par portion) + mention d'estimation §7.5 */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] uppercase text-ink">
          Calories & macros{" "}
          <span className="font-body text-[12px] normal-case text-ink-soft">
            (par portion)
          </span>
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories (kcal)" htmlFor="recipe_calories">
            <RisoInput
              id="recipe_calories"
              type="number"
              inputMode="numeric"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="—"
            />
          </Field>
          <Field label="Protéines (g)" htmlFor="recipe_proteines">
            <RisoInput
              id="recipe_proteines"
              type="number"
              inputMode="decimal"
              min={0}
              value={proteines}
              onChange={(e) => setProteines(e.target.value)}
              placeholder="—"
            />
          </Field>
          <Field label="Glucides (g)" htmlFor="recipe_glucides">
            <RisoInput
              id="recipe_glucides"
              type="number"
              inputMode="decimal"
              min={0}
              value={glucides}
              onChange={(e) => setGlucides(e.target.value)}
              placeholder="—"
            />
          </Field>
          <Field label="Lipides (g)" htmlFor="recipe_lipides">
            <RisoInput
              id="recipe_lipides"
              type="number"
              inputMode="decimal"
              min={0}
              value={lipides}
              onChange={(e) => setLipides(e.target.value)}
              placeholder="—"
            />
          </Field>
        </div>

        <p className="rounded-[8px] border-2 border-dashed border-ink bg-paper px-3 py-2.5 text-[12px] leading-snug text-ink-soft">
          ⚠️ {MENTION_ESTIMATION}
        </p>
      </section>

      <FormFeedback error={error} />

      {/* Actions : Enregistrer / Annuler */}
      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t-2 border-ink bg-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <RisoButton
          onClick={save}
          disabled={isPending}
          aria-busy={isPending}
          className="h-12 flex-1 text-sm"
        >
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </RisoButton>
        <RisoButton
          variant="secondary"
          onClick={onCancel}
          disabled={isPending}
          className="h-12 text-sm"
        >
          Annuler
        </RisoButton>
      </div>
    </div>
  )
}
