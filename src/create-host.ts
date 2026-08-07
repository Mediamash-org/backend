import { OMSSServer } from '@omss/framework'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { registerAdminProviderRoutes } from './admin/providers.js'
import { ProviderPluginManager } from './plugins/manager.js'
import { loadProvidersConfig } from './plugins/loader.js'
import type { ProvidersConfig } from './plugins/types.js'
import {
  addPlayableFilterDiagnostic,
  filterPlayableSources,
} from './playability/filter.js'
import { registerFixedProxy } from './proxy/fixed-proxy.js'
import { registerMetaRoutes } from './meta/register.js'
import { registerUiRoutes } from './ui/register.js'

export interface CreateHostOptions {
  listen?: boolean
  providersConfig?: ProvidersConfig
  env?: NodeJS.ProcessEnv
}

export interface OmssHost {
  server: OMSSServer
  app: FastifyInstance
  manager: ProviderPluginManager
  start: () => Promise<void>
  stop: () => Promise<void>
}

function envOf(options: CreateHostOptions): NodeJS.ProcessEnv {
  return options.env ?? process.env
}

/**
 * Build an OMSS host: official framework server + provider plugins + admin routes.
 */
export async function createOmssHost(options: CreateHostOptions = {}): Promise<OmssHost> {
  const env = envOf(options)
  const port = Number(env.PORT ?? 3000)
  const host = env.HOST ?? '0.0.0.0'

  if (!env.TMDB_API_KEY) {
    throw new Error('TMDB_API_KEY is required. Set it in .env or the environment.')
  }

  const server = new OMSSServer({
    name: env.OMSS_NAME ?? 'MediaMash',
    version: env.OMSS_VERSION ?? '1.1.0',
    host,
    port,
    publicUrl: env.PUBLIC_URL,
    note: env.OMSS_NOTE,
    cache: {
      type: (env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
      ttl: {
        sources: Number(env.CACHE_SOURCES_TTL ?? 7200),
        subtitles: Number(env.CACHE_SUBTITLES_TTL ?? 86400),
      },
      redis: {
        host: env.REDIS_HOST ?? 'localhost',
        port: Number(env.REDIS_PORT ?? 6379),
        password: env.REDIS_PASSWORD || undefined,
      },
    },
    tmdb: {
      apiKey: env.TMDB_API_KEY,
      cacheTTL: Number(env.TMDB_CACHE_TTL ?? 86400),
    },
    proxyConfig: {
      knownThirdPartyProxies: {
        '*': [/\/proxy\/(.+)$/, /\/m3u8-proxy\?url=(.+?)(&|$)/],
      },
      streamPatterns: [/^https?:\/\/.+\.(mp4)(\?.*)?$/i],
    },
  })

  const registry = server.getRegistry()
  const manager = new ProviderPluginManager(registry)
  const providersConfig = options.providersConfig ?? (await loadProvidersConfig())
  await manager.load(providersConfig)

  const app = server.getInstance()
  // Must run before framework /v1/proxy — fixes dual Range header → CDN 416.
  registerFixedProxy(app)
  registerAdminProviderRoutes(app, manager)
  registerMetaRoutes(app, env)
  registerUiRoutes(app)
  registerOmssAlignments(app, manager)

  return {
    server,
    app,
    manager,
    start: () => server.start(),
    stop: () => server.stop(),
  }
}

function registerOmssAlignments(app: FastifyInstance, manager: ProviderPluginManager): void {
  app.post(
    '/v1/refresh/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params
      const injected = await app.inject({
        method: 'GET',
        url: `/v1/refresh/${encodeURIComponent(id)}`,
      })
      reply.code(injected.statusCode)
      for (const [key, value] of Object.entries(injected.headers)) {
        if (value !== undefined) reply.header(key, value)
      }
      return reply.send(injected.json())
    },
  )

  // Prefer sync returns when possible so reply.sent races are less likely on
  // routes that call reply.send() from async handlers/preHandlers.
  app.addHook('onSend', (request, reply, payload, done) => {
    if (reply.statusCode !== 200 || typeof payload !== 'string') {
      done(null, payload)
      return
    }

    const path = request.url.split('?')[0]
    const isHome = path === '/' || path === '/v1' || path === '/v1/' || path === '/v1/health'
    const isSources =
      path.startsWith('/v1/movies/') ||
      (path.startsWith('/v1/tv/') && path.includes('/episodes/'))

    if (!isHome && !isSources) {
      done(null, payload)
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(payload) as Record<string, unknown>
    } catch {
      done(null, payload)
      return
    }

    if (isHome) {
      const providers = manager
        .list()
        .filter((p) => p.enabled)
        .map((p) => ({
          id: p.id,
          name: p.name,
          capabilities: p.capabilities,
        }))

      body.media = body.media ?? { movies: '*', tv: '*' }
      body.providers = providers

      if (body.status === 'offline' || body.status === 'maintenance') {
        body.status = 'down'
      }

      const endpoints = (body.endpoints ?? {}) as Record<string, string>
      endpoints.movie = endpoints.movie ?? '/v1/movies/{id}'
      endpoints.tv = endpoints.tv ?? '/v1/tv/{id}/seasons/{s}/episodes/{e}'
      body.endpoints = endpoints
    }

    if (isSources && typeof body.responseId === 'string' && body.id === undefined) {
      body.id = body.responseId
    }

    if (!isSources) {
      done(null, JSON.stringify(body))
      return
    }

    const sources = Array.isArray(body.sources) ? body.sources : []
    if (!sources.length) {
      done(null, JSON.stringify(body))
      return
    }

    const origin = `${request.protocol}://${request.headers.host || 'localhost'}`
    filterPlayableSources(
      sources,
      origin,
      Number(process.env.SOURCE_PROBE_TIMEOUT_MS ?? 12_000),
      Number(process.env.SOURCE_PROBE_CACHE_TTL_MS ?? 180_000),
    )
      .then((filtered) => {
        body.sources = filtered.sources
        if (filtered.removed > 0) {
          body.diagnostics = addPlayableFilterDiagnostic(
            Array.isArray(body.diagnostics) ? body.diagnostics : [],
            filtered.removed,
            'UNPLAYABLE_SOURCE_FILTERED',
            'Filtered',
          )
        }
        done(null, JSON.stringify(body))
      })
      .catch(() => {
        done(null, payload)
      })
  })
}
