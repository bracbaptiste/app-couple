/**
 * Shell des écrans publics d'authentification (login / signup / forgot-password).
 * Mobile-first : une seule colonne centrée, carte papier signée riso, marge de
 * sécurité pour les encoches (viewportFit cover). Aucun chrome applicatif ici
 * (pas de BottomNav) — l'utilisateur n'est pas encore dans l'app.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-7 text-center">
          <span className="mb-3 inline-block border-2 border-ink bg-brique px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-paper-light shadow-riso-ink-sm">
            ▸ App Couple
          </span>
          <h1 className="font-display text-2xl uppercase leading-tight text-ink">
            Le cerveau partagé
            <br />
            du couple
          </h1>
        </header>

        {children}
      </div>
    </main>
  )
}
