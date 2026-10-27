import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { useHSwipe } from '../components/ui'
import { EntryRow } from './Today'
import { useStore } from '../lib/store'
import { type Entry, monthKey, todayKey, addMonths, fmtMonth, fmtDayLong, netMinutes, fmtDur, isoWeek, weekStart } from '../lib/time'

export function History({ onEdit, onNew }: { onEdit: (e: Entry) => void; onNew: (date?: string) => void }) {
  const entries = useStore((s) => s.entries)
  const [ym, setYm] = useState(monthKey(todayKey()))
  const [dir, setDir] = useState<'l' | 'r' | ''>('')
  const go = (n: number) => {
    setDir(n > 0 ? 'l' : 'r')
    setYm((m) => addMonths(m, n))
  }
  const swipe = useHSwipe(() => go(1), () => go(-1))

  const list = useMemo(() => entries.filter((e) => monthKey(e.date) === ym), [entries, ym])
  const days = useMemo(() => {
    const m = new Map<string, Entry[]>()
    list.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]))
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [list])
  const total = list.reduce((s, e) => s + netMinutes(e), 0)

  return (
    <div className="page">
      <div className="titlebar">
        <h1 className="large-title">Verlauf</h1>
        <div className="toolbar">
          <button className="icon-btn" aria-label="Eintrag hinzufügen" onClick={() => onNew()}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      <div className="pager" {...swipe}>
        <button className="icon-btn" aria-label="Vorheriger Monat" onClick={() => go(-1)}>
          <Icon name="left" />
        </button>
        <div className={`pager-label ${dir ? `slide-${dir}` : ''}`} key={ym} aria-live="polite">
          <b>{fmtMonth(ym)}</b>
          <span className="num">
            {fmtDur(total)} h an {days.length} {days.length === 1 ? 'Tag' : 'Tagen'}
          </span>
        </div>
        <button className="icon-btn" aria-label="Nächster Monat" onClick={() => go(1)}>
          <Icon name="right" />
        </button>
      </div>
      {ym !== monthKey(todayKey()) && (
        <div style={{ textAlign: 'center' }}>
          <button className="link-btn" onClick={() => { setDir(ym < monthKey(todayKey()) ? 'l' : 'r'); setYm(monthKey(todayKey())) }}>
            Zum aktuellen Monat
          </button>
        </div>
      )}

      {days.length === 0 ? (
        <div className="group" style={{ marginTop: 18 }}>
          <div className="empty">
            <strong>Keine Einträge in diesem Monat</strong>
            Wische über die Monatsleiste, um zu blättern.
          </div>
        </div>
      ) : (
        days.map(([day, items], i) => {
          const sum = items.reduce((s, e) => s + netMinutes(e), 0)
          const newWeek = i === 0 || weekStart(days[i - 1][0]) !== weekStart(day)
          return (
            <section key={day} aria-label={fmtDayLong(day)}>
              {newWeek && (
                <div className="faint" style={{ fontSize: 12, fontWeight: 600, margin: '22px 4px -12px' }}>
                  KW {isoWeek(day)}
                </div>
              )}
              <div className="day-head">
                <b>{fmtDayLong(day)}</b>
                <span className="num muted">{fmtDur(sum)} h</span>
              </div>
              <div className="group">
                {items.map((e) => (
                  <EntryRow key={e.id} e={e} onEdit={onEdit} />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
