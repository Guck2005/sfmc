import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type LordIconTrigger =
  | 'hover'
  | 'click'
  | 'loop'
  | 'loop-on-hover'
  | 'morph'
  | 'in'
  | 'boomerang'

type LordIconStroke = 'light' | 'regular' | 'bold'

type LordIconElementAttributes = DetailedHTMLProps<
  HTMLAttributes<HTMLElement> & {
    src: string
    trigger?: LordIconTrigger
    colors?: string
    delay?: number | string
    stroke?: LordIconStroke
    state?: string
  },
  HTMLElement
>

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'lord-icon': LordIconElementAttributes
    }
  }
}

interface LordIconProps {
  src: string
  trigger?: LordIconTrigger
  size?: number
  primaryColor?: string
  secondaryColor?: string
  stroke?: LordIconStroke
  delay?: number
  className?: string
}

export function LordIcon({
  src,
  trigger = 'hover',
  size = 24,
  primaryColor = '#1D4ED8',
  secondaryColor = '#60A5FA',
  stroke = 'regular',
  delay,
  className,
}: LordIconProps) {
  return (
    <lord-icon
      src={src}
      trigger={trigger}
      stroke={stroke}
      delay={delay}
      colors={`primary:${primaryColor},secondary:${secondaryColor}`}
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
