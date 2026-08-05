import { readFile } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public')

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/**
 * Sample admin + playback console (not part of OMSS protocol).
 * Served at /ui — keeps GET / free for OMSS health.
 */
export function registerUiRoutes(app: FastifyInstance): void {
  app.get('/ui', async (_request, reply) => {
    const html = await readFile(join(PUBLIC_DIR, 'index.html'))
    return reply.type('text/html; charset=utf-8').send(html)
  })

  app.get('/ui/', async (_request, reply) => reply.redirect('/ui'))

  app.get<{ Params: { file: string } }>('/ui/:file', async (request, reply) => {
    const file = request.params.file
    if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
      return reply.code(400).send({ error: { code: 'BAD_REQUEST', message: 'Invalid path' } })
    }
    try {
      const body = await readFile(join(PUBLIC_DIR, file))
      const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
      return reply.type(type).send(body)
    } catch {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Asset not found' } })
    }
  })
}
