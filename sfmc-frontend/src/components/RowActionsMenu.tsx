import type { ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  /** Texte pour lecteurs d’écran */
  ariaLabel?: string
  align?: 'start' | 'center' | 'end'
  className?: string
}

export function RowActionsMenu({
  children,
  ariaLabel = 'Ouvrir le menu des actions',
  align = 'end',
  className,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 shrink-0', className)}
          aria-label={ariaLabel}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[11rem]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
