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
  expect(ws.rowCount).toBe(3)
  const r3 = ws.getRow(3)
  expect(r3.getCell(2).value).toBe('Dienstag')
  expect(Math.round((r3.getCell(5).value as number) * 1440)).toBe(135)
  expect(r3.getCell(7).value).toBe('Schriftsatz')
  await wb.xlsx.writeFile(process.env.OUT ?? '/tmp/day.xlsx')
})
