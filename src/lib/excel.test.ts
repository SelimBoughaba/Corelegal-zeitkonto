import { buildDayWorkbook } from './excel'
import type { Entry } from './time'

const e = (p: Partial<Entry>): Entry => ({ id: Math.random() + '', date: '2026-10-27', start: '10:00', end: '12:15', pauses: [], akte: '121/26', category: 'Recherche', description: 'Test', source: 'manual', createdAt: 0, updatedAt: 0, ...p })

test('Tagesexport: ein Blatt, feste Spalten, nur der Tag', async () => {
  const wb = await buildDayWorkbook(
    [e({}), e({ start: '12:15', end: '15:00', pauses: [{ id: 'p', start: '13:00', end: '13:30' }], category: 'Schriftsatz', description: 'Entwurf' }), e({ date: '2026-10-26' })],
    { from: '2026-10-27', to: '2026-10-27', label: '', fileTag: '', simple: true },
  )
  expect(wb.worksheets.map((w) => w.name)).toEqual(['Einträge'])
  const ws = wb.worksheets[0]
  expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['Datum', 'Wochentag', 'Beginn', 'Ende', 'Arbeitszeit', 'Akte', 'Tätigkeit', 'Tätigkeitsbeschreibung'])
  expect(ws.rowCount).toBe(4)
  const sum = ws.getRow(4)
  expect(sum.getCell(1).value).toBe('Gesamt')
  const f = sum.getCell(5).value as { formula: string; result: number }
  expect(f.formula).toBe('SUM(E2:E3)')
  expect(Math.round(f.result * 1440)).toBe(270)
  const r3 = ws.getRow(3)
  expect(r3.getCell(2).value).toBe('Dienstag')
  expect(Math.round((r3.getCell(5).value as number) * 1440)).toBe(135)
  expect(r3.getCell(7).value).toBe('Schriftsatz')
  await wb.xlsx.writeFile((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.OUT ?? '/tmp/day.xlsx')
})

import { buildPeriodWorkbook } from './excel'

test('Monats-/Jahresexport: Zusammenfassung oben, Tage mit Summen, Monatssummen im Jahr', async () => {
  const list = [
    e({ date: '2026-10-27' }),
    e({ date: '2026-10-27', start: '12:15', end: '15:00', pauses: [{ id: 'p', start: '13:00', end: '13:30' }], category: 'Schriftsatz' }),
    e({ date: '2026-10-29', start: '10:00', end: '14:00' }),
    e({ date: '2026-11-03', start: '10:00', end: '11:00', akte: '' }),
  ]
  const month = await buildPeriodWorkbook(list, { from: '2026-10-01', to: '2026-10-31', label: 'Oktober 2026', fileTag: '' }, 'Selim')
  expect(month.worksheets.map((w) => w.name)).toEqual(['Arbeitszeiten', 'Auswertung'])
  const ws = month.worksheets[0]
  const top = ws.getCell('C4').value as { formula: string; result: number }
  expect(top.formula).toMatch(/^SUBTOTAL\(9,G\d+:G\d+\)$/)
  expect(Math.round(top.result * 1440)).toBe(135 + 135 + 240)
  expect(ws.getCell('C6').value).toBe(2)
  const labels: string[] = []
  ws.eachRow((r) => { const v = r.getCell(1).value; if (typeof v === 'string') labels.push(v) })
  expect(labels).toContain('Summe Dienstag, 27.10.2026')
  expect(labels).toContain('Summe Donnerstag, 29.10.2026')
  expect(labels.some((l) => l.startsWith('Summe Oktober'))).toBe(false)
  expect(labels).toContain('Gesamt')

  const year = await buildPeriodWorkbook(list, { from: '2026-01-01', to: '2026-12-31', label: 'Jahr 2026', fileTag: '' }, '')
  const yl: string[] = []
  year.worksheets[0].eachRow((r) => { const v = r.getCell(1).value; if (typeof v === 'string') yl.push(v) })
  expect(yl).toContain('Summe Oktober 2026 (2 Arbeitstage)')
  expect(yl).toContain('Summe November 2026 (1 Arbeitstag)')
  const yt = year.worksheets[0].getCell('C4').value as { result: number }
  expect(Math.round(yt.result * 1440)).toBe(135 + 135 + 240 + 60)
  const outDir = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.OUTDIR
  if (outDir) {
    await month.xlsx.writeFile(`${outDir}/monat.xlsx`)
    await year.xlsx.writeFile(`${outDir}/jahr.xlsx`)
  }
})
