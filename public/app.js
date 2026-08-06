(() => {
  const API_BASE = window.location.origin
  const state = {
    mediaType: 'movie',
    providers: [],
    health: {},
    sources: [],
    responseId: null,
    hls: null,
    activeSourceUrl: null,
  }

  const el = {
    apiStatus: document.getElementById('apiStatus'),
    apiStatusText: document.getElementById('apiStatusText'),
    apiBase: document.getElementById('apiBase'),
    providerList: document.getElementById('providerList'),
    providersEmpty: document.getElementById('providersEmpty'),
    resolveForm: document.getElementById('resolveForm'),
    tmdbId: document.getElementById('tmdbId'),
    season: document.getElementById('season'),
    episode: document.getElementById('episode'),
    tvFields: document.getElementById('tvFields'),
    btnResolve: document.getElementById('btnResolve'),
    btnRefreshCache: document.getElementById('btnRefreshCache'),
    btnReloadAll: document.getElementById('btnReloadAll'),
    btnRefreshProviders: document.getElementById('btnRefreshProviders'),
    player: document.getElementById('player'),
    playerStage: document.getElementById('playerStage'),
    playerOverlay: document.getElementById('playerOverlay'),
    sourceList: document.getElementById('sourceList'),
    sourcesEmpty: document.getElementById('sourcesEmpty'),
    sourceMeta: document.getElementById('sourceMeta'),
    sourceCount: document.getElementById('sourceCount'),
    responseId: document.getElementById('responseId'),
    diagnostics: document.getElementById('diagnostics'),
  }

  el.apiBase.textContent = API_BASE

  async function api(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    })
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = { raw: text }
    }
    if (!res.ok) {
      const message = body?.error?.message || body?.message || res.statusText
      throw new Error(message)
    }
    return body
  }

  function setApiStatus(ok, label) {
    el.apiStatus.dataset.state = ok ? 'ok' : 'down'
    el.apiStatusText.textContent = label
  }

  async function ping() {
    try {
      const info = await api('/')
      const name = info?.name || 'OMSS'
      setApiStatus(true, `${name} online`)
    } catch (error) {
      setApiStatus(false, error.message || 'offline')
    }
  }

  async function loadProviders() {
    const [listRes, healthRes] = await Promise.all([
      api('/admin/providers'),
      api('/admin/providers/health').catch(() => ({ health: {} })),
    ])
    state.providers = listRes.providers || []
    state.health = healthRes.health || {}
    renderProviders()
  }

  function renderProviders() {
    el.providerList.innerHTML = ''
    el.providersEmpty.hidden = state.providers.length > 0

    for (const provider of state.providers) {
      const row = document.createElement('article')
      row.className = 'provider-row'
      row.dataset.enabled = String(!!provider.enabled)
      row.setAttribute('role', 'listitem')

      const health = state.health[provider.id]
      const healthLabel =
        health === true ? 'healthy' : health === false ? 'unhealthy' : 'unknown'
      const healthClass =
        health === true ? 'health-ok' : health === false ? 'health-bad' : ''

      const info = document.createElement('div')
      info.innerHTML = `
        <div class="row-title">${escapeHtml(provider.name)}</div>
        <div class="row-meta">
          <span class="badge ${provider.enabled ? 'on' : 'off'}">${provider.enabled ? 'enabled' : 'disabled'}</span>
          <span class="badge ${healthClass}">${healthLabel}</span>
          <span>${escapeHtml(provider.id)}</span>
          <span>${escapeHtml((provider.capabilities || []).join(', ') || '—')}</span>
          <span>${escapeHtml(provider.source || 'local')}</span>
        </div>
      `

      const actions = document.createElement('div')
      actions.className = 'row-actions'
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'toggle ghost'
      toggle.textContent = provider.enabled ? 'Disable' : 'Enable'
      toggle.addEventListener('click', () => toggleProvider(provider))
      actions.appendChild(toggle)

      row.append(info, actions)
      el.providerList.appendChild(row)
    }
  }

  async function toggleProvider(provider) {
    const path = provider.enabled
      ? `/admin/providers/${encodeURIComponent(provider.id)}/disable`
      : `/admin/providers/${encodeURIComponent(provider.id)}/enable`
    await api(path, { method: 'POST' })
    await loadProviders()
  }

  async function reloadPlugins() {
    el.btnReloadAll.disabled = true
    try {
      await api('/admin/providers/reload', { method: 'POST' })
      await loadProviders()
    } finally {
      el.btnReloadAll.disabled = false
    }
  }

  function setMediaType(type) {
    state.mediaType = type
    for (const btn of document.querySelectorAll('.seg')) {
      btn.classList.toggle('active', btn.dataset.type === type)
    }
    el.tvFields.hidden = type !== 'tv'
  }

  function resolveUrl() {
    const id = el.tmdbId.value.trim()
    if (!id) throw new Error('TMDB id is required')
    if (state.mediaType === 'movie') return `/v1/movies/${encodeURIComponent(id)}`
    const s = Number(el.season.value || 1)
    const e = Number(el.episode.value || 1)
    return `/v1/tv/${encodeURIComponent(id)}/seasons/${s}/episodes/${e}`
  }

  async function resolveSources({ refresh = false } = {}) {
    el.btnResolve.disabled = true
    el.btnRefreshCache.disabled = true
    try {
      if (refresh && state.responseId) {
        await api(`/v1/refresh/${encodeURIComponent(state.responseId)}`, { method: 'POST' })
      }
      const data = await api(resolveUrl())
      state.sources = data.sources || []
      state.responseId = data.id || data.responseId || null
      renderSources(data)
      if (state.sources.length) {
        const preferred =
          state.sources.find((s) => s.provider?.id === '2embed') ||
          state.sources.find((s) => s.provider?.id === 'bingr') ||
          state.sources.find((s) => s.provider?.id === 'filmo') ||
          state.sources.find((s) => s.provider?.id === 'pikashow') ||
          state.sources.find((s) => s.provider?.id === 'netmirror') ||
          state.sources.find(
            (s) =>
              !['example', 'sample-plugin'].includes(s.provider?.id) &&
              !String(s.url || '').includes('example.com'),
          ) ||
          state.sources[0]
        playSource(preferred)
      } else {
        stopPlayback()
      }
    } finally {
      el.btnResolve.disabled = false
      el.btnRefreshCache.disabled = !state.responseId
    }
  }

  function renderSources(data) {
    el.sourceList.innerHTML = ''
    el.sourcesEmpty.hidden = state.sources.length > 0
    el.sourceMeta.hidden = false
    el.sourceCount.textContent = `${state.sources.length} source${state.sources.length === 1 ? '' : 's'}`
    el.responseId.textContent = state.responseId ? `id ${state.responseId}` : ''

    const diagnostics = data.diagnostics || []
    if (diagnostics.length) {
      el.diagnostics.hidden = false
      el.diagnostics.textContent = diagnostics
        .map((d) => `[${d.severity || 'info'}] ${d.code || ''}: ${d.message || ''}`)
        .join('\n')
    } else {
      el.diagnostics.hidden = true
      el.diagnostics.textContent = ''
    }

    for (const source of state.sources) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'source-row'
      btn.dataset.url = source.url || ''
      btn.setAttribute('role', 'listitem')
      if (source.url === state.activeSourceUrl) btn.classList.add('active')
      btn.innerHTML = `
        <div>
          <div class="row-title">${escapeHtml(source.provider?.name || source.provider?.id || 'Unknown')}</div>
          <div class="row-meta">
            <span>${escapeHtml(source.type || 'unknown')}</span>
            <span>${escapeHtml(source.quality || 'Auto')}</span>
            <span>${escapeHtml((source.audioTracks || []).map((a) => a.label).filter(Boolean).join(', ') || 'audio')}</span>
          </div>
        </div>
      `
      btn.addEventListener('click', () => playSource(source))
      el.sourceList.appendChild(btn)
    }
  }

  function stopPlayback() {
    if (state.hls) {
      state.hls.destroy()
      state.hls = null
    }
    el.player.removeAttribute('src')
    el.player.load()
    state.activeSourceUrl = null
    el.playerStage.classList.remove('is-playing')
    el.playerOverlay.hidden = false
  }

  function parseProxyPayload(proxyUrl) {
    try {
      const parsed = new URL(proxyUrl, API_BASE)
      if (!parsed.pathname.endsWith('/v1/proxy')) return null
      const raw = parsed.searchParams.get('data')
      if (!raw) return null
      try {
        return JSON.parse(raw)
      } catch {
        return JSON.parse(decodeURIComponent(raw))
      }
    } catch {
      return null
    }
  }

  function createProxyUrl(upstreamUrl, headers) {
    const data = JSON.stringify({ url: upstreamUrl, headers })
    return `${API_BASE}/v1/proxy?data=${encodeURIComponent(data)}`
  }

  function resolveAgainst(baseUrl, targetUrl) {
    if (/^https?:\/\//i.test(targetUrl)) return targetUrl
    return new URL(targetUrl, baseUrl).toString()
  }

  function isManifestUrlLine(line) {
    if (/^https?:\/\//i.test(line) || line.startsWith('//') || line.startsWith('/')) return true
    return (
      line.includes('.ts') ||
      line.includes('.m3u8') ||
      line.includes('.mp4') ||
      line.includes('.m4s') ||
      line.includes('.key') ||
      line.includes('/') ||
      /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/.test(line)
    )
  }

  /** Client-side safety net: relative HLS URIs must not resolve to /v1/*.m3u8. */
  function rewriteManifestText(content, baseUrl, headers) {
    return content
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (line.startsWith('#') && /URI\s*=\s*["']/i.test(line)) {
          return line.replace(/URI\s*=\s*["']([^"']+)["']/gi, (match, captured) => {
            const abs = resolveAgainst(baseUrl, captured)
            const proxied = abs.includes('/v1/proxy?data=')
              ? abs.startsWith('http')
                ? abs
                : `${API_BASE}${abs}`
              : createProxyUrl(abs, headers)
            const quote = match.includes('"') ? '"' : "'"
            return `URI=${quote}${proxied}${quote}`
          })
        }
        if (line.startsWith('#') || trimmed === '') return line
        if (!isManifestUrlLine(trimmed)) return line
        if (trimmed.includes('/v1/proxy?data=')) {
          return trimmed.startsWith('http') ? trimmed : `${API_BASE}${trimmed}`
        }
        const indent = line.match(/^\s*/)?.[0] ?? ''
        return indent + createProxyUrl(resolveAgainst(baseUrl, trimmed), headers)
      })
      .join('\n')
  }

  function createHlsLoader() {
    const BaseLoader = window.Hls.DefaultConfig.loader
    return class ManifestRewriteLoader extends BaseLoader {
      load(context, config, callbacks) {
        const originalSuccess = callbacks.onSuccess
        callbacks.onSuccess = (response, stats, ctx, networkDetails) => {
          try {
            const raw = response?.data
            const text =
              typeof raw === 'string'
                ? raw
                : raw instanceof ArrayBuffer
                  ? new TextDecoder().decode(raw)
                  : null
            if (text && text.trimStart().startsWith('#EXTM3U')) {
              const payload = parseProxyPayload(ctx.url)
              const base = payload?.url || ctx.url
              const headers = payload?.headers
              response.data = rewriteManifestText(text, base, headers)
            }
          } catch (error) {
            console.warn('[omss-ui] manifest rewrite failed', error)
          }
          originalSuccess(response, stats, ctx, networkDetails)
        }
        super.load(context, config, callbacks)
      }
    }
  }

  function playSource(source) {
    if (!source?.url) return
    stopPlayback()
    state.activeSourceUrl = source.url
    for (const row of el.sourceList.querySelectorAll('.source-row')) {
      row.classList.toggle('active', row.dataset.url === source.url)
    }

    let url = source.url.startsWith('http') ? source.url : `${API_BASE}${source.url}`
    // Bust any previously cached unrewnritten playlists.
    if (url.includes('/v1/proxy')) {
      url += (url.includes('?') ? '&' : '?') + `_nc=${Date.now()}`
    }
    const type = String(source.type || '').toLowerCase()
    const isHls = type === 'hls' || /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')

    el.playerOverlay.hidden = true
    el.playerStage.classList.add('is-playing')

    if (isHls && window.Hls && window.Hls.isSupported()) {
      state.hls = new window.Hls({
        enableWorker: false,
        lowLatencyMode: false,
        loader: createHlsLoader(),
      })
      state.hls.loadSource(url)
      state.hls.attachMedia(el.player)
      state.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        el.player.play().catch(() => {})
      })
      state.hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) {
          el.diagnostics.hidden = false
          el.diagnostics.textContent = `Playback error: ${data.type} / ${data.details}`
        }
      })
    } else if (el.player.canPlayType('application/vnd.apple.mpegurl') && isHls) {
      el.player.src = url
      el.player.play().catch(() => {})
    } else {
      el.player.src = url
      el.player.play().catch(() => {})
    }
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
  }

  for (const btn of document.querySelectorAll('.seg')) {
    btn.addEventListener('click', () => setMediaType(btn.dataset.type))
  }

  el.resolveForm.addEventListener('submit', (event) => {
    event.preventDefault()
    resolveSources().catch((error) => {
      el.diagnostics.hidden = false
      el.diagnostics.textContent = error.message
    })
  })

  el.btnRefreshCache.addEventListener('click', () => {
    resolveSources({ refresh: true }).catch((error) => {
      el.diagnostics.hidden = false
      el.diagnostics.textContent = error.message
    })
  })

  el.btnReloadAll.addEventListener('click', () => {
    reloadPlugins().catch((error) => {
      el.diagnostics.hidden = false
      el.diagnostics.textContent = error.message
    })
  })

  el.btnRefreshProviders.addEventListener('click', () => {
    loadProviders().catch((error) => {
      el.diagnostics.hidden = false
      el.diagnostics.textContent = error.message
    })
  })

  Promise.all([ping(), loadProviders()]).catch((error) => {
    el.diagnostics.hidden = false
    el.diagnostics.textContent = error.message
  })
})()
