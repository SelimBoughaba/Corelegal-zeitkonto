import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { Segmented, showToast, useHSwipe } from '../components/ui'
import { useStore, getState } from '../lib/store'
import { todayKey, addDays, weekStart, isoWeek, fmtDate, fmtDayLong, monthKey, addMonths, monthStart, monthEnd, fmtMonth, netMinutes, fmtDur, fmtDec, pauseMinutes } from '../lib/time'
import { exportExcel, type ExportRange } from '../lib/excel'
import { shareFile, haptic } from '../lib/device'

type Mode = 'day' | 'week' | 'month' | 'year' | 'custom'

function rangeFor(mode: Mode, anchor: string, from: string, to: string): ExportRange {
  switch (mode) {
    case 'day':
      return { from: anchor, to: anchor, label: fmtDayLong(anchor), fileTag: anchor }
    case 'week': {
      const a = weekStart(anchor)
      const b = addDays(a, 6)
      return { from: a, to: b, label: `KW ${isoWeek(a)} (${fmtDate(a)} bis ${fmtDate(b)})`, fileTag: `${a.slice(0, 4)}-KW${String(isoWeek(a)).padStart(2, '0')}` }
    }
    case 'month': {
      const ym = monthKey(anchor)
      return { from: monthStart(ym), to: monthEnd(ym), label: fmtMonth(ym), fileTag: ym }
    }
    case 'year': {
      const y = anchor.slice(0, 4)
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Jahr ${y}`, fileTag: y }
    }
    case 'custom': {
      const [a, b] = from <= to ? [from, to] : [to, from]
      return { from: a, to: b, label: `${fmtDate(a)} bis ${fmtDate(b)}`, fileTag: `${a}_bis_${b}` }
    }
  }
}

function shift(mode: Mode, anchor: string, n: number) {
  if (mode === 'day') return addDays(anchor, n)
  if (mode === 'week') return addDays(anchor, 7 * n)
  if (mode === 'month') return monthStart(addMonths(monthKey(anchor), n))
  if (mode === 'year') return `${Number(anchor.slice(0, 4)) + n}-01-01`
  return anchor
}

export function Export({ onSettings }: { onSettings: () => void }) {
  const entries = useStore((s) => s.entries)
  const name = useStore((s) => s.settings.name)
  const [mode, setMode] = useState<Mode>('month')
  const [anchor, setAnchor] = useState(todayKey())
  const [from, setFrom] = useState(monthStart(monthKey(todayKey())))
  const [to, setTo] = useState(todayKey())
  const [busy, setBusy] = useState(false)
  const range = rangeFor(mode, anchor, from, to)
  const swipe = useHSwipe(() => setAnchor((a) => shift(mode, a, 1)), () => setAnchor((a) => shift(mode, a, -1)))

  const list = useMemo(() => entries.filter((e) => e.date >= range.from && e.date <= range.to), [entries, range.from, range.to])
  const total = list.reduce((s, e) => s + netMinutes(e), 0)
  const pause = list.reduce((s, e) => s + pauseMinutes(e), 0)
  const days = new Set(list.map((e) => e.date)).size

  const run = async () => {
    if (!list.length) return
    setBusy(true)
    try {
      const { blob, filename } = await exportExcel(getState().entries, range, name)
      const r = await shareFile(blob, filename)
      if (r !== 'cancelled') {
        haptic('success')
        showToast(r === 'shared' ? 'Excel-Datei bereit' : 'Excel-Datei heruntergeladen')
      }
    } catch (e) {
      showToast(`Export fehlgeschlagen: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="titlebar">
        <h1 className="large-title">Export</h1>
        <div className="toolbar">
          <button className="icon-btn" aria-label="Einstellungen" onClick={onSettings}>
            <Icon name="gear" />
          </button>
        </div>
      </div>
      <p className="subtitle">Excel mit Übersicht, Einträgen, Tagessummen und Akten.</p>

      <Segmented<Mode>
        label="Zeitraum"
        value={mode}
        onChange={(m) => { setMode(m); setAnchor(todayKey()) }}
        options={[
          { value: 'day', label: 'Tag' },
          { value: 'week', label: 'Woche' },
          { value: 'month', label: 'Monat' },
          { value: 'year', label: 'Jahr' },
          { value: 'custom', label: 'Frei' },
        ]}
      />

      {mode === 'custom' ? (
        <div className="pair" style={{ marginTop: 14 }}>
          <div>
            <div className="cap">Von</div>
            <input className="field" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Von" />
          </div>
          <div>
            <div className="cap">Bis</div>
            <input className="field" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} aria-label="Bis" />
          </div>
        </div>
      ) : (
        <div className="pager" style={{ marginTop: 10 }} {...swipe}>
          <button className="icon-btn" aria-label="Zurück" onClick={() => setAnchor((a) => shift(mode, a, -1))}>
            <Icon name="left" />
          </button>
          <div className="pager-label" aria-live="polite">
            <b style={{ fontSize: 18 }}>{range.label}</b>
          </div>
          <button className="icon-btn" aria-label="Weiter" onClick={() => setAnchor((a) => shift(mode, a, 1))}>
            <Icon name="right" />
          </button>
        </div>
      )}

      <div className="group" style={{ marginTop: 16 }}>
        <div className="row">
          <span className="row-label">Arbeitszeit</span>
          <span className="num" style={{ fontWeight: 650, fontSize: 20 }}>{fmtDur(total)} h</span>
        </div>
        <div className="row">
          <span className="row-label">in Stunden</span>
          <span className="row-value num">{fmtDec(total)}</span>
        </div>
        <div className="row">
          <span className="row-label">Arbeitstage</span>
          <span className="row-value num">{days}</span>
        </div>
        <div className="row">
          <span className="row-label">Einträge</span>
          <span className="row-value num">{list.length}</span>
        </div>
        <div className="row">
          <span className="row-label">Pausen</span>
          <span className="row-value num">{fmtDur(pause)} h</span>
        </div>
      </div>

      <button className="btn lime block" style={{ marginTop: 18 }} onClick={run} disabled={busy || !list.length}>
        <Icon name="share" /> {busy ? 'Wird erstellt …' : 'Als Excel exportieren'}
      </button>
      <p className="hint">
        {list.length ? 'Auf dem iPhone öffnet sich das Teilen-Menü: „In Dateien sichern“ oder direkt per Mail senden.' : 'In diesem Zeitraum gibt es keine Einträge.'}
        {!name && list.length > 0 && ' Deinen Namen für den Nachweis kannst du in den Einstellungen hinterlegen.'}
      </p>
    </div>
  )
}
