import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { SwipeRow, showToast, useNow } from '../components/ui'
import { actions, useStore } from '../lib/store'
import { type Entry, todayKey, fmtDayLong, netMinutes, fmtDur, toMin, span, sessionWorkMs, isoWeek, addDays } from '../lib/time'
import { weekMinutes } from '../lib/stats'
import { isIOS, isStandalone } from '../lib/device'

export function EntryRow({ e, onEdit }: { e: Entry; onEdit: (e: Entry) => void }) {
  const del = () => {
    const removed = actions.deleteEntry(e.id)
    if (removed) showToast('Eintrag gelöscht', { label: 'Rückgängig', run: () => actions.restoreEntry(removed) })
  }
  return (
    <SwipeRow onEdit={() => onEdit(e)} onDelete={del} label={`${e.start} bis ${e.end}, ${e.akte || 'ohne Akte'}`}>
      <button className="entry" onClick={() => onEdit(e)}>
        <span className="entry-title">
          {e.akte || <span className="faint">Ohne Akte</span>}
          <span className="tag">{e.category}</span>
        </span>
        <span className="entry-time num">
          {e.start}–{e.end}
          {e.pauses.length > 0 && <span className="faint"> · {e.pauses.length === 1 ? '1 Pause' : `${e.pauses.length} Pausen`}</span>}
        </span>
        <span className="entry-dur num">{fmtDur(netMinutes(e))}</span>
        {e.description && <span className="entry-desc">{e.description}</span>}
      </button>
    </SwipeRow>
  )
}

/** Tagesband 6–22 Uhr (erweitert sich, wenn Einträge außerhalb liegen) */
function Ribbon({ entries, liveStart, now }: { entries: Entry[]; liveStart: number | null; now: number }) {
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  let lo = 7 * 60
  let hi = 20 * 60
  entries.forEach((e) => {
    lo = Math.min(lo, Math.floor(toMin(e.start) / 60) * 60)
    hi = Math.max(hi, Math.ceil((toMin(e.start) + span(e.start, e.end)) / 60) * 60)
  })
  if (liveStart !== null) lo = Math.min(lo, Math.floor(liveStart / 60) * 60)
  hi = Math.min(Math.max(hi, Math.ceil((nowMin + 1) / 60) * 60), 24 * 60)
  const pct = (m: number) => `${((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo)) * 100}%`
  const w = (a: number, b: number) => `${((Math.min(b, hi) - Math.max(a, lo)) / (hi - lo)) * 100}%`
  const hours = (hi - lo) / 60
  const stepH = hours > 15 ? 4 : hours > 8 ? 3 : 2
  const ticks: number[] = []
  for (let h = lo / 60; h <= hi / 60; h += stepH) ticks.push(h * 60)
  if (ticks[ticks.length - 1] !== hi && hi - ticks[ticks.length - 1] >= 90) ticks.push(hi)
  return (
    <div aria-hidden>
      <div className="ribbon">
        {entries.map((e) => {
          const a = toMin(e.start)
          const b = a + span(e.start, e.end)
          return (
            <span key={e.id}>
              <i className="ribbon-block" style={{ left: pct(a), width: w(a, b) }} />
              {e.pauses.map((p) => {
                let pa = toMin(p.start)
                if (pa < a) pa += 1440
                const pb = pa + span(p.start, p.end)
                return <i key={p.id} className="ribbon-pause" style={{ left: pct(pa), width: w(pa, pb) }} />
              })}
            </span>
          )
        })}
        {liveStart !== null && <i className="ribbon-block live" style={{ left: pct(liveStart), width: w(liveStart, nowMin) }} />}
        <i className="ribbon-now" style={{ left: pct(nowMin) }} />
      </div>
      <div className="ribbon-scale num">
        {ticks.map((t, i) => (
          <span key={i} style={{ left: pct(t) }}>{t / 60}</span>
        ))}
      </div>
    </div>
  )
}

export function Today({ onEdit, onNew, onSettings }: { onEdit: (e: Entry) => void; onNew: () => void; onSettings: () => void }) {
  const entries = useStore((s) => s.entries)
  const session = useStore((s) => s.session)
  const limit = useStore((s) => s.settings.weeklyLimit)
  const now = useNow(session ? 15000 : 60000)
  const today = todayKey()
  const list = useMemo(() => entries.filter((e) => e.date === today), [entries, today])
  const [hideInstall, setHideInstall] = useState(() => {
    try {
      return localStorage.getItem('zeiten.hideInstall') === '1'
    } catch {
      return false
    }
  })

  const liveMs = session ? sessionWorkMs(session, now) : 0
  const todayMin = list.reduce((s, e) => s + netMinutes(e), 0) + liveMs / 60000
  const weekMin = weekMinutes(entries, today) + liveMs / 60000
  const liveStart = session ? (() => { const d = new Date(session.startedAt); return d.getHours() * 60 + d.getMinutes() })() : null
  const ratio = limit ? weekMin / (limit * 60) : 0
  const yesterday = entries.filter((e) => e.date === addDays(today, -1))

  return (
    <div className="page">
      <div className="titlebar">
        <h1 className="large-title">Heute</h1>
        <div className="toolbar">
          <button className="icon-btn" aria-label="Eintrag manuell hinzufügen" onClick={onNew}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" aria-label="Einstellungen" onClick={onSettings}>
            <Icon name="gear" />
          </button>
        </div>
      </div>
      <p className="subtitle">{fmtDayLong(today)} · KW {isoWeek(today)}</p>

      {isIOS() && !isStandalone() && !hideInstall && (
        <div className="banner" style={{ marginBottom: 14 }}>
          <Icon name="home" />
          <div>
            <b>Zum Home-Bildschirm hinzufügen</b>
            <div className="muted">Teilen, dann „Zum Home-Bildschirm“. Erst dann läuft die App im Vollbild und deine Daten bleiben dauerhaft gespeichert.</div>
          </div>
          <button className="x" aria-label="Hinweis ausblenden" onClick={() => { setHideInstall(true); try { localStorage.setItem('zeiten.hideInstall', '1') } catch { /* egal */ } }}>
            <Icon name="x" />
          </button>
        </div>
      )}

      <Ribbon entries={list} liveStart={liveStart} now={now} />

      <div className="summary">
        <div className="summary-cell">
          <div className="big num">{fmtDur(todayMin)}</div>
          <div className="lbl">heute gearbeitet</div>
        </div>
        <div className="summary-cell">
          <div className="big num">{fmtDur(weekMin)}</div>
          <div className="lbl">{limit ? `diese Woche von ${limit} h` : 'diese Woche'}</div>
          {limit ? (
            <div className={`meter ${ratio > 1 ? 'over' : ratio > 0.9 ? 'warn' : ''}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Wochenlimit">
              <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
          ) : null}
        </div>
      </div>
      {limit && ratio > 1 && (
        <div className="issue error">
          <Icon name="warn" />
          <span>Du liegst diese Woche {fmtDur(weekMin - limit * 60)} h über deinem Limit von {limit} h.</span>
        </div>
      )}

      <div className="section-head">
        <strong>Einträge</strong>
        {list.length > 0 && <span>{list.length === 1 ? '1 Eintrag' : `${list.length} Einträge`}</span>}
      </div>
      {list.length === 0 ? (
        <div className="group">
          <div className="empty">
            <strong>Noch nichts erfasst</strong>
            Tippe unten auf Start oder trage eine Zeit mit + nachträglich ein.
            {yesterday.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <button
                  className="btn"
                  style={{ minHeight: 44 }}
                  onClick={() => {
                    yesterday.forEach((y) => actions.duplicateEntry(y.id, today))
                    showToast(`${yesterday.length === 1 ? 'Eintrag' : `${yesterday.length} Einträge`} von gestern übernommen`)
                  }}
                >
                  <Icon name="copy" /> Wie gestern
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="group">
          {list.map((e) => (
            <EntryRow key={e.id} e={e} onEdit={onEdit} />
          ))}
        </div>
      )}
      {list.length > 0 && <p className="hint">Nach rechts wischen zum Bearbeiten, nach links zum Löschen.</p>}
    </div>
  )
}
