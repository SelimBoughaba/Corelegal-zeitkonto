import { useState } from 'react'
import { Icon } from './Icon'
import { Sheet, showToast, useNow, TimeField } from './ui'
import { AkteField, CategoryField } from './EntryEditor'
import { actions, useStore } from '../lib/store'
import { type Entry, fmtClock, isPaused, sessionWorkMs, sessionPausedMs, fromMin, toMin, pad } from '../lib/time'
import { haptic } from '../lib/device'

export function useStopFlow(onNeedsDetails: (e: Entry) => void) {
  return () => {
    const res = actions.stopTimer()
    if (!res) return
    haptic('success')
    const { entry, session } = res
    showToast(`Gespeichert: ${entry.start}–${entry.end}`, { label: 'Rückgängig', run: () => actions.resumeSession(session) })
    if (!entry.akte || !entry.description) onNeedsDetails(entry)
  }
}

export function Dock({ onOpen, onStop }: { onOpen: () => void; onStop: () => void }) {
  const session = useStore((s) => s.session)
  const draft = useStore((s) => s.draft)
  const now = useNow(1000, !!session)
  const paused = isPaused(session)

  if (!session) {
    return (
      <div className="dock" aria-label="Timer">
        <button className="dock-main" onClick={onOpen} aria-label="Timer-Details öffnen">
          <span className="dock-time num" style={{ fontSize: 20 }}>Bereit</span>
          <span className="dock-sub muted">{draft.akte ? `${draft.akte}, ${draft.category}` : `${draft.category}, tippen für Details`}</span>
        </button>
        <button
          className="dock-btn start"
          onClick={() => {
            actions.startTimer()
            haptic('medium')
          }}
        >
          <Icon name="play" /> Start
        </button>
      </div>
    )
  }

  const work = sessionWorkMs(session, now)
  const pauseMs = sessionPausedMs(session, now)
  const since = new Date(session.startedAt)
  return (
    <div className={`dock ${paused ? 'paused' : 'running'}`} aria-label="Timer">
      <button className="dock-main" onClick={onOpen} aria-label="Timer-Details öffnen">
        <span className="dock-time num" aria-live="off">
          {fmtClock(work)}
        </span>
        <span className="dock-sub">
          {paused ? (
            <>Pause · {fmtClock(now - session.pauses[session.pauses.length - 1].start)}</>
          ) : (
            <>
              <span className="pulse" />
              seit {pad(since.getHours())}:{pad(since.getMinutes())}
              {session.akte ? ` · ${session.akte}` : ''}
              {pauseMs > 0 ? ` · Pause ${Math.round(pauseMs / 60000)} min` : ''}
            </>
          )}
        </span>
      </button>
      <button
        className="dock-btn"
        aria-label={paused ? 'Weiter' : 'Pause'}
        onClick={() => {
          actions.togglePause()
          haptic('light')
        }}
      >
        <Icon name={paused ? 'play' : 'pause'} />
      </button>
      <button className="dock-btn stop" aria-label="Stopp und speichern" onClick={onStop}>
        <Icon name="stop" />
      </button>
    </div>
  )
}

export function TimerSheet({ open, onClose, onStop }: { open: boolean; onClose: () => void; onStop: () => void }) {
  const session = useStore((s) => s.session)
  const draft = useStore((s) => s.draft)
  const round = useStore((s) => s.settings.roundTimer)
  const now = useNow(1000, open && !!session)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const src = session ?? draft
  const set = (p: { akte?: string; category?: string; description?: string }) => (session ? actions.updateSession(p) : actions.updateDraft(p))
  const paused = isPaused(session)

  const startHHMM = session ? (() => { const d = new Date(session.startedAt); return `${pad(d.getHours())}:${pad(d.getMinutes())}` })() : ''
  const setStart = (v: string) => {
    if (!session) return
    const d = new Date(session.startedAt)
    const cand = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(toMin(v) / 60), toMin(v) % 60).getTime()
    if (cand > Date.now()) return
    actions.updateSession({ startedAt: cand })
  }

  return (
    <Sheet open={open} onClose={onClose} title={session ? (paused ? 'Pause' : 'Läuft') : 'Nächste Tätigkeit'} right={<button className="link-btn primary" onClick={onClose}>Fertig</button>} left={<span />}>
      {session ? (
        <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
          <div className="num" style={{ fontSize: 56, fontWeight: 650, lineHeight: 1 }}>{fmtClock(sessionWorkMs(session, now))}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 15 }}>
            Pausen gesamt {fmtClock(sessionPausedMs(session, now))}
            {round ? ' · wird auf 15 Min. gerundet' : ''}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className={`btn block ${paused ? 'lime' : ''}`} onClick={() => { actions.togglePause(); haptic('light') }}>
              <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Weiter' : 'Pause'}
            </button>
            <button className="btn primary block" onClick={() => { onClose(); setTimeout(onStop, 320) }}>
              <Icon name="stop" /> Stopp
            </button>
          </div>
          <div style={{ marginTop: 18, textAlign: 'left' }}>
            <div className="cap faint" style={{ fontSize: 12, margin: '0 4px 4px' }}>Beginn korrigieren</div>
            <TimeField label="Beginn" value={startHHMM} onChange={setStart} />
          </div>
        </div>
      ) : (
        <p className="muted" style={{ margin: '4px 4px 0' }}>Lege Akte und Kategorie schon vor dem Start fest. Du kannst alles auch später ergänzen.</p>
      )}

      <AkteField value={src.akte} onChange={(v) => set({ akte: v })} />
      <CategoryField value={src.category} onChange={(v) => set({ category: v })} />
      <label className="form-label" htmlFor="tdesc">Tätigkeitsbeschreibung</label>
      <textarea id="tdesc" className="field" value={src.description} onChange={(e) => set({ description: e.target.value })} placeholder="Was machst du gerade?" />

      {!session && (
        <button className="btn lime block" style={{ marginTop: 22 }} onClick={() => { actions.startTimer(); haptic('medium'); onClose() }}>
          <Icon name="play" /> Timer starten
        </button>
      )}

      {session && (
        <>
          {session.pauses.length > 0 && (
            <>
              <span className="form-label">Pausen dieser Sitzung</span>
              <div className="group">
                {session.pauses.map((p, i) => {
                  const a = new Date(p.start)
                  const b = p.end ? new Date(p.end) : null
                  return (
                    <div className="row" key={i}>
                      <span className="row-label num">
                        {pad(a.getHours())}:{pad(a.getMinutes())} – {b ? `${pad(b.getHours())}:${pad(b.getMinutes())}` : 'läuft'}
                      </span>
                      <span className="row-value num">{Math.round(((p.end ?? now) - p.start) / 60000)} min</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {!confirmDiscard ? (
            <button className="btn danger block" style={{ marginTop: 18 }} onClick={() => setConfirmDiscard(true)}>
              Timer verwerfen
            </button>
          ) : (
            <div className="issue error" style={{ flexDirection: 'column', marginTop: 18 }}>
              <span>Die laufende Zeit wird nicht gespeichert.</span>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button className="btn block" style={{ minHeight: 44 }} onClick={() => setConfirmDiscard(false)}>Abbrechen</button>
                <button
                  className="btn block"
                  style={{ minHeight: 44, background: 'var(--danger)', color: 'var(--on-danger)' }}
                  onClick={() => {
                    const s = session
                    actions.discardTimer()
                    setConfirmDiscard(false)
                    onClose()
                    showToast('Timer verworfen', { label: 'Rückgängig', run: () => actions.resumeSession(s) })
                  }}
                >
                  Verwerfen
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

export { fromMin }
