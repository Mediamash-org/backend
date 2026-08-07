import { useEffect, useRef, useState } from 'react'
import jingleUrl from '../assets/splash-jingle.mp3'

interface SplashScreenProps {
  onDone: () => void
}

const WORDMARK = 'MEDIAMASH'

/** Total splash length — long enough for the Netflix-style jingle. */
const HOLD_AT_MS = 2200
const FADE_AT_MS = 4800
const DONE_AT_MS = 5600

export function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<'intro' | 'hold' | 'out'>('intro')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio(jingleUrl)
    audioRef.current = audio
    audio.volume = 0.85
    audio.preload = 'auto'
    void audio.play().catch(() => {
      /* Autoplay may be blocked until a user gesture on some browsers */
    })

    const t1 = window.setTimeout(() => setPhase('hold'), HOLD_AT_MS)
    const t2 = window.setTimeout(() => setPhase('out'), FADE_AT_MS)
    const t3 = window.setTimeout(() => onDone(), DONE_AT_MS)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
    }
  }, [onDone])

  return (
    <div className={`splash splash--${phase}`} role="presentation" aria-label="MediaMash">
      <div className="splash__vignette" aria-hidden="true" />
      <div className="splash__stage">
        <h1 className="splash__wordmark">
          {WORDMARK.split('').map((letter, i) => (
            <span
              key={`${letter}-${i}`}
              className={`splash__letter${letter === 'M' ? ' splash__letter--m' : ''}`}
              style={{ ['--i' as string]: i }}
            >
              {letter}
            </span>
          ))}
          <span className="splash__ribbon" aria-hidden="true" />
        </h1>
      </div>
    </div>
  )
}
