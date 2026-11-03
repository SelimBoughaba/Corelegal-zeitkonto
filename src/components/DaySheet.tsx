import { useMemo, useState } from 'react'
import { Sheet, showToast, useHSwipe, useNow } from './ui'
import { Icon } from './Icon'
import { EntryRow, Ribbon } from '../views/Today'
import { useStore, getState } from '../lib/store'
import { type Entry, addDays, fmtDayLong, fmtDur, netMinutes, pauseMinutes, parseKey, toMin, span, fromMin, todayKey, isoWeek, sortEntries } from '../lib/time'
import { categoryColor } from '../lib/theme'
import { exportExcel } from '../lib/excel'
import { shareFile, haptic } from '../lib/device'

function groupMinutes(list: Entry[], key: (e: Entry) => string, empty: string) {
  const m = new Map<string, number>()
  for (const e of list) {
    const k = key(e) || empty
    m.set(k, (m.get(k) ?? 0) + netMinutes(e))
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, min]) => ({ label, min }))
}

/** Tagesübersicht: Zeitstrahl, alle Einträge, Verteilung nach Akte und Tätigkeit. Wischen über den Kopf wechselt den Tag. */
export function DaySheet({ date, onClose, onEdit, onNew }: { date: string | null; onClose: () => void; onEdit: (e: Entry) => void; onNew: (date: string) => void }) {
  const [day, setDay] = useState(date)
  const [dir, setDir] = useState<'l' | 'r' | ''>('')
  const [shown, setShown] = useState(date)
  if (date !== shown) {
    setShown(date)
    setDay(date)
    setDir('')
  }
  const entries = useStore((s) => s.entries)
  const categories = useStore((s) => s.settings.categories)
  const now = useNow(60000, !!day && day === todayKey())

  const go = (n: number) => {
    if (!day) return
    setDir(n > 0 ? 'l' : 'r')
    setDay(addDays(day, n))
  }
  const swipe = useHSwipe(() => go(1), () => go(-1))

  const list = useMemo(() => (day ? sortEntries(entries.filter((e) => e.date === day)) : []), [entries, day])
  const net = list.reduce((s, e) => s + netMinutes(e), 0)
  const pause = list.reduce((s, e) => s + pauseMinutes(e), 0)
  const first = list.length ? Math.min(...list.map((e) => toMin(e.start))) : null
  const last = list.length ? Math.max(...list.map((e) => toMin(e.start) + span(e.start, e.end))) : null
  const akten = useMemo(() => groupMinutes(list, (e) => e.akte, 'Ohne Akte'), [list])
  const cats = useMemo(() => groupMinutes(list, (e) => e.category, 'Ohne Tätigkeit'), [list])

  if (!date || !day) return null
  const year = parseKey(day).getFullYear()

  const exportDay = async () => {
    try {
      const { blob, filename } = await exportExcel(getState().entries, { from: day, to: day, label: fmtDayLong(day), fileTag: day, simple: true }, getState().settings.name)
      const r = await shareFile(blob, filename)
      if (r !== 'cancelled') {
        haptic('success')
        showToast(r === 'shared' ? 'Excel-Datei bereit' : 'Excel-Datei heruntergeladen')
      }
    } catch (e) {
      showToast(`Export fehlgeschlagen: ${(e as Error).message}`)
    }
  }

  return (
    <Sheet
      open={!!date}
      onClose={onClose}
      title="Tagesübersicht"
      right={
        <button className="link-btn primary" onClick={() => onNew(day)} aria-label="Eintrag für diesen Tag hinzufügen">
          Eintrag +
        </button>
      }
    >
      <div className="pager" {...swipe} style={{ marginTop: 0 }}>
        <button className="icon-btn" aria-label="Vorheriger Tag" onClick={() => go(-1)}>
          <Icon name="left" />
        </button>
        <div className={`pager-label ${dir ? `slide-${dir}` : ''}`} key={day} aria-live="polite">
          <b>{fmtDayLong(day)}</b>
          <span className="num">
            {year} · KW {isoWeek(day)}
          </span>
        </div>
        <button className="icon-btn" aria-label="Nächster Tag" onClick={() => go(1)}>
          <Icon name="right" />
        </button>
      </div>

      {list.length === 0 ? (
        <div className="group" style={{ marginTop: 14 }}>
          <div className="empty">
            <strong>Keine Einträge an diesem Tag</strong>
            <div style={{ marginTop: 14 }}>
              <button className="btn" style={{ minHeight: 44 }} onClick={() => onNew(day)}>
                <Icon name="plus" /> Eintrag hinzufügen
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="day-kpis">
            <div>
              <b className="num">{fmtDur(net)}</b>
              <span>Arbeitszeit</span>
            </div>
            <div>
              <b className="num">
                {fromMin(first!)}–{fromMin(last!)}
              </b>
              <span>von–bis</span>
            </div>
            <div>
              <b className="num">{fmtDur(pause)}</b>
              <span>Pausen</span>
            </div>
            <div>
              <b className="num">{list.length}</b>
              <span>{list.length === 1 ? 'Eintrag' : 'Einträge'}</span>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <Ribbon entries={list} liveStart={null} now={now} showNow={day === todayKey()} />
          </div>

          <span className="form-label">Einträge</span>
          <div className="group">
            {list.map((e) => (
              <EntryRow key={e.id} e={e} onEdit={onEdit} />
            ))}
          </div>

          <span className="form-label">Nach Akte</span>
          <div className="group" style={{ padding: 16 }}>
            <div className="hbars">
              {akten.map((a) => (
                <div key={a.label}>
                  <div className="hbar-top">
                    <span>{a.label}</span>
                    <span className="num muted">
                      {fmtDur(a.min)} h · {net ? Math.round((a.min / net) * 100) : 0} %
                    </span>
                  </div>
                  <div className="hbar-track">
                    <i style={{ width: `${(a.min / akten[0].min) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <span className="form-label">Nach Tätigkeit</span>
          <div className="group" style={{ padding: 16 }}>
            <div className="stacked" role="img" aria-label={cats.map((c) => `${c.label} ${fmtDur(c.min)} Stunden`).join(', ')}>
              {cats.map((c) => (
                <i key={c.label} style={{ width: `${net ? (c.min / net) * 100 : 0}%`, background: categoryColor(categories, c.label) }} />
              ))}
            </div>
            <div className="cat-list">
              {cats.map((c) => (
                <div key={c.label}>
                  <i style={{ background: categoryColor(categories, c.label) }} />
                  <span>{c.label}</span>
                  <span className="num">
                    {fmtDur(c.min)} h · {net ? Math.round((c.min / net) * 100) : 0} %
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button className="btn block" style={{ marginTop: 18 }} onClick={exportDay}>
            <Icon name="share" /> Diesen Tag als Excel exportieren
          </button>
          <p className="hint">Nach links oder rechts über das Datum wischen, um den Tag zu wechseln.</p>
        </>
      )}
    </Sheet>
  )
}
