import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

type ProxyQuery = { data?: string }

/**
 * Framework ProxyController injects lowercase `range` and ProxyService also sets
 * `Range`, so undici sends BOTH headers. Some CDNs (e.g. NetMirror) respond 416.
 *
 * This preHandler owns GET /v1/proxy and forwards a single Range header.
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

      let payload: { url?: string; headers?: Record<string, string> }
      try {
        payload = JSON.parse(decodeURIComponent(encoded)) as typeof payload
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

        const contentType =
          upstream.headers.get('content-type') ?? guessMime(payload.url)

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

function guessMime(url: string): string {
  if (/\.m3u8(\?|$)/i.test(url)) return 'application/x-mpegURL'
  if (/\.mp4(\?|$)/i.test(url)) return 'video/mp4'
  if (/\.mkv(\?|$)/i.test(url)) return 'video/x-matroska'
  if (/\.webm(\?|$)/i.test(url)) return 'video/webm'
  if (/\.vtt(\?|$)/i.test(url)) return 'text/vtt'
  if (/\.srt(\?|$)/i.test(url)) return 'text/plain'
  return 'application/octet-stream'
}
