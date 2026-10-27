// Haptik, Teilen, Sperre (PIN + Face ID über WebAuthn)

// ---------- Haptik ----------
// iOS Safari kennt navigator.vibrate nicht. Seit iOS 18 löst das Umschalten eines
// <input type="checkbox" switch> ein kurzes haptisches Feedback aus; das nutzen wir.
let hapticLabel: HTMLLabelElement | null = null
export function haptic(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'light' ? 8 : kind === 'medium' ? 14 : [10, 40, 10])
      return
    }
    if (!hapticLabel) {
      hapticLabel = document.createElement('label')
      hapticLabel.setAttribute('aria-hidden', 'true')
      hapticLabel.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.setAttribute('switch', '')
      input.tabIndex = -1
      hapticLabel.appendChild(input)
      document.body.appendChild(hapticLabel)
    }
    hapticLabel.click()
    if (kind === 'success' || kind === 'warning') setTimeout(() => hapticLabel?.click(), 90)
  } catch {
    /* ohne Haptik weiter */
  }
}

// ---------- Teilen / Speichern ----------
export async function shareFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIOS = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    /* nicht unterstützt */
  }
}

// ---------- PIN ----------
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function newSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 210_000 }, key, 256)
  return b64(bits)
}

// ---------- Face ID (WebAuthn, Plattform-Authenticator) ----------
export async function faceIdAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export async function registerFaceId(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Corelegal Zeiten', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Zeiten', displayName: 'Corelegal Zeiten' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Face ID wurde nicht eingerichtet.')
  return b64(cred.rawId)
}

export async function verifyFaceId(credentialId: string): Promise<boolean> {
  try {
    const res = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
        rpId: location.hostname,
      },
    })
    return !!res
  } catch {
    return false
  }
}
