import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

type ProxyQuery = { data?: string }
type ProxyPayload = { url?: string; headers?: Record<string, string> }

/**
 * Framework ProxyController injects lowercase `range` and ProxyService also sets
 * `Range`, so undici sends BOTH headers. Some CDNs (e.g. NetMirror) respond 416.
 *
 * This preHandler owns GET /v1/proxy and forwards a single Range header.
 * It also rewrites HLS/DASH manifests so relative segment/variant URIs keep
 * going through /v1/proxy (otherwise hls.js resolves them as /v1/*.m3u8 → 404).
 */
export function registerFixedProxy(app: FastifyInstance): void {
  app.addHook(
    'preHandler',
    async (request: FastifyRequest<{ Querystring: ProxyQuery }>, reply: FastifyReply) => {
      const path = request.url.split('?')[0]
      if (request.method !== 'GET' || path !== '/v1/proxy') {
        return
      }

      const encoded = request.query.data
      if (!encoded) {
        return reply.code(400).send({
          error: {
            code: 'MISSING_PARAMETER',
            message: 'Missing required parameter: data',
          },
          traceId: request.id,
        })
      }

      let payload: ProxyPayload
      try {
        payload = parseProxyData(encoded)
      } catch {
        return reply.code(400).send({
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Invalid data parameter format',
          },
          traceId: request.id,
        })
      }

      if (!payload.url) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Missing url field in proxy data',
          },
          traceId: request.id,
        })
      }

      const upstreamHeaders: Record<string, string> = { ...(payload.headers ?? {}) }
      delete upstreamHeaders.range
      delete upstreamHeaders.Range

      const clientRange = request.headers.range
      if (clientRange) {
        upstreamHeaders.Range = Array.isArray(clientRange) ? clientRange[0] : clientRange
      }

      const proxyOrigin = requestOrigin(request)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 60_000)

      try {
        const upstream = await fetch(payload.url, {
          method: 'GET',
          headers: upstreamHeaders,
          redirect: 'follow',
          signal: controller.signal,
        })

        if (upstream.status >= 500) {
          return reply.code(502).send({
            error: {
              code: 'INTERNAL_ERROR',
              message: `Upstream returned ${upstream.status}`,
            },
            traceId: request.id,
          })
        }

        if (!upstream.body) {
          return reply.code(502).send({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Upstream returned empty body',
            },
            traceId: request.id,
          })
        }

        const contentType = upstream.headers.get('content-type') ?? guessMime(payload.url)
        const headersForRewrite = payload.headers ?? {}

        if (isManifest(contentType, payload.url)) {
          const text = await upstream.text()
          const rewritten = rewriteManifest(text, payload.url, headersForRewrite, proxyOrigin)
          const body = Buffer.from(rewritten, 'utf8')

          reply.code(upstream.status)
          reply.type(contentType.includes('mpegurl') || contentType.includes('mpegURL')
            ? contentType
            : 'application/vnd.apple.mpegurl')
          reply.header('Content-Disposition', 'inline')
          // Browsers cached unrewnritten playlists when this was max-age=7200.
          reply.header('Cache-Control', 'no-store, no-cache, must-revalidate')
          reply.header('Pragma', 'no-cache')
          reply.header('Content-Length', String(body.length))
          return reply.send(body)
        }

        reply.code(upstream.status)
        reply.type(contentType)
        reply.header('Content-Disposition', 'inline; filename="stream"')
        reply.header(
          'Cache-Control',
          upstream.headers.get('cache-control') ?? 'public, max-age=7200',
        )
        reply.header(
          'Access-Control-Expose-Headers',
          'Content-Disposition, Content-Length, Content-Range, Accept-Ranges, Last-Modified, ETag',
        )

        const acceptRanges = upstream.headers.get('accept-ranges')
        if (acceptRanges) reply.header('Accept-Ranges', acceptRanges)
        else if (upstream.status === 206) reply.header('Accept-Ranges', 'bytes')

        const contentLength = upstream.headers.get('content-length')
        if (contentLength) reply.header('Content-Length', contentLength)

        const contentRange = upstream.headers.get('content-range')
        if (contentRange) reply.header('Content-Range', contentRange)

        const lastModified = upstream.headers.get('last-modified')
        if (lastModified) reply.header('Last-Modified', lastModified)

        const etag = upstream.headers.get('etag')
        if (etag) reply.header('ETag', etag)

        const nodeStream = Readable.fromWeb(upstream.body as import('stream/web').ReadableStream)
        return reply.send(nodeStream)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const code =
          error instanceof Error && 'cause' in error
            ? String((error as Error & { cause?: { code?: unknown } }).cause?.code ?? '')
            : ''
        const detail = code ? ` (${code})` : ''
        return reply.code(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: `Failed to proxy request: ${message}${detail}`,
          },
          traceId: request.id,
        })
      } finally {
        clearTimeout(timer)
      }
    },
  )
}

function requestOrigin(request: FastifyRequest): string {
  const forwardedProto = headerValue(request.headers['x-forwarded-proto'])
  const forwardedHost = headerValue(request.headers['x-forwarded-host'])
  const proto = forwardedProto?.split(',')[0]?.trim() || request.protocol || 'http'
  const host =
    forwardedHost?.split(',')[0]?.trim() ||
    headerValue(request.headers.host) ||
    'localhost:3000'
  return `${proto}://${host}`
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Fastify already decodes query values; tolerate raw or still-encoded input. */
export function parseProxyData(encoded: string): ProxyPayload {
  try {
    return JSON.parse(encoded) as ProxyPayload
  } catch {
    return JSON.parse(decodeURIComponent(encoded)) as ProxyPayload
  }
}

function guessMime(url: string): string {
  if (/\.m3u8(\?|$)/i.test(url)) return 'application/x-mpegURL'
  if (/\.mpd(\?|$)/i.test(url)) return 'application/dash+xml'
  if (/\.mp4(\?|$)/i.test(url)) return 'video/mp4'
  if (/\.mkv(\?|$)/i.test(url)) return 'video/x-matroska'
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm'
  if (/\.ts(\?|$)/i.test(url)) return 'video/mp2t'
  if (/\.vtt(\?|$)/i.test(url)) return 'text/vtt'
  if (/\.srt(\?|$)/i.test(url)) return 'text/plain'
  return 'application/octet-stream'
}

function isManifest(contentType: string, url: string): boolean {
  if (/\.(vtt|srt|ass|ssa|ttml)(\?|$)/i.test(url)) return false
  if (/\.m3u8(\?|$)/i.test(url) || /\.mpd(\?|$)/i.test(url)) return true
  if (/#EXTM3U/i.test(url)) return false
  return /application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml)/i.test(contentType)
}

export function createProxyUrl(
  url: string,
  headers?: Record<string, string>,
  proxyOrigin?: string,
): string {
  const data = JSON.stringify({ url, headers })
  const path = `/v1/proxy?data=${encodeURIComponent(data)}`
  return proxyOrigin ? `${proxyOrigin.replace(/\/$/, '')}${path}` : path
}

function resolveUrl(baseUrl: string, targetUrl: string): string {
  if (/^https?:\/\//i.test(targetUrl)) return targetUrl
  const base = new URL(baseUrl)
  if (targetUrl.startsWith('//')) return `${base.protocol}${targetUrl}`
  if (targetUrl.startsWith('/')) return `${base.protocol}//${base.host}${targetUrl}`
  return new URL(targetUrl, baseUrl).toString()
}

function isUrlLine(line: string): boolean {
  if (/^https?:\/\//i.test(line) || line.startsWith('//') || line.startsWith('/')) return true
  return (
    line.includes('.ts') ||
    line.includes('.m3u8') ||
    line.includes('.mp4') ||
    line.includes('.m4s') ||
    line.includes('.webm') ||
    line.includes('.vtt') ||
    line.includes('.key') ||
    line.includes('/') ||
    /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/.test(line)
  )
}

function rewriteTagAttributes(
  line: string,
  baseUrl: string,
  headers?: Record<string, string>,
  proxyOrigin?: string,
): string {
  return line.replace(/URI\s*=\s*["']([^"']+)["']/gi, (match, capturedUrl: string) => {
    const proxied = createProxyUrl(resolveUrl(baseUrl, capturedUrl), headers, proxyOrigin)
    const quote = match.includes('"') ? '"' : "'"
    return `URI=${quote}${proxied}${quote}`
  })
}

/** Mirror framework ProxyService.rewriteManifest so nested HLS URIs stay proxied. */
export function rewriteManifest(
  content: string,
  baseUrl: string,
  headers?: Record<string, string>,
  proxyOrigin?: string,
): string {
  const lines = content.split('\n')
  const out: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (line.startsWith('#') && /URI\s*=\s*["']/i.test(line)) {
      out.push(rewriteTagAttributes(line, baseUrl, headers, proxyOrigin))
      continue
    }
    if (line.startsWith('#') || trimmed === '') {
      out.push(line)
      continue
    }
    if (isUrlLine(trimmed)) {
      // Already a host proxy URL — leave as-is (optionally absolutize).
      if (trimmed.includes('/v1/proxy?data=')) {
        const indent = line.match(/^\s*/)?.[0] ?? ''
        if (proxyOrigin && trimmed.startsWith('/')) {
          out.push(indent + `${proxyOrigin.replace(/\/$/, '')}${trimmed}`)
        } else {
          out.push(line)
        }
        continue
      }
      const indent = line.match(/^\s*/)?.[0] ?? ''
      out.push(indent + createProxyUrl(resolveUrl(baseUrl, trimmed), headers, proxyOrigin))
    } else {
      out.push(line)
    }
  }

  return out.join('\n')
}
