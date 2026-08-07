import Hls from 'hls.js'
import { useEffect, useRef, useState } from 'react'
import { fetchEpisodeSources, fetchMovieSources, fetchSourcesByPath, isAbortError } from '../api'
import type { SourcesResponse, StreamSource } from '../api/types'
import { ErrorState, LoadingState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'

interface PlayerScreenProps {
  kind: 'movie' | 'episode'
  id: string
  title: string
  season?: number
  episode?: number
  streamPath?: string
  onBack: () => void
}

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function PlayerScreen({ kind, id, title, season, episode, streamPath, onBack }: PlayerScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<StreamSource[]>([])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showUi, setShowUi] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    const req =
      streamPath
        ? fetchSourcesByPath(streamPath, ac.signal)
        : kind === 'movie'
          ? fetchMovieSources(id, ac.signal)
          : fetchEpisodeSources(id, season ?? 1, episode ?? 1, ac.signal)

    req
      .then((res: SourcesResponse) => {
        if (ac.signal.aborted) return
        if (!res.sources?.length) {
          setError('No stream available for this title.')
          setLoading(false)
          return
        }
        setSources(res.sources)
        setSourceIndex(0)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setError(err.message || 'Unable to start playback.')
        setLoading(false)
      })

    return () => ac.abort()
  }, [kind, id, season, episode, streamPath, reloadKey])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !sources[sourceIndex]) return

    const src = sources[sourceIndex]
    const url = src.url
    const isHls =
      src.type === 'hls' ||
      src.type === 'm3u8' ||
      /\.m3u8(\?|$)/i.test(url) ||
      url.includes('m3u8')

    hlsRef.current?.destroy()
    hlsRef.current = null

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError('Playback error. Try another quality.')
      })
    } else {
      video.src = url
    }

    void video.play().catch(() => setPaused(true))

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.removeAttribute('src')
      video.load()
    }
  }, [sources, sourceIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault()
        onBack()
        return
      }
      if (!video) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        video.currentTime = Math.max(0, video.currentTime - 10)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (video.paused) void video.play()
        else video.pause()
      }
      setShowUi(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  useEffect(() => {
    if (!showUi) return
    const t = window.setTimeout(() => setShowUi(false), 4000)
    return () => window.clearTimeout(t)
  }, [showUi, current, paused])

  if (loading) return <LoadingState label="Resolving stream…" />
  if (error) {
    return (
      <div className="player-screen">
        <ErrorState title="Playback unavailable" message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        <Focusable id="player-back" className="btn btn--ghost" onSelect={onBack}>
          Back
        </Focusable>
      </div>
    )
  }

  const active = sources[sourceIndex]

  return (
    <div className="player-screen" onMouseMove={() => setShowUi(true)}>
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
      <div className={`player-overlay${showUi ? ' is-visible' : ''}`}>
        <div className="player-top">
          <Focusable id="player-exit" className="btn btn--ghost" onSelect={onBack} autoFocus>
            Back
          </Focusable>
          <h1 className="player-title">{title}</h1>
        </div>
        <div className="player-bottom">
          <div className="player-progress">
            <div className="player-progress__bar" style={{ width: duration ? `${(current / duration) * 100}%` : '0%' }} />
          </div>
          <div className="player-controls">
            <Focusable
              id="player-rw"
              className="btn btn--ghost"
              onSelect={() => {
                const v = videoRef.current
                if (v) v.currentTime = Math.max(0, v.currentTime - 10)
              }}
            >
              −10s
            </Focusable>
            <Focusable
              id="player-pp"
              className="btn btn--primary"
              onSelect={() => {
                const v = videoRef.current
                if (!v) return
                if (v.paused) void v.play()
                else v.pause()
              }}
            >
              {paused ? 'Play' : 'Pause'}
            </Focusable>
            <Focusable
              id="player-ff"
              className="btn btn--ghost"
              onSelect={() => {
                const v = videoRef.current
                if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
              }}
            >
              +10s
            </Focusable>
            <span className="player-time">
              {formatTime(current)} / {formatTime(duration)}
            </span>
          </div>
          {sources.length > 1 && (
            <div className="chip-row player-sources">
              {sources.map((s, i) => (
                <Focusable
                  key={`${s.url}-${i}`}
                  id={`source-${i}`}
                  className={`chip${i === sourceIndex ? ' is-active' : ''}`}
                  onSelect={() => setSourceIndex(i)}
                >
                  {s.quality || s.provider?.name || `Source ${i + 1}`}
                </Focusable>
              ))}
            </div>
          )}
          {active?.provider && (
            <p className="muted player-provider">via {active.provider.name}</p>
          )}
        </div>
      </div>
    </div>
  )
}
