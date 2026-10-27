import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useStore, actions } from '../lib/store'
import { hashPin, newSalt, verifyFaceId, faceIdAvailable, registerFaceId, haptic, isIOS, isStandalone } from '../lib/device'

const PIN_LEN = 6
type Err = { text: string; n: number }
let errN = 0
const err = (text: string): Err => ({ text, n: ++errN })

function PinPad({ onDone, title, sub, error, extra }: { onDone: (pin: string) => void; title: string; sub?: string; error?: Err; extra?: React.ReactNode }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  useEffect(() => {
    if (!error) return
    setShake(true)
    setPin('')
    haptic('warning')
    const t = setTimeout(() => setShake(false), 420)
    return () => clearTimeout(t)
  }, [error?.n])

  const press = (d: string) => {
    if (pin.length >= PIN_LEN) return
    haptic('light')
    const next = pin + d
    setPin(next)
    if (next.length === PIN_LEN) setTimeout(() => { onDone(next); setPin('') }, 120)
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
      <div className={`pin-dots ${shake ? 'shake' : ''}`} aria-label={`${pin.length} von ${PIN_LEN} Ziffern eingegeben`} role="status">
        {Array.from({ length: PIN_LEN }, (_, i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <p style={{ minHeight: 20, color: 'var(--danger)', fontSize: 15 }} role="alert">{error?.text ?? ''}</p>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>{d}</button>
        ))}
        <span>{extra}</span>
        <button className="key" onClick={() => press('0')}>0</button>
        <button className="key plain" aria-label="Löschen" onClick={() => setPin((p) => p.slice(0, -1))}>
          <Icon name="back" />
        </button>
      </div>
    </>
  )
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const settings = useStore((s) => s.settings)
  const [error, setError] = useState<Err>()
  const [blockedUntil, setBlockedUntil] = useState(0)
  const fails = useRef(0)
  const tried = useRef(false)

  const tryFace = async () => {
    if (!settings.faceIdCredential) return
    if (await verifyFaceId(settings.faceIdCredential)) {
      haptic('success')
      onUnlock()
    }
  }

  useEffect(() => {
    if (!tried.current && settings.faceIdCredential) {
      tried.current = true
      tryFace()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const check = async (pin: string) => {
    if (Date.now() < blockedUntil) {
      setError(err(`Bitte ${Math.ceil((blockedUntil - Date.now()) / 1000)} Sekunden warten.`))
      return
    }
    if (!settings.pinSalt || !settings.pinHash) return onUnlock()
    const h = await hashPin(pin, settings.pinSalt)
    if (h === settings.pinHash) {
      haptic('success')
      fails.current = 0
      onUnlock()
    } else {
      fails.current++
      if (fails.current >= 5) {
        setBlockedUntil(Date.now() + 30_000)
        fails.current = 0
        setError(err('Zu viele Versuche. 30 Sekunden gesperrt.'))
      } else setError(err(`Falscher Code (${fails.current}/5)`))
    }
  }

  return (
    <div className="lock" role="dialog" aria-label="App gesperrt">
      <BrandMark />
      <PinPad
        title="Zeiten entsperren"
        error={error}
        onDone={check}
        extra={
          settings.faceIdCredential ? (
            <button className="key plain" aria-label="Mit Face ID entsperren" onClick={tryFace}>
              <Icon name="faceid" />
            </button>
          ) : null
        }
      />
    </div>
  )
}

export function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden>
      <svg viewBox="0 0 64 64" width="44" height="44">
        <circle cx="32" cy="32" r="21" fill="none" stroke="#F3F1E8" strokeWidth="5" />
        <path d="M32 32V17" stroke="#E9FF27" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="32" r="4" fill="#E9FF27" />
      </svg>
    </div>
  )
}

/** PIN festlegen (zweimal eingeben), danach optional Face ID */
export function PinSetup({ onDone, onCancel, intro }: { onDone: () => void; onCancel?: () => void; intro?: boolean }) {
  const [first, setFirst] = useState<string | null>(null)
  const [error, setError] = useState<Err>()
  const [faceStep, setFaceStep] = useState(false)
  const [faceErr, setFaceErr] = useState<string>()

  const done = async (pin: string) => {
    if (!first) {
      setFirst(pin)
      setError(undefined)
      return
    }
    if (pin !== first) {
      setFirst(null)
      setError(err('Die Codes stimmen nicht überein. Bitte neu festlegen.'))
      return
    }
    const salt = newSalt()
    actions.updateSettings({ pinSalt: salt, pinHash: await hashPin(pin, salt), lockEnabled: true })
    haptic('success')
    if (await faceIdAvailable()) setFaceStep(true)
    else onDone()
  }

  if (faceStep) {
    return (
      <div className="lock" role="dialog" aria-label="Face ID einrichten">
        <div style={{ width: 72, height: 72, display: 'grid', placeItems: 'center' }}>
          <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8.5 9v1.5M15.5 9v1.5M12 9v4h-1M9 16a4.5 4.5 0 0 0 6 0" />
          </svg>
        </div>
        <h1>Mit Face ID entsperren?</h1>
        <p>Das iPhone fragt, ob ein Passkey für diese App gesichert werden soll. Bestätige das, dann reicht künftig ein Blick.</p>
        {faceErr && <p style={{ color: 'var(--danger)' }}>{faceErr}</p>}
        <button
          className="btn lime"
          style={{ minWidth: 240 }}
          onClick={async () => {
            try {
              const id = await registerFaceId()
              actions.updateSettings({ faceIdCredential: id })
              haptic('success')
              onDone()
            } catch (e) {
              setFaceErr('Face ID konnte nicht eingerichtet werden. Du kannst es später in den Einstellungen erneut versuchen.')
              console.warn(e)
            }
          }}
        >
          Face ID verwenden
        </button>
        <button className="link-btn" onClick={onDone}>Nur PIN verwenden</button>
      </div>
    )
  }

  return (
    <div className="lock" role="dialog" aria-label="Code festlegen">
      <PinPad
        title={first ? 'Code wiederholen' : intro ? 'Code für die App festlegen' : 'Neuen Code festlegen'}
        sub={first ? undefined : '6 Ziffern. Er schützt die App, falls jemand dein entsperrtes iPhone in der Hand hat.'}
        error={error}
        onDone={done}
        extra={onCancel ? <button className="key plain" onClick={onCancel}>Abbr.</button> : null}
      />
    </div>
  )
}

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [pinStep, setPinStep] = useState(false)
  const needsInstall = isIOS() && !isStandalone()
  if (pinStep) return <PinSetup intro onDone={() => { actions.updateSettings({ onboarded: true }); onFinish() }} />
  return (
    <div className="lock onboard">
      <div className="onboard-inner">
        <BrandMark />
        <h1>Arbeitszeiten für Corelegal</h1>
        <p>Timer starten, Akte und Tätigkeit festhalten, am Monatsende als Excel abgeben.</p>
        <div className="onboard-step">
          <Icon name="lock" />
          <div>
            <b>Nur auf diesem iPhone</b>
            <span>Deine Einträge werden lokal gespeichert, nicht auf einem Server. Sichere ab und zu ein Backup in den Einstellungen.</span>
          </div>
        </div>
        {needsInstall && (
          <div className="onboard-step">
            <Icon name="home" />
            <div>
              <b>Erst zum Home-Bildschirm hinzufügen</b>
              <span>Teilen, dann „Zum Home-Bildschirm“, und die App von dort öffnen. Safari und Home-Bildschirm haben getrennte Speicher.</span>
            </div>
          </div>
        )}
        <div className="onboard-step">
          <Icon name="doc" />
          <div>
            <b>Keine Mandantennamen</b>
            <span>Im Feld Akte nur das interne Aktenzeichen, Beschreibungen neutral halten.</span>
          </div>
        </div>
        <button className="btn lime block" style={{ marginTop: 6 }} onClick={() => setPinStep(true)}>
          Code festlegen
        </button>
        <button className="link-btn" style={{ alignSelf: 'center' }} onClick={() => { actions.updateSettings({ onboarded: true }); onFinish() }}>
          Ohne Sperre fortfahren
        </button>
      </div>
    </div>
  )
}
