// Zeit- und Datumslogik. Alles lokal, ohne Bibliothek.

export type Pause = { id: string; start: string; end: string }

export type Entry = {
  id: string
  date: string // YYYY-MM-DD (Tag des Beginns)
  start: string // HH:MM
  end: string // HH:MM, darf kleiner als start sein (über Mitternacht)
  pauses: Pause[]
  akte: string
  category: string
  description: string
  source: 'timer' | 'manual'
  createdAt: number
  updatedAt: number
}

export type Session = {
  id: string
  startedAt: number
  pauses: { start: number; end: number | null }[]
  akte: string
  category: string
  description: string
}

export const DAY = 1440

export const uid = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36))

export const pad = (n: number) => String(n).padStart(2, '0')

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMin(min: number): string {
  const m = ((Math.round(min) % DAY) + DAY) % DAY
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** Dauer zwischen zwei Uhrzeiten; Ende vor Beginn heißt: am Folgetag. */
export function span(start: string, end: string): number {
  const d = toMin(end) - toMin(start)
  return d < 0 ? d + DAY : d
}

export function crossesMidnight(start: string, end: string) {
  return toMin(end) < toMin(start)
}

export function pauseMinutes(e: Pick<Entry, 'pauses'>): number {
  return e.pauses.reduce((s, p) => s + span(p.start, p.end), 0)
}

export function netMinutes(e: Pick<Entry, 'start' | 'end' | 'pauses'>): number {
  return Math.max(0, span(e.start, e.end) - pauseMinutes(e))
}

/** Auf den nächsten Takt runden (kaufmännisch, 7:30 → 7:30, 7:37 → 7:30, 7:38 → 7:45). */
export function roundMin(min: number, step: number): number {
  if (step <= 1) return Math.round(min)
  return Math.round(min / step) * step
}

/** Zum nächsten Vielfachen des Takts springen (Stepper-Logik): 9:07 +15 → 9:15, 9:15 +15 → 9:30. */
export function stepTime(hhmm: string, dir: 1 | -1, step = 15): string {
  const m = toMin(hhmm)
  const next = dir > 0 ? Math.floor(m / step) * step + step : Math.ceil(m / step) * step - step
  return fromMin(next)
}

// ---------- Datum ----------

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

export function todayKey() {
  return dateKey(new Date())
}

/** Montag der Woche */
export function weekStart(key: string): string {
  const d = parseKey(key)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return dateKey(d)
}

export function isoWeek(key: string): number {
  const d = parseKey(key)
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
}

export function monthKey(key: string) {
  return key.slice(0, 7)
}

export function monthStart(ym: string) {
  return `${ym}-01`
}

export function monthEnd(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return dateKey(new Date(y, m, 0))
}

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function daysBetween(a: string, b: string): string[] {
  const out: string[] = []
  for (let k = a; k <= b; k = addDays(k, 1)) out.push(k)
  return out
}

const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export const weekdayLong = (key: string) => WD_LONG[parseKey(key).getDay()]
export const weekdayShort = (key: string) => WD_SHORT[parseKey(key).getDay()]

export function fmtDayLong(key: string) {
  const d = parseKey(key)
  return `${WD_LONG[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`
}

export function fmtDayShort(key: string) {
  const d = parseKey(key)
  return `${WD_SHORT[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`
}

export function fmtDate(key: string) {
  const d = parseKey(key)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** 225 → "3:45" */
export function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min))
  return `${Math.floor(m / 60)}:${pad(m % 60)}`
}

/** 225 → "3,75" */
export function fmtDec(min: number) {
  return (Math.round((min / 60) * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

// ---------- Timer ----------

export function sessionPausedMs(s: Session, now: number) {
  return s.pauses.reduce((sum, p) => sum + ((p.end ?? now) - p.start), 0)
}

export function sessionWorkMs(s: Session, now: number) {
  return Math.max(0, now - s.startedAt - sessionPausedMs(s, now))
}

export function isPaused(s: Session | null) {
  return !!s && s.pauses.length > 0 && s.pauses[s.pauses.length - 1].end === null
}

function hhmmOf(ts: number) {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/**
 * Wandelt eine laufende Sitzung in einen Eintrag um.
 * Mit Rundung werden Beginn, Ende und Pausengrenzen auf den nächsten Takt gerundet;
 * Pausen, die dadurch auf 0 schrumpfen, entfallen. Eine Sitzung bleibt mindestens einen Takt lang.
 */
export function sessionToEntry(s: Session, now: number, step: number): Entry {
  const r = (m: number) => roundMin(m, step)
  const startM = r(hhmmOf(s.startedAt))
  let endM = r(hhmmOf(now))
  const elapsedDays = Math.floor((now - s.startedAt) / 86400000)
  if (endM === startM && now - s.startedAt > 0 && elapsedDays === 0) endM = startM + Math.max(step, 1)

  const pauses: Pause[] = s.pauses
    .map((p) => ({ id: uid(), start: fromMin(r(hhmmOf(p.start))), end: fromMin(r(hhmmOf(p.end ?? now))) }))
    .filter((p) => p.start !== p.end)

  const t = Date.now()
  const startDate = dateKey(new Date(s.startedAt))
  return {
    id: s.id,
    date: startM >= DAY ? addDays(startDate, 1) : startDate,
    start: fromMin(startM),
    end: fromMin(endM),
    pauses,
    akte: s.akte.trim(),
    category: s.category,
    description: s.description.trim(),
    source: 'timer',
    createdAt: t,
    updatedAt: t,
  }
}

// ---------- Prüfungen ----------

export type Issue = { level: 'error' | 'warn'; text: string }

export function validateEntry(e: Entry, others: Entry[]): Issue[] {
  const out: Issue[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) out.push({ level: 'error', text: 'Bitte ein Datum wählen.' })
  if (e.start === e.end) out.push({ level: 'error', text: 'Beginn und Ende sind gleich.' })
  const total = span(e.start, e.end)
  const s0 = toMin(e.start)
  for (const p of e.pauses) {
    const a = (toMin(p.start) - s0 + DAY) % DAY
    const b = a + span(p.start, p.end)
    if (p.start === p.end) out.push({ level: 'error', text: `Pause ${p.start} hat keine Dauer.` })
    else if (b > total) out.push({ level: 'error', text: `Pause ${p.start}–${p.end} liegt außerhalb der Arbeitszeit.` })
  }
  if (pauseMinutes(e) >= total && total > 0) out.push({ level: 'error', text: 'Die Pausen sind so lang wie die Arbeitszeit.' })
  if (crossesMidnight(e.start, e.end)) out.push({ level: 'warn', text: 'Ende liegt am Folgetag.' })
  if (total > 12 * 60) out.push({ level: 'warn', text: 'Mehr als 12 Stunden an einem Stück. Stimmt das?' })

  const iv = (x: Entry) => {
    const a = toMin(x.start)
    return [a, a + span(x.start, x.end)]
  }
  const [a1, b1] = iv(e)
  const clash = others.find((o) => o.id !== e.id && o.date === e.date && (() => { const [a2, b2] = iv(o); return a1 < b2 && a2 < b1 })())
  if (clash) out.push({ level: 'warn', text: `Überschneidet sich mit ${clash.start}–${clash.end}${clash.akte ? ` (${clash.akte})` : ''}.` })
  return out
}

export function sortEntries(list: Entry[]) {
  return [...list].sort((a, b) => (a.date === b.date ? toMin(a.start) - toMin(b.start) : a.date < b.date ? -1 : 1))
}
