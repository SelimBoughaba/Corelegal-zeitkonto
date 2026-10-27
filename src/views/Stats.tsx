import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { activityGrid, averages, weekCompare, monthSeries, groupBy, inRange, streak } from '../lib/stats'
import { fmtDur, fromMin, todayKey, weekdayShort, MONTHS, monthKey, monthStart, monthEnd, fmtMonth, fmtDate, parseKey } from '../lib/time'
import { haptic } from '../lib/device'

// Kategorienfarben in fester Reihenfolge (nie nach Rang)
const CAT_COLORS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']

type Card = { id: string; title: string; scope: string; body: ReactNode }

function heatLevel(min: number) {
  if (min <= 0) return 0
  if (min < 120) return 1
  if (min < 240) return 2
  if (min < 360) return 3
  return 4
}

function Bars({ data, selected, onSelect, label }: { data: { key: string; label: string; v: number; ghost?: number; hl?: boolean }[]; selected: string; onSelect: (k: string) => void; label: string }) {
  const max = Math.max(60, ...data.map((d) => Math.max(d.v, d.ghost ?? 0)))
  return (
    <>
      <div className="bars" role="list" aria-label={label}>
        {data.map((d) => (
          <button
            key={d.key}
            role="listitem"
            className={`bar-col ${d.key === selected ? 'sel' : ''}`}
            onClick={() => { onSelect(d.key); haptic('light') }}
            aria-label={`${d.label}: ${fmtDur(d.v)} Stunden${d.ghost !== undefined ? `, Vorwoche ${fmtDur(d.ghost)}` : ''}`}
          >
            <span className="val num">{d.key === selected ? fmtDur(d.v) : ''}</span>
            <span className="bar-pair">
              {d.ghost !== undefined && <i className="bar ghost" style={{ height: `${(d.ghost / max) * 100}%` }} />}
              <i className={`bar ${d.hl ? 'hl' : ''}`} style={{ height: `${(d.v / max) * 100}%` }} />
            </span>
            <span className="lbl">{d.label}</span>
          </button>
        ))}
      </div>
      <div className="baseline" />
    </>
  )
}

export function Stats() {
  const entries = useStore((s) => s.entries)
  const catOrder = useStore((s) => s.settings.categories)
  const catColor = (label: string) => {
    const i = catOrder.indexOf(label)
    return i >= 0 && i < CAT_COLORS.length ? CAT_COLORS[i] : 'var(--urban)'
  }
  const today = todayKey()
  const ym = monthKey(today)
  const [selWeek, setSelWeek] = useState(today)
  const [selMonth, setSelMonth] = useState(ym)
  const [selCell, setSelCell] = useState<string | null>(null)

  const grid = useMemo(() => activityGrid(entries, 17, today), [entries, today])
  const avg = useMemo(() => averages(entries, today), [entries, today])
  const week = useMemo(() => weekCompare(entries, today), [entries, today])
  const months = useMemo(() => monthSeries(entries, 6, today), [entries, today])
  const monthEntries = useMemo(() => inRange(entries, monthStart(ym), monthEnd(ym)), [entries, ym])
  const akten = useMemo(() => groupBy(monthEntries, (e) => e.akte, 5, 'Ohne Akte'), [monthEntries])
  const cats = useMemo(() => groupBy(monthEntries, (e) => e.category, 5), [monthEntries])
  const st = useMemo(() => streak(entries, today), [entries, today])

  const empty = entries.length === 0
  const Empty = () => (
    <div className="empty" style={{ margin: 'auto' }}>
      <strong>Noch keine Daten</strong>
      Sobald du Zeiten erfasst, erscheint hier deine Auswertung.
    </div>
  )

  const cellInfo = selCell ? grid.cols.flat().find((c) => c.key === selCell) : null
  const weekNow = week.reduce((s, d) => s + d.now, 0)
  const weekBefore = week.reduce((s, d) => s + d.before, 0)
  const monthTotal = cats.reduce((s, c) => s + c.min, 0)

  const cards: Card[] = [
    {
      id: 'activity',
      title: 'Aktivität',
      scope: 'Letzte 17 Wochen',
      body: (
        <>
          <div className="heat-wrap">
            <div className="heat-days" aria-hidden>
              {['Mo', '', 'Mi', '', 'Fr', '', 'So'].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="heat" role="grid" aria-label="Arbeitsstunden pro Tag">
              {grid.cols.flat().map((c) => (
                <i
                  key={c.key}
                  role="gridcell"
                  aria-label={`${fmtDate(c.key)}: ${fmtDur(c.min)} Stunden`}
                  className={`${c.future ? 'future' : ''} ${c.key === today ? 'today' : ''}`}
                  style={!c.future ? { background: `var(--heat-${heatLevel(c.min)})` } : undefined}
                  onClick={() => { if (!c.future) { setSelCell(c.key); haptic('light') } }}
                />
              ))}
            </div>
          </div>
          <div className="legend">
            <span style={{ marginRight: 'auto' }} className="num">
              {cellInfo ? `${weekdayShort(cellInfo.key)}, ${fmtDate(cellInfo.key)}: ${fmtDur(cellInfo.min)} h` : 'Tippe auf einen Tag'}
            </span>
            weniger
            {[0, 1, 2, 3, 4].map((l) => (
              <i key={l} style={{ background: `var(--heat-${l})` }} />
            ))}
            mehr
          </div>
          <div className="kpis three" style={{ marginTop: 'auto' }}>
            <div className="kpi">
              <b className="num">{grid.days}</b>
              <span>Arbeitstage</span>
            </div>
            <div className="kpi">
              <b className="num">{fmtDur(grid.total)}</b>
              <span>Stunden</span>
            </div>
            <div className="kpi">
              <b className="num">{fmtDur(grid.days ? grid.total / grid.days : 0)}</b>
              <span>Ø pro Tag</span>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'avg',
      title: 'Durchschnitte',
      scope: 'Letzte 90 Tage',
      body: empty ? <Empty /> : (
        <div className="kpis" style={{ marginTop: 6 }}>
          <div className="kpi">
            <b className="num">{fmtDur(avg.perDay)}</b>
            <span>pro Arbeitstag</span>
          </div>
          <div className="kpi">
            <b className="num">{fmtDur(avg.perWeek)}</b>
            <span>pro Woche</span>
          </div>
          <div className="kpi">
            <b className="num">{avg.avgStart === null ? '–' : fromMin(avg.avgStart)}</b>
            <span>Ø Arbeitsbeginn</span>
          </div>
          <div className="kpi">
            <b className="num">{fmtDur(avg.avgPause)}</b>
            <span>Ø Pause pro Tag</span>
          </div>
          <div className="kpi">
            <b className="num">{fmtDur(avg.longest)}</b>
            <span>längster Tag</span>
          </div>
          <div className="kpi">
            <b className="num">{st}</b>
            <span>{st === 1 ? 'Woche in Folge aktiv' : 'Wochen in Folge aktiv'}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'week',
      title: 'Diese Woche',
      scope: `${fmtDur(weekNow)} h · Vorwoche ${fmtDur(weekBefore)} h`,
      body: (
        <>
          <Bars
            label="Stunden pro Wochentag"
            selected={selWeek}
            onSelect={setSelWeek}
            data={week.map((d) => ({ key: d.key, label: weekdayShort(d.key), v: d.now, ghost: d.before, hl: d.key === today }))}
          />
          <div className="legend">
            <i style={{ background: 'var(--text)' }} /> diese Woche
            <i style={{ background: 'var(--fill-strong)', marginLeft: 10 }} /> Vorwoche
          </div>
        </>
      ),
    },
    {
      id: 'months',
      title: 'Monate',
      scope: (() => {
        const m = months.find((x) => x.ym === selMonth) ?? months[months.length - 1]
        return `${fmtMonth(m.ym)}: ${fmtDur(m.min)} h an ${m.days} ${m.days === 1 ? 'Tag' : 'Tagen'}`
      })(),
      body: (
        <Bars
          label="Stunden pro Monat"
          selected={selMonth}
          onSelect={setSelMonth}
          data={months.map((m) => ({ key: m.ym, label: MONTHS[parseKey(m.ym + '-01').getMonth()].slice(0, 3), v: m.min, hl: m.ym === ym }))}
        />
      ),
    },
    {
      id: 'akten',
      title: 'Akten',
      scope: `${fmtMonth(ym)} · nach Stunden`,
      body: akten.length === 0 ? <Empty /> : (
        <div className="hbars">
          {akten.map((a) => (
            <div key={a.label}>
              <div className="hbar-top">
                <span>{a.label}</span>
                <span className="num muted">{fmtDur(a.min)} h</span>
              </div>
              <div className="hbar-track">
                <i style={{ width: `${(a.min / akten[0].min) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'cats',
      title: 'Kategorien',
      scope: `${fmtMonth(ym)} · ${fmtDur(monthTotal)} h`,
      body: cats.length === 0 ? <Empty /> : (
        <>
          <div className="stacked" role="img" aria-label={cats.map((c) => `${c.label} ${Math.round((c.min / monthTotal) * 100)} Prozent`).join(', ')}>
            {cats.map((c) => (
              <i key={c.label} style={{ width: `${(c.min / monthTotal) * 100}%`, background: catColor(c.label) }} />
            ))}
          </div>
          <div className="cat-list">
            {cats.map((c) => (
              <div key={c.label}>
                <i style={{ background: catColor(c.label) }} />
                <span>{c.label}</span>
                <span className="num">
                  {fmtDur(c.min)} h · {Math.round((c.min / monthTotal) * 100)} %
                </span>
              </div>
            ))}
          </div>
        </>
      ),
    },
  ]

  return (
    <div className="page">
      <div className="titlebar">
        <h1 className="large-title">Statistik</h1>
      </div>
      <p className="subtitle">Nach links wischen für die nächste Karte, nach rechts zurück.</p>
      <CardStack cards={cards} />
    </div>
  )
}

function CardStack({ cards }: { cards: Card[] }) {
  const [top, setTop] = useState(0)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const stack = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x0: number; y0: number; t0: number; mode: 'idle' | 'h' | 'v'; dx: number } | null>(null)
  const n = cards.length
  const W = () => stack.current?.offsetWidth ?? 360

  // Bruchteil der Bewegung: positiv = zur nächsten Karte. An den Enden gummiartig.
  let f = -dx / W()
  if ((top === 0 && f < 0) || (top === n - 1 && f > 0)) f *= 0.25

  const styleFor = (q: number): React.CSSProperties => {
    if (q <= 0) {
      return { transform: `translateX(${q * 112}%) rotate(${q * 7}deg)`, opacity: q < -0.95 ? 0 : 1, zIndex: 10 }
    }
    const k = Math.min(q, 2)
    return {
      transform: `translateY(${k * 13}px) scale(${1 - k * 0.05})`,
      opacity: q <= 2 ? 1 - k * 0.22 : Math.max(0, 0.56 - (q - 2) * 0.56),
      zIndex: 10 - Math.ceil(q),
    }
  }

  const down = (e: React.PointerEvent) => {
    drag.current = { x0: e.clientX, y0: e.clientY, t0: performance.now(), mode: 'idle', dx: 0 }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const mx = e.clientX - d.x0
    const my = e.clientY - d.y0
    if (d.mode === 'idle') {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
        d.mode = 'h'
        d.x0 = e.clientX
        stack.current?.setPointerCapture(e.pointerId)
        setDragging(true)
      } else if (Math.abs(my) > 8) d.mode = 'v'
      return
    }
    if (d.mode !== 'h') return
    d.dx = e.clientX - d.x0
    setDx(d.dx)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.mode !== 'h') return
    const v = d.dx / Math.max(1, performance.now() - d.t0)
    let next = top
    if ((d.dx < -W() * 0.28 || v < -0.45) && top < n - 1) next = top + 1
    if ((d.dx > W() * 0.28 || v > 0.45) && top > 0) next = top - 1
    if (next !== top) haptic('light')
    setDragging(false)
    setDx(0)
    setTop(next)
  }

  return (
    <>
      <div
        ref={stack}
        className={`stack ${dragging ? 'dragging' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-roledescription="Kartenstapel"
      >
        {cards.map((c, i) => {
          const q = i - top - f
          const visible = q > -1.05 && q < 3.05
          return (
            <div
              key={c.id}
              className="stat-card"
              aria-hidden={i !== top}
              style={{ ...styleFor(q), visibility: visible ? 'visible' : 'hidden', pointerEvents: i === top ? 'auto' : 'none' }}
            >
              <h3>{c.title}</h3>
              <p className="scope num">{c.scope}</p>
              <div className="stat-body">{Math.abs(i - top) <= 1 ? c.body : null}</div>
            </div>
          )
        })}
      </div>
      <div className="dots" role="tablist" aria-label="Statistik-Karten">
        {cards.map((c, i) => (
          <button key={c.id} role="tab" aria-current={i === top} aria-selected={i === top} aria-label={c.title} onClick={() => { setTop(i); haptic('light') }} />
        ))}
      </div>
    </>
  )
}

export { monthKey }
