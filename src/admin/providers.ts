import type { FastifyInstance } from 'fastify'
import type { ProviderPluginManager } from '../plugins/manager.js'

/**
 * Server-management routes only — not part of the OMSS protocol.
 */
export function registerAdminProviderRoutes(
  app: FastifyInstance,
  manager: ProviderPluginManager,
): void {
  app.get('/admin/providers', async () => ({
    providers: manager.list(),
  }))

  app.get('/admin/providers/health', async () => ({
    health: await manager.health(),
  }))

  app.post<{ Params: { id: string } }>('/admin/providers/:id/enable', async (request, reply) => {
    const ok = manager.enable(request.params.id)
    if (!ok) {
      return reply.code(404).send({
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: `Provider '${request.params.id}' not found`,
        },
      })
    }
    return { id: request.params.id, enabled: true }
  })

  app.post<{ Params: { id: string } }>('/admin/providers/:id/disable', async (request, reply) => {
    const ok = manager.disable(request.params.id)
    if (!ok) {
      return reply.code(404).send({
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: `Provider '${request.params.id}' not found`,
        },
      })
    }
    return { id: request.params.id, enabled: false }
  })

  app.post('/admin/providers/reload', async () => {
    await manager.reload()
    return { reloaded: true, providers: manager.list() }
  })
}
