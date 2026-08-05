import { webcrypto } from 'node:crypto'
import type { PeachifyApiResponse } from './types.js'

const { subtle } = webcrypto

/**
 * AES-GCM key extracted from peachify.top player bundle (hex, 32 bytes).
 * Passed as the second arg to their decrypt helper: dD(payload, keyHex)
 */
const DEFAULT_KEY_HEX =
  process.env.PEACHIFY_AES_KEY_HEX ??
  'a8f2a1b5e9c470814f6b2c3a5d8e7f9c1a2b3c4d5e3f7a8b8cad1e2d0a4d5c5d'

type EncryptedPayload = {
  iv: Uint8Array
  ciphertext: Uint8Array
  authTag: Uint8Array
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return new Uint8Array(Buffer.from(padded, 'base64'))
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  }
  return bytes
}

async function importDecryptionKey(keyHex: string): Promise<webcrypto.CryptoKey> {
  return subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
}

function parsePayload(payload: string): EncryptedPayload {
  const parts = payload.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid payload format. Expected: iv.ciphertext.authTag')
  }
  const [ivPart, ciphertextPart, authTagPart] = parts
  return {
    iv: base64UrlToBytes(ivPart),
    ciphertext: base64UrlToBytes(ciphertextPart),
    authTag: base64UrlToBytes(authTagPart),
  }
}

/**
 * Decrypt Peachify `data` field: base64url(iv).base64url(ciphertext).base64url(authTag)
 */
export async function decryptPeachifyPayload(
  payload: string,
  keyHex: string = DEFAULT_KEY_HEX,
): Promise<PeachifyApiResponse | null> {
  try {
    const { iv, ciphertext, authTag } = parsePayload(payload)
    const encryptedData = new Uint8Array(ciphertext.length + authTag.length)
    encryptedData.set(ciphertext)
    encryptedData.set(authTag, ciphertext.length)

    const key = await importDecryptionKey(keyHex)
    // Copy into plain ArrayBuffers — Node subtle can be picky about Buffer views.
    const ivCopy = new Uint8Array(iv)
    const dataCopy = new Uint8Array(encryptedData)
    const decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: ivCopy },
      key,
      dataCopy,
    )
    const decryptedJson = new TextDecoder().decode(decryptedBuffer)
    return JSON.parse(decryptedJson) as PeachifyApiResponse
  } catch {
    return null
  }
}
