import { type Entry, netMinutes, pauseMinutes, toMin, addDays, weekStart, monthKey, addMonths, daysBetween, todayKey } from './time'

export function minutesByDay(entries: Entry[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + netMinutes(e))
  return m
}

export function inRange(entries: Entry[], from: string, to: string) {
  return entries.filter((e) => e.date >= from && e.date <= to)
}

export function sumNet(entries: Entry[]) {
  return entries.reduce((s, e) => s + netMinutes(e), 0)
}

export function weekMinutes(entries: Entry[], anyDay = todayKey()) {
  const a = weekStart(anyDay)
  return sumNet(inRange(entries, a, addDays(a, 6)))
}

/** Heatmap: `weeks` volle Wochen bis einschließlich der aktuellen, Montag oben */
export function activityGrid(entries: Entry[], weeks = 18, today = todayKey()) {
  const byDay = minutesByDay(entries)
  const first = addDays(weekStart(today), -(weeks - 1) * 7)
  const cols: { key: string; min: number; future: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const key = addDays(first, w * 7 + d)
      col.push({ key, min: byDay.get(key) ?? 0, future: key > today })
    }
    cols.push(col)
  }
  const total = cols.flat().reduce((s, c) => s + c.min, 0)
  const days = cols.flat().filter((c) => c.min > 0).length
  return { cols, total, days, first }
}

export function averages(entries: Entry[], today = todayKey()) {
  const from = addDays(today, -89)
  const recent = inRange(entries, from, today)
  const byDay = minutesByDay(recent)
  const workDays = [...byDay.values()].filter((v) => v > 0)
  const perDay = workDays.length ? workDays.reduce((a, b) => a + b, 0) / workDays.length : 0

  // Wochen seit der ersten erfassten Woche im Zeitraum (leere Wochen zählen mit)
  const firstDate = recent[0]?.date
  let perWeek = 0
  if (firstDate) {
    const wkA = weekStart(firstDate)
    const weeks = Math.max(1, Math.round((+new Date(weekStart(today)) - +new Date(wkA)) / (7 * 864e5)) + 1)
    perWeek = sumNet(recent) / weeks
  }

  // Erster Beginn pro Tag
  const firstStart = new Map<string, number>()
  const pausePerDay = new Map<string, number>()
  for (const e of recent) {
    const s = toMin(e.start)
    firstStart.set(e.date, Math.min(firstStart.get(e.date) ?? Infinity, s))
    pausePerDay.set(e.date, (pausePerDay.get(e.date) ?? 0) + pauseMinutes(e))
  }
  const starts = [...firstStart.values()]
  const avgStart = starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : null
  const pauses = [...pausePerDay.values()]
  const avgPause = pauses.length ? pauses.reduce((a, b) => a + b, 0) / pauses.length : 0
  const longest = workDays.length ? Math.max(...workDays) : 0

  return { perDay, perWeek, avgStart, avgPause, longest, workDays: workDays.length }
}

export function weekCompare(entries: Entry[], today = todayKey()) {
  const a = weekStart(today)
  const prev = addDays(a, -7)
  const byDay = minutesByDay(entries)
  return Array.from({ length: 7 }, (_, i) => ({
    key: addDays(a, i),
    now: byDay.get(addDays(a, i)) ?? 0,
    before: byDay.get(addDays(prev, i)) ?? 0,
  }))
}

export function monthSeries(entries: Entry[], months = 6, today = todayKey()) {
  const cur = monthKey(today)
  return Array.from({ length: months }, (_, i) => {
    const ym = addMonths(cur, i - months + 1)
    const list = entries.filter((e) => monthKey(e.date) === ym)
    return { ym, min: sumNet(list), days: new Set(list.map((e) => e.date)).size }
  })
}

export function groupBy(entries: Entry[], key: (e: Entry) => string, limit = 5, empty = 'Ohne Angabe') {
  const m = new Map<string, number>()
  for (const e of entries) {
    const k = key(e) || empty
    m.set(k, (m.get(k) ?? 0) + netMinutes(e))
  }
  const all = [...m.entries()].sort((a, b) => b[1] - a[1])
  if (all.length <= limit) return all.map(([label, min]) => ({ label, min }))
  const head = all.slice(0, limit - 1)
  const rest = all.slice(limit - 1).reduce((s, [, v]) => s + v, 0)
  return [...head.map(([label, min]) => ({ label, min })), { label: 'Weitere', min: rest }]
}

export function streak(entries: Entry[], today = todayKey()) {
  // Arbeitswochen in Folge mit mindestens einem Eintrag
  const weeks = new Set(entries.map((e) => weekStart(e.date)))
  let n = 0
  let w = weekStart(today)
  if (!weeks.has(w)) w = addDays(w, -7)
  while (weeks.has(w)) {
    n++
    w = addDays(w, -7)
  }
  return n
}

export { daysBetween }
