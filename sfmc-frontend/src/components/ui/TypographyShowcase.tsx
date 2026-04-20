const scale = [
  { className: 'text-display', label: 'Display — 48/700', sample: 'SFMC Bénin' },
  { className: 'text-h1', label: 'H1 — 36/700', sample: 'Tableau de bord' },
  { className: 'text-h2', label: 'H2 — 28/600', sample: 'Commandes en cours' },
  { className: 'text-h3', label: 'H3 — 22/600', sample: 'Détails de la commande' },
  { className: 'text-h4', label: 'H4 — 18/500', sample: 'Section secondaire' },
  {
    className: 'text-body-lg',
    label: 'Body large — 16/400',
    sample:
      'Paragraphe principal destiné aux descriptions longues et aux blocs de contenu riches.',
  },
  {
    className: 'text-body',
    label: 'Body — 14/400',
    sample: 'Texte courant utilisé dans la plupart des interfaces SFMC.',
  },
  {
    className: 'text-body-sm',
    label: 'Body small — 13/400',
    sample: 'Texte secondaire pour tableaux denses et listes.',
  },
  {
    className: 'text-caption',
    label: 'Caption — 12/400',
    sample: 'Légende, métadonnées et informations contextuelles.',
  },
  { className: 'text-label', label: 'Label — 11/500', sample: 'Statut — en production' },
]

const weights = [
  { weight: 300, name: 'Light' },
  { weight: 400, name: 'Regular' },
  { weight: 500, name: 'Medium' },
  { weight: 600, name: 'Semibold' },
  { weight: 700, name: 'Bold' },
  { weight: 900, name: 'Black' },
]

export function TypographyShowcase() {
  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <h2 className="text-h2">Échelle typographique Satoshi</h2>
        <div className="divide-y divide-border rounded-lg border bg-card">
          {scale.map((entry) => (
            <div
              key={entry.className}
              className="flex flex-col gap-1 p-5 md:flex-row md:items-baseline md:justify-between md:gap-8"
            >
              <span className="text-label text-muted-foreground md:w-48">{entry.label}</span>
              <span className={`${entry.className} flex-1`}>{entry.sample}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-h2">Graisses disponibles</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {weights.map((w) => (
            <div
              key={w.weight}
              className="rounded-lg border bg-card p-5"
              style={{ fontWeight: w.weight }}
            >
              <p className="text-label text-muted-foreground">
                {w.weight} — {w.name}
              </p>
              <p className="mt-2" style={{ fontSize: 24 }}>
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
