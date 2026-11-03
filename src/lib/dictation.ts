// Erkennt Arbeitszeiten aus diktiertem Text (iPhone-Diktat) oder aus dem Zeilenformat der KI-Kurzbefehl-Ausgabe.
// Alles läuft lokal. Ergebnis sind Entwürfe mit markierten Unsicherheiten, die vor dem Speichern geprüft werden.

import { type Entry, type Pause, uid, toMin, fromMin, span, addDays, dateKey, parseKey, DAY_START, roundMin } from './time'

export type Field = 'date' | 'start' | 'end' | 'pauses' | 'akte' | 'category' | 'description'

export type Draft = {
  entry: Entry
  uncertain: Field[]
  notes: string[]
  source: string
}

export type ParseContext = {
  today: string // YYYY-MM-DD
  defaultDate: string
  categories: string[]
  entries: Entry[] // bestehende Einträge (für Anschlusszeiten)
}

// ---------------- Zahlwörter ----------------

const UNITS: Record<string, number> = {
  null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
}
const TEENS: Record<string, number> = {
  zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, fuenfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19,
}
const TENS: Record<string, number> = {
  zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
}

function below100(w: string): number | null {
  if (w in UNITS) return UNITS[w]
  if (w in TEENS) return TEENS[w]
  if (w in TENS) return TENS[w]
  const m = w.match(/^(ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun)und(\w+)$/)
  if (m && m[2] in TENS) return UNITS[m[1]] + TENS[m[2]]
  return null
}

export function germanNumber(word: string): number | null {
  const w = word.toLowerCase()
  if (!w) return null
  let rest = w
  let total = 0
  const ti = rest.indexOf('tausend')
  if (ti >= 0) {
    const left = rest.slice(0, ti)
    const l = left ? below100(left) : 1
    if (l === null) return null
    total += l * 1000
    rest = rest.slice(ti + 7)
  }
  const hi = rest.indexOf('hundert')
  if (hi >= 0) {
    const left = rest.slice(0, hi)
    const l = left ? below100(left) : 1
    if (l === null) return null
    total += l * 100
    rest = rest.slice(hi + 7)
  }
  if (!rest) return total
  if (rest.startsWith('und')) rest = rest.slice(3)
  const r = below100(rest)
  if (r === null) return null
  return total + r
}

/** Ersetzt Zahlwörter durch Ziffern. "ein/eine" nur vor Zeiteinheiten, damit "ein Gutachten" bleibt. */
export function normalizeNumbers(text: string): string {
  return text.replace(/[A-Za-zÄÖÜäöüß]+/g, (w, offset: number, all: string) => {
    const lw = w.toLowerCase()
    if (lw === 'ein' || lw === 'eine' || lw === 'einer' || lw === 'einen') {
      const after = all.slice(offset + w.length).toLowerCase()
      return /^\s*(stunde|std|minute|min\b|viertel)/.test(after) ? '1' : w
    }
    if (lw === 'acht' && /^\s*(geben|genommen)/i.test(all.slice(offset + w.length))) return w
    const n = germanNumber(lw)
    return n === null ? w : String(n)
  })
}

// ---------------- Bausteine ----------------

const TIME_SRC =
  '(?:halb\\s+\\d{1,2}|drei\\s?viertel\\s+\\d{1,2}|viertel\\s+(?:nach|vor)\\s+\\d{1,2}|viertel\\s+\\d{1,2}|\\d{1,2}[:.]\\d{2}(?:\\s*uhr)?|\\d{1,2}\\s*uhr(?:\\s*\\d{2}(?!\\s*(?:min|minuten|stunde)))?|\\d{1,2})'
const T = `(?<![\\d/:.,])${TIME_SRC}(?![\\d/:]|\\s*(?:stunde|std|h\\b|minute|min\\b|aus\\s*\\d|/|strich))`
const DUR_SRC =
  '(?:(?:\\d+(?:[,.]\\d+)?|anderthalb|eineinhalb|einhalb|halbe?n?|drei\\s?viertel|viertel)\\s*(?:stunden?|std\\.?|h)\\b(?:\\s*(?:und\\s*)?\\d{1,2}\\s*(?:minuten|min\\.?))?|\\d{1,3}\\s*(?:minuten|min\\.?)(?![a-zäöü])|viertelstunde|dreiviertelstunde)'

export function parseTime(raw: string): { min: number; explicit: boolean } | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim()
  let m: RegExpMatchArray | null
  if ((m = s.match(/^halb (\d{1,2})$/))) return { min: ((+m[1] - 1 + 24) % 24) * 60 + 30, explicit: false }
  if ((m = s.match(/^drei ?viertel (\d{1,2})$/))) return { min: ((+m[1] - 1 + 24) % 24) * 60 + 45, explicit: false }
  if ((m = s.match(/^viertel nach (\d{1,2})$/))) return { min: (+m[1] % 24) * 60 + 15, explicit: false }
  if ((m = s.match(/^viertel vor (\d{1,2})$/))) return { min: ((+m[1] - 1 + 24) % 24) * 60 + 45, explicit: false }
  if ((m = s.match(/^viertel (\d{1,2})$/))) return { min: ((+m[1] - 1 + 24) % 24) * 60 + 15, explicit: false }
  if ((m = s.match(/^(\d{1,2})[:.](\d{2})(?: ?uhr)?$/))) {
    if (+m[1] > 24 || +m[2] > 59) return null
    return { min: (+m[1] % 24) * 60 + +m[2], explicit: +m[1] > 12 || m[1].length === 2 }
  }
  if ((m = s.match(/^(\d{1,2}) ?uhr(?: ?(\d{2}))?$/))) {
    if (+m[1] > 24 || (m[2] && +m[2] > 59)) return null
    return { min: (+m[1] % 24) * 60 + (m[2] ? +m[2] : 0), explicit: +m[1] > 12 }
  }
  if ((m = s.match(/^(\d{1,2})$/))) {
    if (+m[1] > 24) return null
    return { min: (+m[1] % 24) * 60, explicit: +m[1] > 12 }
  }
  return null
}

export function parseDuration(raw: string): number | null {
  const s = raw.toLowerCase().replace(',', '.').replace(/\s+/g, ' ').trim()
  if (/^viertelstunde$/.test(s)) return 15
  if (/^dreiviertelstunde$/.test(s)) return 45
  let m = s.match(/^(\d+(?:\.\d+)?|anderthalb|eineinhalb|einhalb|halben?|halbe|drei ?viertel|viertel) ?(?:stunden?|std\.?|h)(?: ?(?:und )?(\d{1,2}) ?(?:minuten|min\.?))?$/)
  if (m) {
    const word = m[1]
    const h =
      word === 'anderthalb' || word === 'eineinhalb' ? 1.5 : word === 'einhalb' || word.startsWith('halb') ? 0.5 : word.startsWith('drei') ? 0.75 : word === 'viertel' ? 0.25 : parseFloat(word)
    return Math.round(h * 60) + (m[2] ? +m[2] : 0)
  }
  m = s.match(/^(\d{1,3}) ?(?:minuten|min\.?)$/)
  if (m) return +m[1]
  return null
}

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8,
  september: 9, sept: 9, sep: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
}
const WEEKDAYS: Record<string, number> = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 }

function mkDate(day: number, month: number, year: number | null, today: string): string | null {
  const ty = parseKey(today).getFullYear()
  let y = year === null ? ty : year < 100 ? 2000 + year : year
  const d = new Date(y, month - 1, day)
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null
  let key = dateKey(d)
  if (year === null && key > addDays(today, 7)) key = dateKey(new Date(--y, month - 1, day))
  return key
}

// Maskiert erkannte Stellen mit Leerzeichen, damit die Positionen erhalten bleiben
class Work {
  t: string
  constructor(public original: string) {
    this.t = original
  }
  take(re: RegExp): RegExpExecArray[] {
    const out: RegExpExecArray[] = []
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    let m: RegExpExecArray | null
    while ((m = g.exec(this.t))) {
      if (m[0].length === 0) {
        g.lastIndex++
        continue
      }
      out.push(m)
    }
    for (const x of out.reverse()) this.t = this.t.slice(0, x.index) + ' '.repeat(x[0].length) + this.t.slice(x.index + x[0].length)
    return out.reverse()
  }
  first(re: RegExp): RegExpExecArray | null {
    const g = new RegExp(re.source, re.flags.replace('g', ''))
    const m = g.exec(this.t)
    if (!m) return null
    this.t = this.t.slice(0, m.index) + ' '.repeat(m[0].length) + this.t.slice(m.index + m[0].length)
    return m
  }
  test(re: RegExp) {
    return new RegExp(re.source, re.flags.replace('g', '')).test(this.t)
  }
}

function takeDate(w: Work, ctx: ParseContext): string | null {
  const today = ctx.today
  let m = w.first(/\b(vorgestern|gestern|heute)\b/i)
  if (m) return addDays(today, m[1].toLowerCase() === 'heute' ? 0 : m[1].toLowerCase() === 'gestern' ? -1 : -2)
  m = w.first(/\b(?:am\s+|den\s+)?(\d{1,2})\.?\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|jun|jul|aug|sept|sep|okt|nov|dez)\.?(?:\s+(\d{4}))?\b/i)
  if (m) return mkDate(+m[1], MONTHS[m[2].toLowerCase()], m[3] ? +m[3] : null, today)
  m = w.first(/(?:\b(?:am|den)\s+)?\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})?(?![\d:])/i)
  if (m) return mkDate(+m[1], +m[2], m[3] ? +m[3] : null, today)
  m = w.first(/\b(?:am|den)\s+(\d{1,2})\.(\d{1,2})(?![\d:.])/i)
  if (m) return mkDate(+m[1], +m[2], null, today)
  m = w.first(/\b(?:(letzten|vergangenen)\s+|am\s+)?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i)
  if (m) {
    const target = WEEKDAYS[m[2].toLowerCase()]
    const t = parseKey(today)
    let diff = (t.getDay() - target + 7) % 7
    if (diff === 0 && m[1]) diff = 7
    return addDays(today, -diff)
  }
  return null
}

const AKTE_RE = /(?:\b(?:in\s+der\s+|in\s+|für\s+|fuer\s+|zur\s+|zu\s+)?(?:akte|aktenzeichen|az\.?)\s*(?:nummer|nr\.?)?\s*)?\b(\d{1,4})\s*(?:\/|\baus\b|\bstrich\b|\bschrägstrich\b|\bslash\b)\s*(\d{4}|\d{2})\b/i

function takeAkte(w: Work): string | null {
  const m = w.first(AKTE_RE)
  if (!m) return null
  return `${+m[1]}/${m[2].slice(-2)}`
}

const norm = (s: string) => s.toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9äöü]+/g, '')

function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** Sucht genau eine Kategorie aus den Einstellungen; toleriert Leerzeichen/Bindestrich und kleine Diktatfehler */
function takeCategory(w: Work, categories: string[]): { cat: string | null; fuzzy: boolean; ambiguous: boolean } {
  const words = [...w.t.matchAll(/[A-Za-zÄÖÜäöüß0-9-]+/g)].map((m) => ({ text: m[0], index: m.index! }))
  type Hit = { cat: string; start: number; end: number; dist: number }
  const hits: Hit[] = []
  for (const cat of categories) {
    const target = norm(cat)
    if (!target) continue
    const n = Math.max(1, cat.split(/[\s-]+/).length)
    for (let k = n; k >= 1; k--) {
      for (let i = 0; i + k <= words.length; i++) {
        const chunk = words.slice(i, i + k)
        const cand = norm(chunk.map((c) => c.text).join(''))
        if (!cand) continue
        const dist = cand === target ? 0 : target.length >= 6 && Math.abs(cand.length - target.length) <= 2 ? lev(cand, target) : 99
        if (dist <= (target.length >= 9 ? 2 : 1)) {
          const last = chunk[chunk.length - 1]
          hits.push({ cat, start: chunk[0].index, end: last.index + last.text.length, dist })
        }
      }
    }
  }
  if (!hits.length) return { cat: null, fuzzy: false, ambiguous: false }
  // "Kategorie X" bevorzugen, dann exakte Treffer, dann erster
  const labelled = w.t.toLowerCase().search(/\bkategorie\b/)
  hits.sort((a, b) => a.dist - b.dist || (labelled >= 0 ? Math.abs(a.start - labelled) - Math.abs(b.start - labelled) : a.start - b.start))
  const best = hits[0]
  const distinct = new Set(hits.filter((h) => h.dist === 0).map((h) => h.cat))
  w.t = w.t.slice(0, best.start) + ' '.repeat(best.end - best.start) + w.t.slice(best.end)
  w.take(/\b(?:kategorie|als\s+kategorie|tätigkeit)\b\s*:?/i)
  return { cat: best.cat, fuzzy: best.dist > 0, ambiguous: distinct.size > 1 }
}

const FILLER = new Set(
  'und zwar von bis ab um in im für fuer zur zum zu mit am heute gestern danach dann anschließend anschliessend außerdem ausserdem akte aktenzeichen kategorie als tätigkeit taetigkeit beschreibung tätigkeitsbeschreibung habe hab ich uhr noch also bei der die das an den dem ein eine habe ist war gemacht gearbeitet arbeit'.split(' '),
)
const EDGE_ONLY = new Set(['gemacht', 'gearbeitet', 'arbeit', 'ein', 'eine', 'der', 'die', 'das', 'den', 'dem', 'ist', 'war'])

function cleanDescription(t: string): string {
  let s = t.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim()
  s = s.replace(/^[,.;:\-–\s]+|[,;:\-–\s]+$/g, '')
  // Füllwörter an Anfang und Ende entfernen
  let changed = true
  while (changed && s) {
    changed = false
    const a = s.match(/^([A-Za-zÄÖÜäöüß]+)[\s,.;:]*/)
    if (a && FILLER.has(a[1].toLowerCase())) {
      s = s.slice(a[0].length)
      changed = true
    }
    const b = s.match(/[\s,.;:]*([A-Za-zÄÖÜäöüß]+)[.!]?$/)
    if (b && (FILLER.has(b[1].toLowerCase()) || EDGE_ONLY.has(b[1].toLowerCase())) && b.index! > 0) {
      s = s.slice(0, b.index)
      changed = true
    }
    s = s.replace(/^[,.;:\-–\s]+|[,;:\-–\s]+$/g, '')
  }
  s = s.replace(/\b(?:akte|kategorie)\b\s*:?/gi, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/([,;:])\1+/g, '$1').trim()
  s = s.replace(/^[,.;:\-–\s]+|[,.;:\-–\s]+$/g, '')
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ---------------- Zeilenformat (Ausgabe des KI-Kurzbefehls) ----------------

function parsePipeLine(line: string, ctx: ParseContext): Draft | null {
  const f = line.split('|').map((x) => x.trim())
  if (f.length < 6) return null
  const [dRaw, sRaw, eRaw, pRaw, aRaw, cRaw, ...rest] = f
  const uncertain: Field[] = []
  const notes: string[] = []
  const dw = new Work(normalizeNumbers(dRaw))
  const date = takeDate(dw, ctx) ?? ctx.defaultDate
  if (!dRaw) uncertain.push('date')
  const s = parseTime(sRaw)
  const e = parseTime(eRaw)
  const pauses: Pause[] = []
  if (pRaw && !/^(keine?|-|–|ohne)$/i.test(pRaw)) {
    for (const part of pRaw.split(/[,;]/)) {
      const m = part.match(/(\d{1,2}[:.]\d{2})\s*[-–bis]+\s*(\d{1,2}[:.]\d{2})/)
      const a = m && parseTime(m[1])
      const b = m && parseTime(m[2])
      if (a && b) pauses.push({ id: uid(), start: fromMin(a.min), end: fromMin(b.min) })
      else if (part.trim()) uncertain.push('pauses')
    }
  }
  const aw = new Work(normalizeNumbers(aRaw))
  const akte = takeAkte(aw) ?? (aRaw && !/^(-|–|keine?|ohne)$/i.test(aRaw) ? aRaw : '')
  const cw = new Work(cRaw)
  const c = takeCategory(cw, ctx.categories)
  if (!s) uncertain.push('start')
  if (!e) uncertain.push('end')
  if (c.fuzzy) uncertain.push('category')
  if (!c.cat && cRaw) notes.push(`Kategorie „${cRaw}“ gibt es nicht.`)
  const startMin = s?.min ?? DAY_START
  const t = Date.now()
  return {
    entry: {
      id: uid(),
      date,
      start: fromMin(startMin),
      end: fromMin(e?.min ?? startMin + 60),
      pauses,
      akte,
      category: c.cat ?? '',
      description: rest.join(' | ').trim(),
      source: 'manual',
      createdAt: t,
      updatedAt: t,
    },
    uncertain,
    notes,
    source: line,
  }
}

// ---------------- Freier Text ----------------

const SPLIT_RE = /\s*(?:[.;!?]\s+(?=(?:und\s+)?(?:danach|anschließend|anschliessend|dann|außerdem|ausserdem|zusätzlich|später|im anschluss)\b)|\b(?:und\s+)?(?:danach|anschließend|anschliessend|dann|außerdem|ausserdem|zusätzlich|später|im anschluss(?:\s+daran)?)\b|(?<!\d)[.!?;]\s+(?=[A-ZÄÖÜ\d])|\n+)\s*/i

function hasTimeInfo(text: string) {
  const w = new Work(normalizeNumbers(text))
  w.take(AKTE_RE)
  return new RegExp(`(?:\\bbis\\b|\\bab\\b|\\bvon\\b|\\bum\\b)\\s*${T}|${T}\\s*(?:-|–|bis)\\s*${T}|${DUR_SRC}`, 'i').test(w.t)
}

function isPauseOnly(text: string) {
  const w = new Work(normalizeNumbers(text))
  return /\b(mittags)?pause\b/i.test(w.t) && !AKTE_RE.test(w.t)
}

type Clause = { text: string }

function splitClauses(text: string): Clause[] {
  const raw = text.split(SPLIT_RE).map((x) => x.trim()).filter(Boolean)
  const out: Clause[] = []
  for (const part of raw) {
    if (!out.length || hasTimeInfo(part)) out.push({ text: part })
    else out[out.length - 1].text += ', ' + part
  }
  // Erster Abschnitt ohne Zeitangabe (z. B. nur Datum) mit dem nächsten zusammenführen
  if (out.length > 1 && !hasTimeInfo(out[0].text)) {
    out[1].text = out[0].text + ' ' + out[1].text
    out.shift()
  }
  return out
}

function pmFix(min: number, explicit: boolean, ref: number | null): { min: number; changed: boolean } {
  if (explicit) return { min, changed: false }
  const h = Math.floor(min / 60)
  // Arbeitsbeginn liegt bei 10 Uhr: 1–7 Uhr ist fast sicher nachmittags
  if (h >= 1 && h <= 7) return { min: min + 720, changed: true }
  if (ref !== null && min <= ref && min + 720 > ref && h <= 12) return { min: min + 720, changed: true }
  return { min, changed: false }
}

/** Haupteinstieg: Text → Entwürfe */
export function parseDictation(input: string, ctx: ParseContext): Draft[] {
  const text = input.replace(/[–—]/g, '-').replace(/ /g, ' ').trim()
  if (!text) return []
  const drafts: Draft[] = []

  // Zeilenformat der KI-Ausgabe
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  if (lines.length && lines.every((l) => (l.match(/\|/g) ?? []).length >= 5 || !/\d/.test(l))) {
    for (const l of lines) {
      const d = parsePipeLine(l, ctx)
      if (d) drafts.push(d)
    }
    if (drafts.length) return finalize(drafts, ctx)
  }

  let currentDate = ctx.defaultDate
  const cursor = new Map<string, number>()
  const cursorFor = (date: string) => {
    if (cursor.has(date)) return cursor.get(date)!
    const same = ctx.entries.filter((e) => e.date === date)
    return same.length ? Math.max(...same.map((e) => toMin(e.start) + span(e.start, e.end))) : DAY_START
  }

  for (const clause of splitClauses(text)) {
    const w = new Work(normalizeNumbers(clause.text))
    const uncertain: Field[] = []
    const notes: string[] = []
    const d = takeDate(w, ctx)
    if (d) currentDate = d
    const date = currentDate

    // Reine Pause zwischen zwei Tätigkeiten ("dann Mittagspause bis 12:30")
    if (isPauseOnly(clause.text)) {
      const pw = new Work(w.t)
      const r = pw.first(new RegExp(`(?:von\\s*)?(${T})\\s*(?:-|bis)\\s*(${T})`, 'i'))
      const b = r ? null : pw.first(new RegExp(`\\bbis\\s*(${T})`, 'i'))
      const du = r || b ? null : pw.first(new RegExp(`(${DUR_SRC})`, 'i'))
      const base = cursorFor(date)
      if (r) {
        const e = parseTime(r[2])
        if (e) cursor.set(date, pmFix(e.min, e.explicit, base).min)
      } else if (b) {
        const e = parseTime(b[1])
        if (e) cursor.set(date, pmFix(e.min, e.explicit, base).min)
      } else if (du) {
        const m = parseDuration(du[1])
        if (m) cursor.set(date, base + m)
      }
      continue
    }

    const akte = takeAkte(w)

    // Pausen innerhalb der Tätigkeit
    const pauseRanges: { a: number; b: number }[] = []
    const pauseDurations: number[] = []
    for (const m of w.take(new RegExp(`(?:mit\\s+)?(?:einer\\s+)?(?:mittags)?pause\\s*(?:von\\s*)?(${T})\\s*(?:-|bis)\\s*(${T})`, 'i'))) {
      const a = parseTime(m[1])
      const b = parseTime(m[2])
      if (a && b) pauseRanges.push({ a: a.min, b: b.min })
    }
    for (const m of w.take(new RegExp(`(?:mit\\s+)?(?:einer\\s+|1\\s+)?(${DUR_SRC})\\s*(?:mittags)?pause`, 'i'))) {
      const v = parseDuration(m[1])
      if (v) pauseDurations.push(v)
    }
    for (const m of w.take(new RegExp(`(?:mit\\s+)?(?:einer\\s+)?(?:mittags)?pause\\s*(?:von\\s*)?(${DUR_SRC})`, 'i'))) {
      const v = parseDuration(m[1])
      if (v) pauseDurations.push(v)
    }
    w.take(/\b(?:ohne|keine)\s+pause\b/i)

    // Arbeitszeit
    let start: number | null = null
    let end: number | null = null
    let startExplicit = true
    let endExplicit = true
    const range = w.first(new RegExp(`(?:\\b(?:von|ab)\\s*)?(${T})\\s*(?:-|bis)\\s*(${T})`, 'i'))
    const dur = w.first(new RegExp(`(?:\\b(?:für|fuer|insgesamt|ca\\.?|etwa|ungefähr)\\s*)?(?:1\\s+)?(${DUR_SRC})`, 'i'))
    const until = range ? null : w.first(new RegExp(`\\bbis\\s*(${T})`, 'i'))
    const from = range ? null : w.first(new RegExp(`\\b(?:von|ab|um|seit)\\s*(${T})`, 'i'))
    const durMin = dur ? parseDuration(dur[1]) : null

    if (range) {
      const a = parseTime(range[1])
      const b = parseTime(range[2])
      if (a && b) {
        const fa = pmFix(a.min, a.explicit, null)
        start = fa.min
        startExplicit = !fa.changed
        const fb = pmFix(b.min, b.explicit, start)
        end = fb.min
        endExplicit = !fb.changed
        if (!a.explicit && !b.explicit && fa.changed) uncertain.push('start')
      }
    } else {
      if (from) {
        const a = parseTime(from[1])
        if (a) {
          const fa = pmFix(a.min, a.explicit, null)
          start = fa.min
          startExplicit = !fa.changed
        }
      }
      if (until) {
        const b = parseTime(until[1])
        if (b) {
          const base = start ?? cursorFor(date)
          const fb = pmFix(b.min, b.explicit, base)
          end = fb.min
          endExplicit = !fb.changed
        }
      }
      if (start === null) {
        start = cursorFor(date)
        if (!until && !durMin) uncertain.push('start')
      }
      if (end === null && durMin) end = start + durMin
      if (end === null) {
        end = start + 60
        uncertain.push('end')
        notes.push('Ende nicht erkannt, eine Stunde angenommen.')
      }
    }
    if (start === null || end === null) {
      start = cursorFor(date)
      end = start + 60
      uncertain.push('start', 'end')
      notes.push('Zeit nicht erkannt.')
    }
    if (!startExplicit && !uncertain.includes('start')) uncertain.push('start')
    if (!endExplicit && !uncertain.includes('end')) uncertain.push('end')
    if (range && durMin && Math.abs(span(fromMin(start), fromMin(end)) - durMin) > 1) notes.push(`Angegebene Dauer (${durMin} Min.) passt nicht zu ${fromMin(start)}–${fromMin(end)}.`)

    // Pausen in Uhrzeiten übersetzen
    const pauses: Pause[] = pauseRanges.map((p) => {
      const a = pmFix(p.a, p.a >= 720, start).min
      const b = pmFix(p.b, p.b >= 720, a).min
      return { id: uid(), start: fromMin(a), end: fromMin(b) }
    })
    for (const dm of pauseDurations) {
      const total = span(fromMin(start), fromMin(end))
      const mid = roundMin(start + total / 2 - dm / 2, 15)
      pauses.push({ id: uid(), start: fromMin(mid), end: fromMin(mid + dm) })
      notes.push(`Pause von ${dm} Min. in die Mitte gelegt (${fromMin(mid)}–${fromMin(mid + dm)}).`)
      if (!uncertain.includes('pauses')) uncertain.push('pauses')
    }
    // Dauer + Pause ohne Endzeit: Pause verlängert den Tag nicht stillschweigend
    if (!range && !until && durMin && pauseDurations.length) end += pauseDurations.reduce((s, x) => s + x, 0)

    const cat = takeCategory(w, ctx.categories)
    if (cat.fuzzy) uncertain.push('category')
    if (cat.ambiguous) notes.push('Mehrere Kategorien genannt, bitte prüfen.')

    // Beschreibung: Rest des Satzes oder ausdrücklich nach "Beschreibung:"
    const explicitDesc = w.t.match(/\b(?:tätigkeits)?beschreibung\s*:?\s*(.+)$/i)
    const description = cleanDescription(explicitDesc ? explicitDesc[1] : w.t)

    cursor.set(date, end)
    const t = Date.now()
    drafts.push({
      entry: {
        id: uid(),
        date,
        start: fromMin(start),
        end: fromMin(end),
        pauses,
        akte: akte ?? '',
        category: cat.cat ?? '',
        description,
        source: 'manual',
        createdAt: t,
        updatedAt: t,
      },
      uncertain,
      notes,
      source: clause.text,
    })
  }
  return finalize(drafts, ctx)
}

function finalize(drafts: Draft[], ctx: ParseContext): Draft[] {
  const known = new Set(ctx.entries.map((e) => e.akte).filter(Boolean))
  for (const d of drafts) {
    if (!d.entry.akte) d.notes.push('Keine Akte erkannt.')
    else if (known.size && !known.has(d.entry.akte)) d.notes.push(`Akte ${d.entry.akte} ist neu.`)
    if (!d.entry.category) d.notes.push('Keine Kategorie erkannt.')
    if (d.entry.date > ctx.today) d.notes.push('Datum liegt in der Zukunft.')
  }
  return drafts
}

/** Prompt für den Kurzbefehl mit Apples On-Device-Modell */
export function shortcutPrompt(categories: string[]) {
  return `Wandle das Diktat unten in Arbeitszeit-Einträge um. Gib für jede Tätigkeit genau eine Zeile in diesem Format aus und sonst nichts:
TT.MM.JJJJ | HH:MM | HH:MM | Pausen | Akte | Kategorie | Beschreibung

Regeln:
- Heute ist [Aktuelles Datum]. "heute", "gestern" und Wochentage beziehen sich darauf.
- Uhrzeiten im 24-Stunden-Format. Die Arbeit beginnt frühestens um 10:00. Fehlt ein Beginn, beginnt die Tätigkeit am Ende der vorherigen; die erste des Tages um 10:00.
- Pausen als HH:MM-HH:MM, mehrere mit Komma getrennt, sonst "keine".
- Akte im Format Nummer/Jahr, zum Beispiel 121/26. "121 aus 26" oder "121 Strich 26" wird 121/26. Ohne Akte das Feld leer lassen.
- Kategorie genau eine aus: ${categories.join(', ')}.
- Beschreibung kurz und sachlich, nur was im Diktat steht.
- Erfinde nichts. Unklare Felder leer lassen.

Diktat:
[Diktierter Text]`
}
