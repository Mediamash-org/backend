import type { CSSProperties } from 'react'
import arrowLeft from '../assets/icons/arrow-left.svg'
import check from '../assets/icons/check.svg'
import closedCaptions from '../assets/icons/closed-captions.svg'
import closedCaptionsOn from '../assets/icons/closed-captions-on.svg'
import episodes from '../assets/icons/episodes.svg'
import language from '../assets/icons/language.svg'
import music from '../assets/icons/music.svg'
import next from '../assets/icons/next.svg'
import pause from '../assets/icons/pause.svg'
import play from '../assets/icons/play.svg'
import previous from '../assets/icons/previous.svg'
import seekBackward10 from '../assets/icons/seek-backward-10.svg'
import seekForward10 from '../assets/icons/seek-forward-10.svg'
import settings from '../assets/icons/settings.svg'
import subtitles from '../assets/icons/subtitles.svg'
import xMark from '../assets/icons/x-mark.svg'

const ICONS = {
  'arrow-left': arrowLeft,
  check,
  'closed-captions': closedCaptions,
  'closed-captions-on': closedCaptionsOn,
  episodes,
  language,
  music,
  next,
  pause,
  play,
  previous,
  'seek-backward-10': seekBackward10,
  'seek-forward-10': seekForward10,
  settings,
  subtitles,
  'x-mark': xMark,
} as const

export type IconName = keyof typeof ICONS

interface IconProps {
  name: IconName
  className?: string
  size?: number
  label?: string
}

export function Icon({ name, className = '', size = 28, label }: IconProps) {
  const src = ICONS[name]
  const style = {
    width: size,
    height: size,
    '--tv-icon': `url("${src}")`,
  } as CSSProperties

  return (
    <span
      className={`tv-icon${className ? ` ${className}` : ''}`}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
    />
  )
}
