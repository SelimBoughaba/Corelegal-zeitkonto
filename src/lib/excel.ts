import type { Workbook, Worksheet } from 'exceljs'
import { type Entry, netMinutes, pauseMinutes, toMin, span, weekdayLong, fmtDate, monthKey, fmtMonth, parseKey, crossesMidnight } from './time'

export type ExportRange = { from: string; to: string; label: string; fileTag: string }

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
  const wb = await buildWorkbook(all, range, name)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  return { blob, filename: `Corelegal_Arbeitszeiten_${range.fileTag}.xlsx` }
}

export { fmtDate }
