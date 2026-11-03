import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { useHSwipe } from '../components/ui'
import { EntryRow } from './Today'
import { useStore } from '../lib/store'
import { type Entry, monthKey, todayKey, addMonths, fmtMonth, fmtDayLong, netMinutes, fmtDur, isoWeek, weekStart, monthStart, monthEnd, addDays, parseKey, daysBetween } from '../lib/time'

function heatLevel(min: number) {
  if (min <= 0) return 0
  if (min < 120) return 1
  if (min < 240) return 2
  if (min < 360) return 3
  return 4
}

function MonthCalendar({ ym, byDay, onOpenDay }: { ym: string; byDay: Map<string, number>; onOpenDay: (d: string) => void }) {
  const first = monthStart(ym)
  const gridStart = weekStart(first)
  const end = monthEnd(ym)
  const gridEnd = addDays(weekStart(end), 6)
  const cells = daysBetween(gridStart, gridEnd)
  const today = todayKey()
  return (
    <div className="cal" role="grid" aria-label={`Kalender ${fmtMonth(ym)}`}>
      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => (
        <span key={d} className="cal-wd" aria-hidden>
          {d}
        </span>
      ))}
      {cells.map((d) => {
        const inMonth = monthKey(d) === ym
        const min = byDay.get(d) ?? 0
        if (!inMonth) return <span key={d} className="cal-day out" aria-hidden />
        return (
          <button
            key={d}
            role="gridcell"
            className={`cal-day lvl-${heatLevel(min)} ${d === today ? 'today' : ''}`}
            onClick={() => onOpenDay(d)}
            aria-label={`${fmtDayLong(d)}: ${min ? `${fmtDur(min)} Stunden` : 'keine Einträge'}`}
          >
            <span className="cal-num num">{parseKey(d).getDate()}</span>
            <span className="cal-h num">{min ? fmtDur(min) : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

export function History({ onEdit, onNew, onOpenDay }: { onEdit: (e: Entry) => void; onNew: (date?: string) => void; onOpenDay: (date: string) => void }) {
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
  const byDay = useMemo(() => {
    const m = new Map<string, number>()
    list.forEach((e) => m.set(e.date, (m.get(e.date) ?? 0) + netMinutes(e)))
    return m
  }, [list])

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

      <div {...swipe}>
        <MonthCalendar ym={ym} byDay={byDay} onOpenDay={onOpenDay} />
      </div>
      <p className="hint" style={{ textAlign: 'center' }}>Tippe auf einen Tag für die Tagesübersicht.</p>

      {days.length === 0 ? (
        <div className="group" style={{ marginTop: 18 }}>
          <div className="empty">
            <strong>Keine Einträge in diesem Monat</strong>
            Wische über Monatsleiste oder Kalender, um zu blättern.
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
              <button className="day-head day-link" onClick={() => onOpenDay(day)} aria-label={`Tagesübersicht ${fmtDayLong(day)}`}>
                <b>{fmtDayLong(day)} ›</b>
                <span className="num muted">{fmtDur(sum)} h</span>
              </button>
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
