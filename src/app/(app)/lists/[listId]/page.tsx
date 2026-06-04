import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

/**
 * Détail d'une liste (/lists/[listId]) — PLACEHOLDER.
 *
 * Le contenu complet (articles, ajout depuis la bibliothèque, cochage) sera
 * construit à l'étape suivante. Ici on valide seulement le routage et l'accès :
 * on ne charge la liste que si elle appartient au couple courant (RLS + filtre
 * couple_id), sinon 404.
 */
export default async function ListDetailPage({
  params,
}: {
  // Next 16 : les params de route sont asynchrones.
  params: Promise<{ listId: string }>
}) {
  const { listId } = await params
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const { data: list } = await supabase
    .from("lists")
    .select("id, name")
    .eq("id", listId)
    .eq("couple_id", profile.couple_id)
    .maybeSingle()

  if (!list) notFound()

  return (
    <section className="mx-auto w-full max-w-sm">
      <div className="mb-4">
        <Link
          href="/lists"
          className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft"
        >
          ← Listes
        </Link>
        <h1 className="mt-1 font-display text-xl uppercase text-ink">
          {list.name}
        </h1>
      </div>

      <RisoCard shadow="sauge" padding="lg">
        <p className="text-sm text-ink-soft">
          Le contenu de cette liste (articles, ajout depuis la bibliothèque,
          cochage) arrivera à la prochaine étape.
        </p>
        <Link href="/lists" className="mt-4 inline-block">
          <RisoButton variant="secondary" size="sm">
            Retour aux listes
          </RisoButton>
        </Link>
      </RisoCard>
    </section>
  )
}
