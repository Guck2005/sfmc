import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-6xl font-bold text-sfmc-500">404</div>
      <h2 className="mt-2 text-xl font-semibold">Page introuvable</h2>
      <p className="text-muted-foreground mt-2 max-w-md">
        L'URL demandée n'existe pas ou vous n'avez pas les droits pour y accéder.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Retour à l’accueil</Link>
      </Button>
    </div>
  )
}
