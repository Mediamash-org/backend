import { useEffect, useState } from 'react'

interface SplashScreenProps {
  onDone: () => void
}

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase('hold'), 700)
    const t2 = window.setTimeout(() => setPhase('out'), 2200)
    const t3 = window.setTimeout(() => onDone(), 2900)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
    }
  }, [onDone])

  return (
    <div className={`splash splash--${phase}`} role="presentation">
      <div className="splash__glow" />
      <div className="splash__mark">
        <span className="splash__logo">N</span>
      </div>
      <h1 className="splash__title">OMSS</h1>
      <p className="splash__tagline">Stream anything. Controlled by your server.</p>
      <div className="splash__bar" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}
