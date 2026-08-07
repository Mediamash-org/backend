import Hls from 'hls.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchEpisodeSources,
  fetchMovieSources,
  fetchSeasonEpisodes,
  fetchSourcesByPath,
  isAbortError,
} from '../api'
import type { EpisodeSummary, SourcesResponse, StreamSource, StreamSubtitle } from '../api/types'
import { ErrorState } from '../components/ErrorState'
import { Focusable } from '../components/Focusable'
import { Icon } from '../components/Icon'
import { LinkHuntLoader } from '../components/LinkHuntLoader'
import type { Route } from '../navigation/routes'
import {
  collectSourceAudioOptions,
  type AudioTrackInfo,
  type SubtitleTrackInfo,
} from '../player/tracks'
import { sortSourcesByQuality } from '../player/quality'
import {
  applyVttToTrack,
  buildSubtitleMenuOptions,
  clearTextTrack,
  fetchSubtitleAsVtt,
} from '../player/subtitles'

interface PlayerScreenProps {
  kind: 'movie' | 'episode'
  id: string
  title: string
  season?: number
  episode?: number
  streamPath?: string
  onBack: () => void
  onNavigate: (route: Route) => void
}

type MenuId = 'none' | 'audio' | 'subtitles' | 'episodes' | 'quality'

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function isHlsUrl(src: StreamSource): boolean {
  const url = src.url
  return (
    src.type === 'hls' ||
    src.type === 'm3u8' ||
    /\.m3u8(\?|$)/i.test(url) ||
    url.includes('m3u8')
  )
}

export function PlayerScreen({
  kind,
  id,
  title,
  season,
  episode,
  streamPath,
  onBack,
  onNavigate,
}: PlayerScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideTimer = useRef<number | null>(null)
  const subTrackRef = useRef<TextTrack | null>(null)
  const subCacheRef = useRef<Map<string, string>>(new Map())
  const subRequestRef = useRef<string | null>(null)
  const [subLoading, setSubLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<StreamSource[]>([])
  const [apiSubtitles, setApiSubtitles] = useState<StreamSubtitle[]>([])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [showUi, setShowUi] = useState(true)
  const [menu, setMenu] = useState<MenuId>('none')
  const [reloadKey, setReloadKey] = useState(0)
  const [audioOptions, setAudioOptions] = useState<AudioTrackInfo[]>([])
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleTrackInfo[]>([])
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null)
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>('off')
  const [seasonEpisodes, setSeasonEpisodes] = useState<EpisodeSummary[]>([])
  const [seriesTitle, setSeriesTitle] = useState(title)
  const [upNext, setUpNext] = useState<EpisodeSummary | null>(null)
  const [upNextCountdown, setUpNextCountdown] = useState(0)

  const revealUi = useCallback(() => {
    setShowUi(true)
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    if (menu !== 'none' || paused) return
    hideTimer.current = window.setTimeout(() => setShowUi(false), 4500)
  }, [menu, paused])

  const playEpisode = useCallback(
    (ep: EpisodeSummary, showTitle?: string) => {
      setUpNext(null)
      setUpNextCountdown(0)
      setMenu('none')
      onNavigate({
        name: 'player',
        kind: 'episode',
        id,
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        title: `${showTitle || seriesTitle} · S${ep.seasonNumber}E${ep.episodeNumber}`,
        streamPath: ep.streamPath,
      })
    },
    [id, onNavigate, seriesTitle],
  )

  // Resolve stream sources
  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setUpNext(null)
    const req = streamPath
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
        const sorted = sortSourcesByQuality(res.sources)
        setSources(sorted)
        setApiSubtitles(res.subtitles || [])
        setSourceIndex(0)
        setAudioOptions(collectSourceAudioOptions(sorted))
        setActiveAudioId(collectSourceAudioOptions(sorted)[0]?.id ?? null)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (isAbortError(err) || ac.signal.aborted) return
        setError(err.message || 'Unable to start playback.')
        setLoading(false)
      })

    return () => ac.abort()
  }, [kind, id, season, episode, streamPath, reloadKey])

  // Load season episodes for next/prev
  useEffect(() => {
    if (kind !== 'episode' || season == null) {
      setSeasonEpisodes([])
      return
    }
    const ac = new AbortController()
    fetchSeasonEpisodes(id, season, ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return
        setSeasonEpisodes(res.episodes)
        const match = title.match(/^(.+?)\s·\sS\d+E\d+/i)
        if (match) setSeriesTitle(match[1])
      })
      .catch(() => {
        /* ignore */
      })
    return () => ac.abort()
  }, [kind, id, season, title])

  const episodeIndex = useMemo(() => {
    if (kind !== 'episode' || episode == null) return -1
    return seasonEpisodes.findIndex((e) => e.episodeNumber === episode)
  }, [kind, episode, seasonEpisodes])

  const prevEpisode = episodeIndex > 0 ? seasonEpisodes[episodeIndex - 1] : null
  const nextEpisode =
    episodeIndex >= 0 && episodeIndex < seasonEpisodes.length - 1
      ? seasonEpisodes[episodeIndex + 1]
      : null

  // Attach media source
  useEffect(() => {
    const video = videoRef.current
    if (!video || !sources[sourceIndex]) return

    const src = sources[sourceIndex]
    const useHls = isHlsUrl(src) && Hls.isSupported()

    hlsRef.current?.destroy()
    hlsRef.current = null
    subTrackRef.current = null
    subCacheRef.current.clear()
    setActiveSubtitleId('off')

    // Same-origin TextTrack only — never <track src> to :3000 (cross-origin blocked)
    const ensureLocalSubTrack = () => {
      if (subTrackRef.current) return subTrackRef.current
      const track = video.addTextTrack('subtitles', 'MediaMash', 'en')
      track.mode = 'disabled'
      subTrackRef.current = track
      return track
    }
    ensureLocalSubTrack()

    const publishSubtitleMenu = (hlsTracks: Array<{ name?: string; lang?: string }> = []) => {
      // Stream-embedded tracks win; extracted API subs only when the playlist has none.
      setSubtitleOptions(buildSubtitleMenuOptions(apiSubtitles, hlsTracks))
    }

    if (useHls) {
      const hls = new Hls({
        enableWorker: true,
        enableWebVTT: true,
        renderTextTracksNatively: true,
      })
      hlsRef.current = hls
      hls.loadSource(src.url)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const hlsAudio: AudioTrackInfo[] = hls.audioTracks.map((t, i) => ({
          id: `hls-a-${i}`,
          label: t.name || t.lang || `Audio ${i + 1}`,
          language: t.lang,
          hlsTrackId: i,
          sourceIndex,
        }))
        const fromSources = collectSourceAudioOptions(sources)
        setAudioOptions(hlsAudio.length > 1 ? hlsAudio : fromSources)
        if (hlsAudio.length > 1) {
          setActiveAudioId(hlsAudio[hls.audioTrack]?.id ?? hlsAudio[0]?.id ?? null)
        }

        publishSubtitleMenu(hls.subtitleTracks)
        void video.play().catch(() => setPaused(true))
      })
      // Some manifests expose subtitle tracks after the initial parse.
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        publishSubtitleMenu(hls.subtitleTracks)
      })
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) setError('Playback error. Try another quality or audio.')
      })
    } else {
      video.src = src.url
      publishSubtitleMenu()
      void video.play().catch(() => setPaused(true))
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      if (subTrackRef.current) {
        clearTextTrack(subTrackRef.current)
        subTrackRef.current.mode = 'disabled'
      }
      subTrackRef.current = null
      video.removeAttribute('src')
      video.load()
    }
  }, [sources, sourceIndex, apiSubtitles])

  // UI auto-hide
  useEffect(() => {
    revealUi()
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
    }
  }, [revealUi, current, paused, menu])

  // Up next countdown
  useEffect(() => {
    if (!upNext || upNextCountdown <= 0) return
    const t = window.setTimeout(() => setUpNextCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [upNext, upNextCountdown])

  useEffect(() => {
    if (upNext && upNextCountdown === 0) {
      playEpisode(upNext)
    }
  }, [upNext, upNextCountdown, playEpisode])

  // Remote keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      revealUi()

      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 461) {
        e.preventDefault()
        if (menu !== 'none') {
          setMenu('none')
          return
        }
        if (upNext) {
          setUpNext(null)
          return
        }
        onBack()
        return
      }

      if (!video) return

      if (menu !== 'none') return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        video.currentTime = Math.max(0, video.currentTime - 10)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
      } else if (e.key === 'ArrowUp' && kind === 'episode' && nextEpisode) {
        e.preventDefault()
        // Netflix often uses buttons; keep arrows for seek/focus
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (upNext) {
          playEpisode(upNext)
          return
        }
        if (video.paused) void video.play()
        else video.pause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack, revealUi, menu, upNext, playEpisode, kind, nextEpisode])

  const disableAllTextTracks = () => {
    const video = videoRef.current
    if (!video) return
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = 'disabled'
    }
  }

  const selectAudio = (opt: AudioTrackInfo) => {
    setActiveAudioId(opt.id)
    const hls = hlsRef.current
    if (opt.hlsTrackId != null && hls) {
      hls.audioTrack = opt.hlsTrackId
    } else if (opt.sourceIndex != null && opt.sourceIndex !== sourceIndex) {
      const video = videoRef.current
      const t = video?.currentTime || 0
      setSourceIndex(opt.sourceIndex)
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.currentTime = t
      }, 400)
    }
    setMenu('none')
  }

  const selectSubtitle = (opt: SubtitleTrackInfo) => {
    const video = videoRef.current
    const hls = hlsRef.current
    subRequestRef.current = opt.id
    setActiveSubtitleId(opt.id)
    setMenu('none')

    if (opt.id === 'off') {
      if (hls) {
        hls.subtitleTrack = -1
        hls.subtitleDisplay = false
      }
      disableAllTextTracks()
      if (subTrackRef.current) clearTextTrack(subTrackRef.current)
      setSubLoading(false)
      return
    }

    // Embedded HLS subtitle track
    if (opt.hlsTrackId != null && hls) {
      if (subTrackRef.current) {
        clearTextTrack(subTrackRef.current)
        subTrackRef.current.mode = 'disabled'
      }
      hls.subtitleDisplay = true
      hls.subtitleTrack = opt.hlsTrackId
      setSubLoading(false)
      return
    }

    // External API subtitle — fetch (CORS OK) then inject cues (avoids <track src> same-origin rule)
    if (!opt.url || !video) return

    if (hls) {
      hls.subtitleTrack = -1
      hls.subtitleDisplay = false
    }
    disableAllTextTracks()

    const track =
      subTrackRef.current ||
      (() => {
        const t = video.addTextTrack('subtitles', opt.label, opt.language || 'en')
        subTrackRef.current = t
        return t
      })()

    const apply = (vtt: string) => {
      if (subRequestRef.current !== opt.id) return
      applyVttToTrack(track, vtt)
      track.mode = 'showing'
      setSubLoading(false)
    }

    const cached = subCacheRef.current.get(opt.id)
    if (cached) {
      apply(cached)
      return
    }

    setSubLoading(true)
    void fetchSubtitleAsVtt(opt.url, opt.format, opt.alternateUrls)
      .then((vtt) => {
        subCacheRef.current.set(opt.id, vtt)
        apply(vtt)
      })
      .catch(() => {
        if (subRequestRef.current !== opt.id) return
        setSubLoading(false)
        setActiveSubtitleId('off')
      })
  }
  const onEnded = () => {
    if (kind === 'episode' && nextEpisode) {
      setUpNext(nextEpisode)
      setUpNextCountdown(8)
      setShowUi(true)
    }
  }

  if (loading) {
    return (
      <div className="player-screen player-screen--loading">
        <LinkHuntLoader title={title} label="Looking for links…" />
        <Focusable id="player-back-wait" className="btn btn--ghost link-hunt__back" onSelect={onBack}>
          Cancel
        </Focusable>
      </div>
    )
  }

  if (error) {
    return (
      <div className="player-screen player-screen--loading">
        <ErrorState title="Playback unavailable" message={error} onRetry={() => setReloadKey((k) => k + 1)} />
        <Focusable id="player-back-err" className="btn btn--ghost" onSelect={onBack} autoFocus>
          Back
        </Focusable>
      </div>
    )
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0
  const activeAudio = audioOptions.find((a) => a.id === activeAudioId)
  const activeSub = subtitleOptions.find((s) => s.id === activeSubtitleId)

  return (
    <div
      className="player-screen nf-player"
      onMouseMove={revealUi}
      onClick={revealUi}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={onEnded}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          setCurrent(v.currentTime)
          if (v.buffered.length) {
            try {
              setBuffered(v.buffered.end(v.buffered.length - 1))
            } catch {
              /* ignore */
            }
          }
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />

      <div className={`nf-player__shade${showUi || menu !== 'none' || upNext ? ' is-visible' : ''}`} />

      <div className={`nf-player__ui${showUi || menu !== 'none' || upNext ? ' is-visible' : ''}`}>
        <div className="nf-player__top">
          <Focusable
            id="player-exit"
            className="nf-icon-btn"
            onSelect={onBack}
            autoFocus={menu === 'none'}
            aria-label="Back"
          >
            <Icon name="arrow-left" size={30} label="Back" />
          </Focusable>
          <div className="nf-player__heading">
            <p className="nf-player__eyebrow">{kind === 'episode' ? 'Series' : 'Movie'}</p>
            <h1 className="nf-player__title">{title}</h1>
          </div>
        </div>

        <div className="nf-player__center">
          <Focusable
            id="player-pp-center"
            className="nf-play-btn"
            onSelect={() => {
              const v = videoRef.current
              if (!v) return
              if (v.paused) void v.play()
              else v.pause()
            }}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={44} label={paused ? 'Play' : 'Pause'} />
          </Focusable>
        </div>

        <div className="nf-player__bottom">
          <Focusable
            id="player-scrub"
            className="nf-scrub"
            onSelect={() => {
              /* focus enables left/right seek via global handler while UI visible */
            }}
          >
            <div className="nf-scrub__track">
              <div className="nf-scrub__buffer" style={{ width: `${bufferPct}%` }} />
              <div className="nf-scrub__progress" style={{ width: `${progress}%` }} />
              <div className="nf-scrub__knob" style={{ left: `${progress}%` }} />
            </div>
            <div className="nf-scrub__times">
              <span>{formatTime(current)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </Focusable>

          <div className="nf-player__controls">
            <div className="nf-player__controls-left">
              <Focusable
                id="player-rw"
                className="nf-icon-btn"
                onSelect={() => {
                  const v = videoRef.current
                  if (v) v.currentTime = Math.max(0, v.currentTime - 10)
                }}
                aria-label="Seek back 10 seconds"
              >
                <Icon name="seek-backward-10" size={30} label="Seek back 10 seconds" />
              </Focusable>
              <Focusable
                id="player-pp"
                className="nf-icon-btn nf-icon-btn--lg"
                onSelect={() => {
                  const v = videoRef.current
                  if (!v) return
                  if (v.paused) void v.play()
                  else v.pause()
                }}
                aria-label={paused ? 'Play' : 'Pause'}
              >
                <Icon name={paused ? 'play' : 'pause'} size={32} label={paused ? 'Play' : 'Pause'} />
              </Focusable>
              <Focusable
                id="player-ff"
                className="nf-icon-btn"
                onSelect={() => {
                  const v = videoRef.current
                  if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
                }}
                aria-label="Seek forward 10 seconds"
              >
                <Icon name="seek-forward-10" size={30} label="Seek forward 10 seconds" />
              </Focusable>

              {kind === 'episode' && (
                <>
                  <Focusable
                    id="player-prev-ep"
                    className="nf-icon-btn"
                    disabled={!prevEpisode}
                    onSelect={() => prevEpisode && playEpisode(prevEpisode)}
                    aria-label="Previous episode"
                  >
                    <Icon name="previous" size={28} label="Previous episode" />
                  </Focusable>
                  <Focusable
                    id="player-next-ep"
                    className="nf-icon-btn"
                    disabled={!nextEpisode}
                    onSelect={() => nextEpisode && playEpisode(nextEpisode)}
                    aria-label="Next episode"
                  >
                    <Icon name="next" size={28} label="Next episode" />
                  </Focusable>
                </>
              )}
            </div>

            <div className="nf-player__controls-right">
              {kind === 'episode' && seasonEpisodes.length > 0 && (
                <Focusable
                  id="player-episodes"
                  className={`nf-icon-btn${menu === 'episodes' ? ' is-active' : ''}`}
                  onSelect={() => setMenu(menu === 'episodes' ? 'none' : 'episodes')}
                  aria-label="Episodes"
                >
                  <Icon name="episodes" size={28} label="Episodes" />
                </Focusable>
              )}
              {audioOptions.length > 0 && (
                <Focusable
                  id="player-audio"
                  className={`nf-icon-btn${menu === 'audio' ? ' is-active' : ''}`}
                  onSelect={() => setMenu(menu === 'audio' ? 'none' : 'audio')}
                  aria-label={activeAudio ? `Audio: ${activeAudio.label}` : 'Audio'}
                >
                  <Icon name="language" size={28} label="Audio" />
                </Focusable>
              )}
              {subtitleOptions.length > 1 && (
                <Focusable
                  id="player-subs"
                  className={`nf-icon-btn${menu === 'subtitles' ? ' is-active' : ''}`}
                  onSelect={() => setMenu(menu === 'subtitles' ? 'none' : 'subtitles')}
                  aria-label={
                    activeSub && activeSub.id !== 'off' ? `Subtitles: ${activeSub.label}` : 'Subtitles'
                  }
                >
                  <Icon
                    name={activeSub && activeSub.id !== 'off' ? 'closed-captions-on' : 'subtitles'}
                    size={28}
                    label="Subtitles"
                  />
                </Focusable>
              )}
              {sources.length > 1 && (
                <Focusable
                  id="player-quality"
                  className={`nf-icon-btn${menu === 'quality' ? ' is-active' : ''}`}
                  onSelect={() => setMenu(menu === 'quality' ? 'none' : 'quality')}
                  aria-label={sources[sourceIndex]?.quality || 'Quality'}
                >
                  <Icon name="settings" size={28} label="Quality" />
                </Focusable>
              )}
            </div>
          </div>
        </div>
      </div>

      {menu !== 'none' && (
        <div className="nf-menu" role="dialog">
          <div className="nf-menu__panel">
            <div className="nf-menu__header">
              <h2>
                {menu === 'audio' && 'Audio'}
                {menu === 'subtitles' && (subLoading ? 'Subtitles · loading…' : 'Subtitles')}
                {menu === 'episodes' && `Season ${season} episodes`}
                {menu === 'quality' && 'Quality / Source'}
              </h2>
              <Focusable
                id="nf-menu-close"
                className="nf-icon-btn"
                onSelect={() => setMenu('none')}
                autoFocus
                aria-label="Close"
              >
                <Icon name="x-mark" size={26} label="Close" />
              </Focusable>
            </div>
            <div className="nf-menu__list">
              {menu === 'audio' &&
                audioOptions.map((opt) => (
                  <Focusable
                    key={opt.id}
                    id={`audio-${opt.id}`}
                    className={`nf-menu__item${activeAudioId === opt.id ? ' is-active' : ''}`}
                    onSelect={() => selectAudio(opt)}
                  >
                    <span>{opt.label}</span>
                    {activeAudioId === opt.id && <Icon name="check" size={22} />}
                  </Focusable>
                ))}
              {menu === 'subtitles' &&
                subtitleOptions.map((opt) => (
                  <Focusable
                    key={opt.id}
                    id={`sub-${opt.id}`}
                    className={`nf-menu__item${activeSubtitleId === opt.id ? ' is-active' : ''}`}
                    onSelect={() => selectSubtitle(opt)}
                  >
                    <span>{opt.label}</span>
                    {activeSubtitleId === opt.id && <Icon name="check" size={22} />}
                  </Focusable>
                ))}
              {menu === 'quality' &&
                sources.map((s, i) => (
                  <Focusable
                    key={`${s.url}-${i}`}
                    id={`quality-${i}`}
                    className={`nf-menu__item${sourceIndex === i ? ' is-active' : ''}`}
                    onSelect={() => {
                      setSourceIndex(i)
                      setMenu('none')
                    }}
                  >
                    <span>
                      {(s.quality || s.provider?.name || `Source ${i + 1}`) +
                        (s.audioTracks?.length
                          ? ` · ${(s.audioTracks[0] as { label?: string }).label || 'Audio'}`
                          : '')}
                    </span>
                    {sourceIndex === i && <Icon name="check" size={22} />}
                  </Focusable>
                ))}
              {menu === 'episodes' &&
                seasonEpisodes.map((ep) => (
                  <Focusable
                    key={ep.id}
                    id={`menu-ep-${ep.episodeNumber}`}
                    className={`nf-menu__item nf-menu__episode${ep.episodeNumber === episode ? ' is-active' : ''}`}
                    onSelect={() => playEpisode(ep)}
                  >
                    <span className="nf-menu__ep-num">E{ep.episodeNumber}</span>
                    <span className="nf-menu__ep-title">{ep.title}</span>
                    {ep.episodeNumber === episode && <Icon name="check" size={22} />}
                  </Focusable>
                ))}
            </div>
          </div>
        </div>
      )}

      {upNext && (
        <div className="nf-upnext">
          <div className="nf-upnext__card">
            <p className="nf-upnext__label">Up Next · {upNextCountdown}s</p>
            <h3 className="nf-upnext__title">
              E{upNext.episodeNumber}. {upNext.title}
            </h3>
            {upNext.description && <p className="nf-upnext__desc">{upNext.description}</p>}
            <div className="nf-upnext__actions">
              <Focusable
                id="upnext-play"
                className="btn btn--play nf-upnext__play"
                autoFocus
                onSelect={() => playEpisode(upNext)}
              >
                <Icon name="play" size={22} />
                Play now
              </Focusable>
              <Focusable id="upnext-cancel" className="btn btn--ghost" onSelect={() => setUpNext(null)}>
                Cancel
              </Focusable>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
