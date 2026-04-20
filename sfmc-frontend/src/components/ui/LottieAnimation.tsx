import Lottie from 'lottie-react'

interface LottieAnimationProps {
  src: object
  size?: number
  loop?: boolean
  autoplay?: boolean
  className?: string
}

export function LottieAnimation({
  src,
  size = 160,
  loop = false,
  autoplay = true,
  className,
}: LottieAnimationProps) {
  return (
    <div
      className={className}
      style={{ width: size, height: size }}
    >
      <Lottie
        animationData={src}
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
