import 'dotenv/config'
import { createOmssHost } from './create-host.js'

function isNonFatalHttpRace(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as NodeJS.ErrnoException
  return err.code === 'ERR_HTTP_HEADERS_SENT' || err.code === 'ERR_STREAM_PREMATURE_CLOSE'
}

/** Keep the process alive for known proxy/client-abort races; still exit on real bugs. */
function installProcessGuards(): void {
  process.on('uncaughtException', (error) => {
    if (isNonFatalHttpRace(error)) {
      console.error('[omss-server] Non-fatal HTTP race (continuing):', error.message)
      return
    }
    console.error('[omss-server] Uncaught exception:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason) => {
    if (isNonFatalHttpRace(reason)) {
      const message = reason instanceof Error ? reason.message : String(reason)
      console.error('[omss-server] Non-fatal HTTP rejection (continuing):', message)
      return
    }
    console.error('[omss-server] Unhandled rejection:', reason)
  })
}

async function main() {
  installProcessGuards()
  const host = await createOmssHost()
  await host.start()
}

main().catch((error) => {
  console.error('[omss-server] Failed to start:', error)
  process.exit(1)
})
