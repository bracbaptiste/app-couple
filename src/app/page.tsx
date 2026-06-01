/**
 * Page d'accueil temporaire (étape Setup).
 * Vérifie visuellement que les tokens du Design System Riso sont bien chargés.
 * Sera remplacée par la vraie navigation (hub Listes) lors des étapes métier.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <span className="font-display text-xs uppercase tracking-widest text-ink-soft">
        Setup OK
      </span>

      <h1 className="font-display text-3xl uppercase text-ink">
        App <span className="text-brique">Couple</span>
      </h1>

      <p className="max-w-xs font-body text-sm text-ink-soft">
        Le cerveau partagé du couple. Le socle technique est en place — les
        écrans arrivent étape par étape.
      </p>

      <div className="flex gap-3">
        <span className="rounded-[10px] border-2 border-ink bg-sauge px-4 py-2 font-display text-xs uppercase text-ink shadow-riso-ink-sm">
          Sauge
        </span>
        <span className="rounded-[10px] border-2 border-ink bg-brique px-4 py-2 font-display text-xs uppercase text-paper-light shadow-riso-ink-sm">
          Brique
        </span>
      </div>
    </main>
  );
}
