import { TypographyShowcase } from '@/components/ui/TypographyShowcase'
import { LottieAnimation } from '@/components/ui/LottieAnimation'
import { LordIcon } from '@/components/ui/LordIcon'
import { LORDICONS } from '@/constants/lordicons'

import loadingAnim from '@/assets/animations/loading.json'
import emptyBoxAnim from '@/assets/animations/empty-box.json'
import successAnim from '@/assets/animations/success.json'
import errorAnim from '@/assets/animations/error.json'
import warehouseAnim from '@/assets/animations/warehouse.json'
import invoiceAnim from '@/assets/animations/invoice.json'
import businessWelcomeAnim from '@/assets/animations/lottieflow/business-welcome.json'

const lottieFiles = [
  { label: 'loading', src: loadingAnim, size: 120, loop: true },
  { label: 'empty-box', src: emptyBoxAnim, size: 160, loop: false },
  { label: 'success', src: successAnim, size: 120, loop: false },
  { label: 'error', src: errorAnim, size: 120, loop: false },
  { label: 'warehouse', src: warehouseAnim, size: 160, loop: false },
  { label: 'invoice', src: invoiceAnim, size: 160, loop: false },
]

const triggers: Array<'hover' | 'click' | 'loop' | 'loop-on-hover'> = [
  'hover',
  'click',
  'loop',
  'loop-on-hover',
]

export default function DesignShowcasePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-12 p-8">
      <header className="space-y-2">
        <p className="text-label text-muted-foreground">Design system</p>
        <h1 className="text-display">SFMC Design Showcase</h1>
        <p className="text-body-lg text-muted-foreground">
          Référence visuelle — typographie Satoshi, LottieFiles, LottieFlow et LordIcon.
        </p>
      </header>

      <TypographyShowcase />

      <section className="space-y-6">
        <div>
          <h2 className="text-h2">LottieFiles — illustrations</h2>
          <p className="text-body text-muted-foreground">
            Animations JSON utilisées pour les états de pages (vide, succès, erreur, chargement).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {lottieFiles.map((a) => (
            <div
              key={a.label}
              className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card p-4"
            >
              <div className="flex items-center justify-center">
                <LottieAnimation src={a.src} size={a.size} loop={a.loop} />
              </div>
              <span className="text-caption text-muted-foreground">{a.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-h2">LottieFlow — onboarding & pages premium</h2>
          <p className="text-body text-muted-foreground">
            Pack cohérent pour les parcours onboarding, login et 404.
          </p>
        </div>
        <div className="flex items-center justify-center rounded-lg border bg-card p-8">
          <LottieAnimation src={businessWelcomeAnim} size={280} loop />
        </div>
      </section>

      <section className="space-y-6">
        <div>
          <h2 className="text-h2">LordIcon — icônes animées</h2>
          <p className="text-body text-muted-foreground">
            Icônes réactives (hover, click, loop) pour la navigation et les actions.
          </p>
        </div>

        <div>
          <h3 className="text-h4 mb-3">Mapping SFMC</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {Object.entries(LORDICONS).map(([key, src]) => (
              <div
                key={key}
                className="group flex flex-col items-center gap-2 rounded-lg border bg-card p-4"
              >
                <LordIcon src={src} trigger="hover" size={40} />
                <span className="text-caption text-muted-foreground">{key}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-h4 mb-3">Triggers disponibles</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {triggers.map((t) => (
              <div
                key={t}
                className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4"
              >
                <LordIcon src={LORDICONS.dashboard} trigger={t} size={40} />
                <span className="text-caption text-muted-foreground">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-h4 mb-3">Tailles</h3>
          <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-card p-6">
            {[20, 24, 32, 48].map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <LordIcon src={LORDICONS.orders} size={size} trigger="loop-on-hover" />
                <span className="text-caption text-muted-foreground">{size}px</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
