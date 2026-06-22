/**
 * ListLogo — pastille « cerveau partagé » posée à droite d'une tuile de liste.
 *
 * Remplace l'ancien badge « deux personnes ». Le logo EST l'info de partage :
 *   - shared  → cerveau bichromique (vert sauge + corail brique) = liste partagée
 *   - sauge   → cerveau vert  = to-do personnelle du membre sauge (toi)
 *   - brique  → cerveau corail = to-do personnelle du membre brique (la conjointe)
 *
 * Les assets sont des PNG détourés (fond transparent) servis depuis /public, donc
 * ils se posent proprement sur le papier de la carte sans cadre.
 */
export type ListLogoVariant = "shared" | "sauge" | "brique"

const SRC: Record<ListLogoVariant, string> = {
  shared: "/icons/list-logo-shared.png",
  sauge: "/icons/list-logo-sauge.png",
  brique: "/icons/list-logo-brique.png",
}

function label(variant: ListLogoVariant, ownerName?: string | null): string {
  if (variant === "shared") return "Liste partagée"
  return ownerName ? `Liste personnelle de ${ownerName}` : "Liste personnelle"
}

export function ListLogo({
  variant,
  ownerName,
}: {
  variant: ListLogoVariant
  /** Prénom du propriétaire (libellé accessible des listes non partagées). */
  ownerName?: string | null
}) {
  const text = label(variant, ownerName)
  return (
    <Image
      src={SRC[variant]}
      alt={text}
      title={text}
      width={32}
      height={32}
      className="size-8 shrink-0 select-none"
      draggable={false}
    />
  )
}
import Image from "next/image"
