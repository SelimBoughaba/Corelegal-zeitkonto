import type { Workbook, Worksheet } from 'exceljs'
import { type Entry, netMinutes, pauseMinutes, toMin, span, weekdayLong, fmtDate, monthKey, fmtMonth, parseKey, crossesMidnight } from './time'

export type ExportRange = { from: string; to: string; label: string; fileTag: string; simple?: boolean }

const FILL_HEAD = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1E1D1D' } }
const FILL_TOTAL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE6E2D6' } }
const FILL_ACCENT = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE9FF27' } }
const FONT = 'Calibri'

const asDate = (key: string) => {
  const d = parseKey(key)
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}
const asTime = (min: number) => min / 1440

function header(ws: Worksheet, cols: { header: string; key: string; width: number; fmt?: string }[]) {
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.fmt ? { numFmt: c.fmt } : {} }))
  const row = ws.getRow(1)
  row.height = 22
  row.eachCell((cell) => {
    cell.fill = FILL_HEAD
    cell.font = { name: FONT, bold: true, color: { argb: 'FFF3F1E8' } }
    cell.alignment = { vertical: 'middle' }
  })
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

function totalRow(ws: Worksheet, values: Record<string, unknown>) {
  const row = ws.addRow(values)
  row.font = { name: FONT, bold: true }
  row.eachCell({ includeEmpty: true }, (c) => (c.fill = FILL_TOTAL))
  return row
}

/** Tagesexport: nur ein Blatt mit den Einträgen in fester Spaltenreihenfolge */
export async function buildDayWorkbook(all: Entry[], range: ExportRange): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const entries = all.filter((e) => e.date >= range.from && e.date <= range.to)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Corelegal Zeiten'
  const ws = wb.addWorksheet('Einträge')
  header(ws, [
    { header: 'Datum', key: 'date', width: 12, fmt: 'dd.mm.yyyy' },
    { header: 'Wochentag', key: 'wd', width: 12 },
    { header: 'Beginn', key: 'start', width: 9, fmt: 'hh:mm' },
    { header: 'Ende', key: 'end', width: 9, fmt: 'hh:mm' },
    { header: 'Arbeitszeit', key: 'net', width: 12, fmt: '[h]:mm' },
    { header: 'Akte', key: 'akte', width: 18 },
    { header: 'Tätigkeit', key: 'cat', width: 18 },
    { header: 'Tätigkeitsbeschreibung', key: 'desc', width: 60 },
  ])
  for (const e of entries) {
    const r = ws.addRow({
      date: asDate(e.date),
      wd: weekdayLong(e.date),
      start: asTime(toMin(e.start)),
      end: asTime(toMin(e.end)),
      net: asTime(netMinutes(e)),
      akte: e.akte,
      cat: e.category,
      desc: e.description,
    })
    r.alignment = { vertical: 'top' }
    r.getCell('desc').alignment = { wrapText: true, vertical: 'top' }
  }
  if (entries.length) {
    const total = entries.reduce((sum, e) => sum + netMinutes(e), 0)
    const last = entries.length + 1
    totalRow(ws, { date: 'Gesamt', net: { formula: `SUM(E2:E${last})`, result: asTime(total) } })
  }
  ws.eachRow((r) => r.eachCell((c) => { if (!c.font?.name) c.font = { ...(c.font ?? {}), name: FONT } }))
  return wb
}

/**
 * Monats-, Jahres-, Wochen- und Zeitraumexport.
 * Blatt "Arbeitszeiten": oben die Zusammenfassung, darunter jeder Tag mit allen Einträgen und einer Tagessumme,
 * bei mehreren Monaten zusätzlich eine Monatssumme. Summen per TEILERGEBNIS, damit sie sich nicht doppelt zählen.
 * Blatt "Auswertung": Stunden nach Akte, Tätigkeit und (bei mehreren Monaten) Monat.
 */
export async function buildPeriodWorkbook(all: Entry[], range: ExportRange, name: string): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const entries = all.filter((e) => e.date >= range.from && e.date <= range.to)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Corelegal Zeiten'
  wb.created = new Date()

  const ws = wb.addWorksheet('Arbeitszeiten', { properties: { tabColor: { argb: 'FFE9FF27' } }, pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  const COLS: { key: string; header: string; width: number; fmt?: string }[] = [
    { key: 'date', header: 'Datum', width: 12, fmt: 'dd.mm.yyyy' },
    { key: 'wd', header: 'Wochentag', width: 12 },
    { key: 'start', header: 'Beginn', width: 9, fmt: 'hh:mm' },
    { key: 'end', header: 'Ende', width: 9, fmt: 'hh:mm' },
    { key: 'pauses', header: 'Pausen (von–bis)', width: 20 },
    { key: 'pause', header: 'Pause', width: 9, fmt: '[h]:mm' },
    { key: 'net', header: 'Arbeitszeit', width: 12, fmt: '[h]:mm' },
    { key: 'dec', header: 'Stunden', width: 10, fmt: '0.00' },
    { key: 'akte', header: 'Akte', width: 16 },
    { key: 'cat', header: 'Tätigkeit', width: 18 },
    { key: 'desc', header: 'Tätigkeitsbeschreibung', width: 60 },
  ]
  COLS.forEach((c, i) => (ws.getColumn(i + 1).width = c.width))
  const col = (key: string) => COLS.findIndex((c) => c.key === key) + 1
  const letter = (key: string) => String.fromCharCode(64 + col(key))
  const fmtCell = (r: number, key: string) => {
    const f = COLS[col(key) - 1].fmt
    if (f) ws.getCell(r, col(key)).numFmt = f
  }

  const totalMin = entries.reduce((s, e) => s + netMinutes(e), 0)
  const pauseMin = entries.reduce((s, e) => s + pauseMinutes(e), 0)
  const dayKeys = [...new Set(entries.map((e) => e.date))].sort()
  const months = [...new Set(entries.map((e) => monthKey(e.date)))].sort()
  const multiMonth = months.length > 1
  const dec = (min: number) => Math.round((min / 60) * 100) / 100

  // ---- Kopf ----
  ws.getCell('A1').value = 'Arbeitszeitnachweis Corelegal'
  ws.getCell('A1').font = { name: FONT, size: 16, bold: true }
  ws.getCell('A2').value = name ? `${name} · ${range.label}` : range.label
  ws.getCell('A2').font = { name: FONT, color: { argb: 'FF5A4D41' } }

  // Zusammenfassung ab Zeile 4; Werte für Zeit und Pausen werden unten als Formel auf die Tabelle gesetzt
  const SUM_ROW = 4
  const summary: [string, unknown, string?][] = [
    ['Gesamte Arbeitszeit', asTime(totalMin), '[h]:mm'],
    ['In Stunden', dec(totalMin), '0.00'],
    ['Arbeitstage', dayKeys.length],
    ['Einträge', entries.length],
    ['Pausen gesamt', asTime(pauseMin), '[h]:mm'],
    ['Ø pro Arbeitstag', asTime(dayKeys.length ? totalMin / dayKeys.length : 0), '[h]:mm'],
  ]
  summary.forEach(([label, value, fmt], i) => {
    const r = ws.getRow(SUM_ROW + i)
    r.getCell(1).value = label
    r.getCell(1).font = { name: FONT, color: { argb: 'FF5A4D41' } }
    ws.mergeCells(SUM_ROW + i, 1, SUM_ROW + i, 2)
    const v = r.getCell(3)
    v.value = value as never
    if (fmt) v.numFmt = fmt
    v.font = { name: FONT, bold: true, size: i === 0 ? 14 : 11 }
    v.alignment = { horizontal: 'left' }
    ws.mergeCells(SUM_ROW + i, 3, SUM_ROW + i, 4)
  })
  ws.getCell(SUM_ROW, 3).fill = FILL_ACCENT

  // ---- Tabelle ----
  const HEAD = SUM_ROW + summary.length + 1
  const head = ws.getRow(HEAD)
  COLS.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.header
    cell.fill = FILL_HEAD
    cell.font = { name: FONT, bold: true, color: { argb: 'FFF3F1E8' } }
    cell.alignment = { vertical: 'middle', indent: c.key === 'akte' || c.key === 'cat' ? 1 : 0 }
  })
  head.height = 22
  ws.views = [{ state: 'frozen', ySplit: HEAD }]

  const FILL_DAY = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F1E8' } }
  let r = HEAD + 1
  const firstData = r
  const sumCells = (from: number, to: number, keys: string[], row: number, results: Record<string, number>) => {
    for (const k of keys) {
      const c = ws.getCell(row, col(k))
      c.value = { formula: `SUBTOTAL(9,${letter(k)}${from}:${letter(k)}${to})`, result: results[k] }
      fmtCell(row, k)
    }
  }

  for (const ym of months) {
    const monthStartRow = r
    const mDays = dayKeys.filter((d) => monthKey(d) === ym)
    for (const day of mDays) {
      const list = entries.filter((e) => e.date === day).sort((a, b) => toMin(a.start) - toMin(b.start))
      const dayStart = r
      for (const e of list) {
        const row = ws.getRow(r)
        const vals: Record<string, unknown> = {
          date: asDate(e.date),
          wd: weekdayLong(e.date),
          start: asTime(toMin(e.start)),
          end: asTime(toMin(e.end)),
          pauses: e.pauses.map((p) => `${p.start}–${p.end}`).join(', '),
          pause: asTime(pauseMinutes(e)),
          net: asTime(netMinutes(e)),
          dec: dec(netMinutes(e)),
          akte: e.akte,
          cat: e.category,
          desc: e.description + (crossesMidnight(e.start, e.end) ? ' (Ende am Folgetag)' : ''),
        }
        for (const c of COLS) {
          row.getCell(col(c.key)).value = vals[c.key] as never
          fmtCell(r, c.key)
        }
        row.alignment = { vertical: 'top' }
        row.getCell(col('desc')).alignment = { wrapText: true, vertical: 'top' }
        row.getCell(col('akte')).alignment = { vertical: 'top', indent: 1 }
        row.getCell(col('dec')).alignment = { vertical: 'top', horizontal: 'center' }
        row.getCell(col('cat')).alignment = { vertical: 'top', indent: 1 }
        r++
      }
      // Tagessumme
      const net = list.reduce((s, e) => s + netMinutes(e), 0)
      const sumRow = ws.getRow(r)
      sumRow.getCell(1).value = `Summe ${weekdayLong(day)}, ${fmtDate(day)}`
      ws.mergeCells(r, 1, r, 5)
      sumCells(dayStart, r - 1, ['pause', 'net', 'dec'], r, { pause: asTime(list.reduce((s, e) => s + pauseMinutes(e), 0)), net: asTime(net), dec: dec(net) })
      sumRow.font = { name: FONT, bold: true }
      COLS.forEach((_, i) => (sumRow.getCell(i + 1).fill = FILL_DAY))
      r++
      r++ // Leerzeile zwischen den Tagen
    }
    if (multiMonth) {
      const list = entries.filter((e) => monthKey(e.date) === ym)
      const net = list.reduce((s, e) => s + netMinutes(e), 0)
      const mRow = ws.getRow(r)
      mRow.getCell(1).value = `Summe ${fmtMonth(ym)} (${mDays.length} ${mDays.length === 1 ? 'Arbeitstag' : 'Arbeitstage'})`
      ws.mergeCells(r, 1, r, 5)
      sumCells(monthStartRow, r - 1, ['pause', 'net', 'dec'], r, { pause: asTime(list.reduce((s, e) => s + pauseMinutes(e), 0)), net: asTime(net), dec: dec(net) })
      mRow.font = { name: FONT, bold: true, size: 12 }
      COLS.forEach((_, i) => (mRow.getCell(i + 1).fill = FILL_TOTAL))
      r += 2
    }
  }
  const lastData = Math.max(firstData, r - 1)

  // Gesamtsumme am Ende und oben als Formel
  if (entries.length) {
    const tRow = ws.getRow(r)
    tRow.getCell(1).value = 'Gesamt'
    ws.mergeCells(r, 1, r, 5)
    sumCells(firstData, lastData, ['pause', 'net', 'dec'], r, { pause: asTime(pauseMin), net: asTime(totalMin), dec: dec(totalMin) })
    tRow.font = { name: FONT, bold: true, size: 12 }
    COLS.forEach((_, i) => (tRow.getCell(i + 1).fill = FILL_ACCENT))

    ws.getCell(SUM_ROW, 3).value = { formula: `SUBTOTAL(9,${letter('net')}${firstData}:${letter('net')}${lastData})`, result: asTime(totalMin) }
    ws.getCell(SUM_ROW + 1, 3).value = { formula: `SUBTOTAL(9,${letter('dec')}${firstData}:${letter('dec')}${lastData})`, result: dec(totalMin) }
    ws.getCell(SUM_ROW + 4, 3).value = { formula: `SUBTOTAL(9,${letter('pause')}${firstData}:${letter('pause')}${lastData})`, result: asTime(pauseMin) }
    ws.getCell(SUM_ROW + 5, 3).value = {
      formula: `IF(C${SUM_ROW + 2}=0,0,C${SUM_ROW}/C${SUM_ROW + 2})`,
      result: asTime(dayKeys.length ? totalMin / dayKeys.length : 0),
    }
  } else {
    ws.getCell(HEAD + 1, 1).value = 'Keine Einträge in diesem Zeitraum.'
  }

  // ---- Auswertung ----
  const as = wb.addWorksheet('Auswertung')
  as.getColumn(1).width = 26
  as.getColumn(2).width = 13
  as.getColumn(3).width = 10
  as.getColumn(4).width = 9
  as.getColumn(5).width = 10
  let ar = 1
  const block = (title: string, first: string, rows: { label: string; min: number; count: number; days?: number }[], withDays = false) => {
    as.getCell(ar, 1).value = title
    as.getCell(ar, 1).font = { name: FONT, size: 13, bold: true }
    ar++
    const heads = [first, 'Arbeitszeit', 'Stunden', 'Anteil', withDays ? 'Arbeitstage' : 'Einträge']
    heads.forEach((h, i) => {
      const c = as.getCell(ar, i + 1)
      c.value = h
      c.fill = FILL_HEAD
      c.font = { name: FONT, bold: true, color: { argb: 'FFF3F1E8' } }
    })
    ar++
    for (const x of rows) {
      as.getCell(ar, 1).value = x.label
      as.getCell(ar, 2).value = asTime(x.min)
      as.getCell(ar, 2).numFmt = '[h]:mm'
      as.getCell(ar, 3).value = dec(x.min)
      as.getCell(ar, 3).numFmt = '0.00'
      as.getCell(ar, 4).value = totalMin ? x.min / totalMin : 0
      as.getCell(ar, 4).numFmt = '0%'
      as.getCell(ar, 5).value = withDays ? (x.days ?? 0) : x.count
      ar++
    }
    ar++
  }
  const group = (key: (e: Entry) => string, empty: string) => {
    const m = new Map<string, { min: number; count: number }>()
    for (const e of entries) {
      const k = key(e) || empty
      const v = m.get(k) ?? { min: 0, count: 0 }
      m.set(k, { min: v.min + netMinutes(e), count: v.count + 1 })
    }
    return [...m.entries()].sort((a, b) => b[1].min - a[1].min).map(([label, v]) => ({ label, ...v }))
  }
  if (multiMonth) {
    block(
      'Nach Monat',
      'Monat',
      months.map((ym) => {
        const list = entries.filter((e) => monthKey(e.date) === ym)
        return { label: fmtMonth(ym), min: list.reduce((s, e) => s + netMinutes(e), 0), count: list.length, days: new Set(list.map((e) => e.date)).size }
      }),
      true,
    )
  }
  block('Nach Akte', 'Akte', group((e) => e.akte, 'Ohne Akte'))
  block('Nach Tätigkeit', 'Tätigkeit', group((e) => e.category, 'Ohne Tätigkeit'))

  for (const sheet of wb.worksheets) sheet.eachRow((row) => row.eachCell((c) => { if (!c.font?.name) c.font = { ...(c.font ?? {}), name: FONT } }))
  return wb
}

export async function buildWorkbook(all: Entry[], range: ExportRange, name: string): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const entries = all.filter((e) => e.date >= range.from && e.date <= range.to)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Corelegal Zeiten'
  wb.created = new Date()

  // ---------- Übersicht ----------
  const ov = wb.addWorksheet('Übersicht', { properties: { tabColor: { argb: 'FFE9FF27' } } })
  ov.columns = [{ width: 26 }, { width: 30 }]
  const totalMin = entries.reduce((s, e) => s + netMinutes(e), 0)
  const pauseMin = entries.reduce((s, e) => s + pauseMinutes(e), 0)
  const days = new Set(entries.map((e) => e.date)).size
  const title = ov.addRow(['Arbeitszeitnachweis Corelegal'])
  title.font = { name: FONT, size: 16, bold: true }
  ov.addRow([])
  const rows: [string, unknown, string?][] = [
    ['Name', name || '—'],
    ['Zeitraum', range.label],
    ['Von', asDate(range.from), 'dd.mm.yyyy'],
    ['Bis', asDate(range.to), 'dd.mm.yyyy'],
    ['Arbeitstage', days],
    ['Einträge', entries.length],
    ['Arbeitszeit (h:mm)', asTime(totalMin), '[h]:mm'],
    ['Arbeitszeit (Stunden)', Math.round((totalMin / 60) * 100) / 100, '0.00'],
    ['Pausen gesamt (h:mm)', asTime(pauseMin), '[h]:mm'],
    ['Ø pro Arbeitstag (h:mm)', asTime(days ? totalMin / days : 0), '[h]:mm'],
    ['Erstellt am', (() => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes())) })(), 'dd.mm.yyyy hh:mm'],
  ]
  for (const [k, v, fmt] of rows) {
    const r = ov.addRow([k, v])
    r.getCell(1).font = { name: FONT, color: { argb: 'FF5A4D41' } }
    r.getCell(2).font = { name: FONT, bold: k.startsWith('Arbeitszeit') }
    if (fmt) r.getCell(2).numFmt = fmt
    r.getCell(2).alignment = { horizontal: 'left' }
  }
  ov.getCell('B9').fill = FILL_ACCENT

  // ---------- Einträge ----------
  const es = wb.addWorksheet('Einträge')
  header(es, [
    { header: 'Datum', key: 'date', width: 12, fmt: 'dd.mm.yyyy' },
    { header: 'Wochentag', key: 'wd', width: 12 },
    { header: 'Beginn', key: 'start', width: 9, fmt: 'hh:mm' },
    { header: 'Ende', key: 'end', width: 9, fmt: 'hh:mm' },
    { header: 'Pausen (von–bis)', key: 'pauses', width: 22 },
    { header: 'Pause', key: 'pause', width: 9, fmt: '[h]:mm' },
    { header: 'Arbeitszeit', key: 'net', width: 12, fmt: '[h]:mm' },
    { header: 'Stunden', key: 'dec', width: 10, fmt: '0.00' },
    { header: 'Akte', key: 'akte', width: 18 },
    { header: 'Kategorie', key: 'cat', width: 18 },
    { header: 'Tätigkeitsbeschreibung', key: 'desc', width: 60 },
  ])
  for (const e of entries) {
    const r = es.addRow({
      date: asDate(e.date),
      wd: weekdayLong(e.date),
      start: asTime(toMin(e.start)),
      end: asTime(toMin(e.end)),
      pauses: e.pauses.map((p) => `${p.start}–${p.end}`).join(', '),
      pause: asTime(pauseMinutes(e)),
      net: asTime(netMinutes(e)),
      dec: Math.round((netMinutes(e) / 60) * 100) / 100,
      akte: e.akte,
      cat: e.category,
      desc: e.description + (crossesMidnight(e.start, e.end) ? ' (Ende am Folgetag)' : ''),
    })
    r.getCell('desc').alignment = { wrapText: true, vertical: 'top' }
    r.alignment = { vertical: 'top' }
  }
  const n = entries.length
  if (n) {
    totalRow(es, {
      date: 'Summe',
      pause: { formula: `SUM(F2:F${n + 1})`, result: asTime(pauseMin) },
      net: { formula: `SUM(G2:G${n + 1})`, result: asTime(totalMin) },
      dec: { formula: `SUM(H2:H${n + 1})`, result: Math.round((totalMin / 60) * 100) / 100 },
    })
    es.autoFilter = { from: 'A1', to: `K${n + 1}` }
  }

  // ---------- Tage ----------
  const ds = wb.addWorksheet('Tage')
  header(ds, [
    { header: 'Datum', key: 'date', width: 12, fmt: 'dd.mm.yyyy' },
    { header: 'Wochentag', key: 'wd', width: 12 },
    { header: 'Erster Beginn', key: 'start', width: 13, fmt: 'hh:mm' },
    { header: 'Letztes Ende', key: 'end', width: 13, fmt: 'hh:mm' },
    { header: 'Pausen', key: 'pause', width: 10, fmt: '[h]:mm' },
    { header: 'Arbeitszeit', key: 'net', width: 12, fmt: '[h]:mm' },
    { header: 'Stunden', key: 'dec', width: 10, fmt: '0.00' },
    { header: 'Einträge', key: 'count', width: 10 },
    { header: 'Akten', key: 'akten', width: 40 },
  ])
  const byDay = new Map<string, Entry[]>()
  entries.forEach((e) => byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]))
  const dayKeys = [...byDay.keys()].sort()
  for (const k of dayKeys) {
    const list = byDay.get(k)!
    const net = list.reduce((s, e) => s + netMinutes(e), 0)
    const first = Math.min(...list.map((e) => toMin(e.start)))
    const last = Math.max(...list.map((e) => toMin(e.start) + span(e.start, e.end)))
    ds.addRow({
      date: asDate(k),
      wd: weekdayLong(k),
      start: asTime(first),
      end: asTime(last % 1440),
      pause: asTime(list.reduce((s, e) => s + pauseMinutes(e), 0)),
      net: asTime(net),
      dec: Math.round((net / 60) * 100) / 100,
      count: list.length,
      akten: [...new Set(list.map((e) => e.akte).filter(Boolean))].join(', '),
    })
  }
  if (dayKeys.length) {
    const m = dayKeys.length + 1
    totalRow(ds, {
      date: 'Summe',
      pause: { formula: `SUM(E2:E${m})`, result: asTime(pauseMin) },
      net: { formula: `SUM(F2:F${m})`, result: asTime(totalMin) },
      dec: { formula: `SUM(G2:G${m})`, result: Math.round((totalMin / 60) * 100) / 100 },
      count: { formula: `SUM(H2:H${m})`, result: n },
    })
  }

  // ---------- Monate (nur wenn mehr als ein Monat) ----------
  const months = [...new Set(entries.map((e) => monthKey(e.date)))].sort()
  if (months.length > 1) {
    const ms = wb.addWorksheet('Monate')
    header(ms, [
      { header: 'Monat', key: 'm', width: 18 },
      { header: 'Arbeitstage', key: 'days', width: 12 },
      { header: 'Arbeitszeit', key: 'net', width: 12, fmt: '[h]:mm' },
      { header: 'Stunden', key: 'dec', width: 10, fmt: '0.00' },
      { header: 'Ø pro Arbeitstag', key: 'avg', width: 16, fmt: '[h]:mm' },
    ])
    for (const ym of months) {
      const list = entries.filter((e) => monthKey(e.date) === ym)
      const net = list.reduce((s, e) => s + netMinutes(e), 0)
      const d = new Set(list.map((e) => e.date)).size
      ms.addRow({ m: fmtMonth(ym), days: d, net: asTime(net), dec: Math.round((net / 60) * 100) / 100, avg: asTime(d ? net / d : 0) })
    }
    const m = months.length + 1
    totalRow(ms, {
      m: 'Summe',
      days: { formula: `SUM(B2:B${m})`, result: days },
      net: { formula: `SUM(C2:C${m})`, result: asTime(totalMin) },
      dec: { formula: `SUM(D2:D${m})`, result: Math.round((totalMin / 60) * 100) / 100 },
    })
  }

  // ---------- Akten ----------
  const as = wb.addWorksheet('Akten')
  header(as, [
    { header: 'Akte', key: 'a', width: 22 },
    { header: 'Arbeitszeit', key: 'net', width: 12, fmt: '[h]:mm' },
    { header: 'Stunden', key: 'dec', width: 10, fmt: '0.00' },
    { header: 'Anteil', key: 'share', width: 10, fmt: '0%' },
    { header: 'Einträge', key: 'count', width: 10 },
  ])
  const byAkte = new Map<string, { net: number; count: number }>()
  for (const e of entries) {
    const k = e.akte || 'Ohne Akte'
    const v = byAkte.get(k) ?? { net: 0, count: 0 }
    byAkte.set(k, { net: v.net + netMinutes(e), count: v.count + 1 })
  }
  ;[...byAkte.entries()]
    .sort((a, b) => b[1].net - a[1].net)
    .forEach(([a, v]) => as.addRow({ a, net: asTime(v.net), dec: Math.round((v.net / 60) * 100) / 100, share: totalMin ? v.net / totalMin : 0, count: v.count }))

  for (const ws of wb.worksheets) ws.eachRow((r) => r.eachCell((c) => { if (!c.font?.name) c.font = { ...(c.font ?? {}), name: FONT } }))
  return wb
}

export async function exportExcel(all: Entry[], range: ExportRange, name: string): Promise<{ blob: Blob; filename: string }> {
  const wb = range.simple ? await buildDayWorkbook(all, range) : await buildPeriodWorkbook(all, range, name)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return { blob, filename: `Corelegal_Arbeitszeiten_${range.fileTag}.xlsx` }
}

export { fmtDate }
