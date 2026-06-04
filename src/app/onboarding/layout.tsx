/**
 * Shell de l'écran d'onboarding (créer / rejoindre un couple). Même registre
 * visuel que l'auth : une colonne centrée, carte papier riso, sans chrome
 * applicatif (pas de BottomNav) — l'utilisateur n'est pas encore « dans » l'app.
 */
export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-7 text-center">
          <span className="mb-3 inline-block border-2 border-ink bg-sauge px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink shadow-riso-ink-sm">
            ▸ Étape 2 sur 2
          </span>
          <h1 className="font-display text-2xl uppercase leading-tight text-ink">
            Votre espace
            <br />à deux
          </h1>
        </header>

        {children}
      </div>
    </main>
  )
}
