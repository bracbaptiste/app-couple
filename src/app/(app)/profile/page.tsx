import Link from "next/link"
import { Brain, ChevronRight, History, ShoppingBag } from "lucide-react"
import { redirect } from "next/navigation"

import { RisoCard } from "@/components/ui/riso-card"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { cn } from "@/lib/utils"

import { CategoriesTile, DangerZone, IdentitySection } from "./profile-client"

type Color = "sauge" | "brique"

/** Normalise une couleur DB (text) vers l'union typée du front. */
function asColor(value: string): Color {
  return value === "brique" ? "brique" : "sauge"
}

/**
 * Écran Profil (/profile).
 *
 * Lecture (server component, sous RLS — on ne voit que son propre couple) :
 *   - profil courant (prénom, couleur)
 *   - partenaire éventuel (pour l'affichage + la couleur indisponible)
 *   - couple (code d'invitation à partager)
 *
 * Les rayons se gèrent sur leur page dédiée (/profile/categories), atteinte
 * depuis la tuile « Rayons du couple ». Les mutations passent par les Server
 * Actions de `./actions.ts`.
 */
export default async function ProfilePage() {
  const { user, profile } = await requireAuth()

  // Le layout protège déjà l'accès, mais on garde le type sûr ici.
  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const [coupleRes, membersRes] = await Promise.all([
    supabase
      .from("couples")
      .select("name, invite_code")
      .eq("id", profile.couple_id)
      .single(),
    supabase
      .from("profiles")
      .select("id, display_name, color")
      .eq("couple_id", profile.couple_id),
  ])

  if (coupleRes.error || membersRes.error) {
    throw new Error("Impossible de charger le profil")
  }

  const couple = coupleRes.data
  const members = membersRes.data ?? []
  const partner = members.find((m) => m.id !== user.id) ?? null

  const myColor = asColor(profile.color)

  const partnerColor = partner ? asColor(partner.color) : null

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">Profil</h1>

      <div className="flex flex-col gap-5">
        {/* Résumé du couple : membres + code d'invitation */}
        <RisoCard shadow="ink" padding="lg">
          <h2 className="mb-4 font-display text-lg uppercase text-ink">
            Notre espace
          </h2>

          <div className="mb-4 flex flex-col gap-2.5">
            <MemberRow
              name={profile.display_name || "Toi"}
              color={asColor(profile.color)}
              isYou
            />
            {partner ? (
              <MemberRow
                name={partner.display_name || "Partenaire"}
                color={asColor(partner.color)}
              />
            ) : (
              <p className="text-[13px] leading-snug text-ink-soft">
                Ton/ta partenaire n’a pas encore rejoint. Partage le code
                ci-dessous.
              </p>
            )}
          </div>

          <div className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light p-3">
            <p className="mb-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Code d’invitation
            </p>
            <p className="font-display text-2xl tracking-[0.3em] text-ink">
              {couple?.invite_code ?? "——————"}
            </p>
          </div>
        </RisoCard>

        {/* Mon identité : prénom + couleur */}
        <IdentitySection
          displayName={profile.display_name}
          color={myColor}
          partnerName={partner?.display_name ?? null}
          partnerColor={partnerColor}
        />

        {/* Tuiles de navigation : historiques figés (lecture seule, §2.9) +
            gestion des rayons. */}
        <div className="flex flex-col gap-3">
          <Link
            href="/profile/history"
            className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border-2 border-ink bg-sauge text-ink">
              <History className="size-5" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="flex-1 font-display text-[15px] uppercase text-ink">
              Historique des tâches
            </span>
            <ChevronRight
              className="size-5 shrink-0 text-ink-soft"
              strokeWidth={2.5}
              aria-hidden
            />
          </Link>

          <Link
            href="/profile/purchases"
            className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border-2 border-ink bg-brique text-paper-light">
              <ShoppingBag className="size-5" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="flex-1 font-display text-[15px] uppercase text-ink">
              Historique des achats
            </span>
            <ChevronRight
              className="size-5 shrink-0 text-ink-soft"
              strokeWidth={2.5}
              aria-hidden
            />
          </Link>

          {/* Journal du Cerveau — À CÔTÉ des historiques (§7), commandes vocales. */}
          <Link
            href="/profile/journal"
            className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border-2 border-ink bg-sauge text-ink">
              <Brain className="size-5" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="flex-1 font-display text-[15px] uppercase text-ink">
              Journal du Cerveau
            </span>
            <ChevronRight
              className="size-5 shrink-0 text-ink-soft"
              strokeWidth={2.5}
              aria-hidden
            />
          </Link>

          <CategoriesTile />
        </div>

        {/* Compte : déconnexion + quitter l'espace */}
        <DangerZone />
      </div>
    </section>
  )
}

/** Ligne « membre » : pastille couleur + prénom + repère « toi ». */
function MemberRow({
  name,
  color,
  isYou = false,
}: {
  name: string
  color: Color
  isYou?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border-[2.5px] border-ink font-display text-[14px] uppercase leading-none shadow-riso-ink-sm",
          color === "sauge" ? "bg-sauge text-ink" : "bg-brique text-paper-light",
        )}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="font-display text-[15px] uppercase text-ink">
        {name}
        {isYou && (
          <span className="ml-2 font-mono text-[11px] normal-case text-ink-soft">
            (toi)
          </span>
        )}
      </span>
    </div>
  )
}
