"use client"

/**
 * /design-test — page TEMPORAIRE de visualisation du Design System Sauge & Brique.
 * But : vérifier en vrai (tokens, polices, ombres, trame) que les composants de base
 * rendent comme la maquette `docs/design_system_visuel.html`.
 * À supprimer une fois les écrans métier en place — ne fait partie d'aucun flux produit.
 */

import { useState } from "react"

import { AvatarIdentity } from "@/components/ui/avatar-identity"
import { CategoryHeader } from "@/components/ui/category-header"
import { RisoBadge } from "@/components/ui/riso-badge"
import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { BottomNav } from "@/components/shared/bottom-nav"

function Section({
  index,
  title,
  children,
}: {
  index: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-12 first:mt-0">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="font-display text-base uppercase">
          {index} · {title}
        </h2>
        <span className="h-[3px] flex-1 bg-ink" />
      </div>
      {children}
    </section>
  )
}

function Demo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

const SWATCHES = [
  { name: "Papier", hex: "#F0E5D0", className: "bg-paper" },
  { name: "Papier clair", hex: "#FBF4E2", className: "bg-paper-light" },
  { name: "Papier profond", hex: "#E5D7BC", className: "bg-paper-deep" },
  { name: "Encre", hex: "#1A1410", className: "bg-ink" },
  { name: "Encre soft", hex: "#5C4F40", className: "bg-ink-soft" },
  { name: "Brique", hex: "#C5594A", className: "bg-brique" },
  { name: "Sauge", hex: "#7B9E89", className: "bg-sauge" },
]

export default function DesignTestPage() {
  const [checked, setChecked] = useState(true)

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-6">
        <header className="border-b-[3px] border-ink pb-6">
          <span className="mb-4 inline-block border-2 border-ink bg-brique px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-paper shadow-riso-ink-sm">
            ▸ Design System · Sauge &amp; Brique
          </span>
          <h1 className="font-display text-3xl uppercase leading-tight">
            La boîte à outils visuelle
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-soft">
            Page temporaire de contrôle : tous les composants de base rendus avec
            les tokens réels. Source de vérité : <code>docs/DESIGN_SYSTEM.md</code>.
          </p>
        </header>

        {/* 1 — Couleurs */}
        <Section index={1} title="Couleurs">
          <RisoCard shadow="brique" border="strong">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SWATCHES.map((s) => (
                <div
                  key={s.hex}
                  className="overflow-hidden rounded-[6px] border-2 border-ink"
                >
                  <div className={`h-16 ${s.className}`} />
                  <div className="bg-paper-light px-2.5 py-2 font-mono text-[11px]">
                    <span className="block font-bold">{s.name}</span>
                    <span className="text-[10px] text-ink-soft">{s.hex}</span>
                  </div>
                </div>
              ))}
            </div>
          </RisoCard>
        </Section>

        {/* 2 — Typographie */}
        <Section index={2} title="Typographie">
          <RisoCard>
            <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Silkscreen — titres, noms, compteurs · Hanken Grotesk — corps, UI,
              méta · JetBrains Mono — méta technique
            </p>
            <div className="divide-y divide-paper-deep">
              <TypeRow tag="Display L · Silkscreen">
                <span className="font-display text-[28px] uppercase">
                  Nos listes
                </span>
              </TypeRow>
              <TypeRow tag="Display M · Silkscreen">
                <span className="font-display text-lg uppercase">Auchan</span>
              </TypeRow>
              <TypeRow tag="Display S · Silkscreen">
                <span className="font-display text-[13px]">8 articles</span>
              </TypeRow>
              <TypeRow tag="Body L · Hanken 15">
                <span className="text-[15px] font-medium">
                  Tomates cerises, salade roquette…
                </span>
              </TypeRow>
              <TypeRow tag="Body M · Hanken 13">
                <span className="text-[13px] font-medium">
                  Lait demi-écrémé, yaourts grecs
                </span>
              </TypeRow>
              <TypeRow tag="Caption · Hanken 11">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  8 articles · maj 12 min
                </span>
              </TypeRow>
            </div>
          </RisoCard>
        </Section>

        {/* 3 — Signature riso */}
        <Section index={3} title="Signature riso">
          <RisoCard shadow="brique">
            <p className="mb-5 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
              Bordure encre + ombre décalée nette (sauge ou brique). Coins 8-14px.
              Aucun dégradé, aucune ombre floue.
            </p>
            <div className="flex flex-wrap gap-7">
              <div className="rounded-[10px] border-2 border-ink bg-paper-light px-6 py-4 font-display text-[13px] shadow-riso-sauge">
                Ombre sauge
              </div>
              <div className="rounded-[10px] border-2 border-ink bg-paper-light px-6 py-4 font-display text-[13px] shadow-riso-brique">
                Ombre brique
              </div>
              <div className="rounded-[10px] border-2 border-ink bg-paper-light px-6 py-4 font-display text-[13px] shadow-riso-ink-lg">
                Ombre encre
              </div>
            </div>
          </RisoCard>
        </Section>

        {/* 4 — Composants */}
        <Section index={4} title="Composants">
          <RisoCard padding="lg">
            <div className="grid gap-8 sm:grid-cols-2">
              <Demo title="Boutons">
                <div className="flex flex-col items-start gap-3">
                  <div className="flex flex-wrap gap-3">
                    <RisoButton variant="primary">Valider</RisoButton>
                    <RisoButton variant="secondary">Annuler</RisoButton>
                  </div>
                  <RisoButton variant="ghost">+ Nouvelle liste</RisoButton>
                </div>
              </Demo>

              <Demo title="Compteurs (badges)">
                <RisoBadge>8</RisoBadge>
                <RisoBadge variant="sauge">3</RisoBadge>
                <RisoBadge variant="empty">✓</RisoBadge>
              </Demo>

              <Demo title="Cases à cocher">
                <RisoCheckbox
                  checked={false}
                  onCheckedChange={() => {}}
                  aria-label="Exemple non coché"
                />
                <RisoCheckbox
                  checked={checked}
                  onCheckedChange={setChecked}
                  aria-label="Exemple interactif"
                />
                <span className="text-[13px] text-ink-soft">← cliquable</span>
              </Demo>

              <Demo title="Avatars (identité couleur)">
                <AvatarIdentity identity="toi" name="Baptiste" />
                <AvatarIdentity identity="elle" name="Marie" />
              </Demo>

              <Demo title="En-tête de catégorie">
                <div className="w-full max-w-[260px]">
                  <CategoryHeader label="Épicerie" count="×2" />
                </div>
              </Demo>

              <Demo title="Barre de navigation">
                <div className="w-full max-w-[280px] overflow-hidden rounded-[10px] border-[2.5px] border-ink">
                  <BottomNav className="static border-t-0 pb-2" />
                </div>
              </Demo>
            </div>
          </RisoCard>
        </Section>

        <p className="mt-12 font-mono text-[11px] text-ink-soft">
          ⚠︎ Page temporaire — à retirer une fois les écrans métier en place.
        </p>
      </main>

      {/* BottomNav réelle, ancrée en bas de la fenêtre */}
      <BottomNav />
    </div>
  )
}

function TypeRow({
  tag,
  children,
}: {
  tag: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-4 py-3">
      <span className="w-32 shrink-0 font-mono text-[10px] font-bold uppercase text-ink-soft">
        {tag}
      </span>
      {children}
    </div>
  )
}
