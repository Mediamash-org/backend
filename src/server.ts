import 'dotenv/config'
import { createOmssHost } from './create-host.js'

async function main() {
  const host = await createOmssHost()
  await host.start()
}

main().catch((error) => {
  console.error('[omss-server] Failed to start:', error)
  process.exit(1)
})
