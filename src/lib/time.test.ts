import { netMinutes, roundMin, stepTime, sessionToEntry, validateEntry, span, isoWeek, weekStart, type Entry } from './time'

const e = (p: Partial<Entry>): Entry => ({ id: 'x', date: '2026-10-27', start: '09:00', end: '17:00', pauses: [], akte: '', category: '', description: '', source: 'manual', createdAt: 0, updatedAt: 0, ...p })

test('netto mit mehreren Pausen', () => {
  expect(netMinutes(e({ pauses: [{ id: 'a', start: '12:00', end: '12:30' }, { id: 'b', start: '15:00', end: '15:10' }] }))).toBe(440)
})
test('über Mitternacht', () => {
  expect(span('22:00', '01:30')).toBe(210)
  expect(netMinutes(e({ start: '22:00', end: '01:30', pauses: [{ id: 'a', start: '23:50', end: '00:10' }] }))).toBe(190)
})
test('Rundung 15 Minuten', () => {
  expect(roundMin(9 * 60 + 7, 15)).toBe(9 * 60)
  expect(roundMin(9 * 60 + 8, 15)).toBe(9 * 60 + 15)
  expect(roundMin(9 * 60 + 37, 15)).toBe(9 * 60 + 30)
})
test('Stepper springt auf Viertelstunden', () => {
  expect(stepTime('09:07', 1)).toBe('09:15')
  expect(stepTime('09:15', 1)).toBe('09:30')
  expect(stepTime('09:07', -1)).toBe('09:00')
  expect(stepTime('09:00', -1)).toBe('08:45')
  expect(stepTime('00:00', -1)).toBe('23:45')
})
test('Timer → Eintrag gerundet, kurze Pause entfällt', () => {
  const start = new Date(2026, 9, 27, 9, 4, 0).getTime()
  const p1 = new Date(2026, 9, 27, 11, 2, 0).getTime()
  const p1e = new Date(2026, 9, 27, 11, 5, 0).getTime()
  const p2 = new Date(2026, 9, 27, 12, 1, 0).getTime()
  const p2e = new Date(2026, 9, 27, 12, 29, 0).getTime()
  const end = new Date(2026, 9, 27, 16, 53, 0).getTime()
  const r = sessionToEntry({ id: 's', startedAt: start, pauses: [{ start: p1, end: p1e }, { start: p2, end: p2e }], akte: ' 12/26 ', category: 'Recherche', description: '' }, end, 15)
  expect(r.start).toBe('09:00')
  expect(r.end).toBe('17:00')
  expect(r.pauses.map((p) => `${p.start}-${p.end}`)).toEqual(['12:00-12:30'])
  expect(r.akte).toBe('12/26')
  expect(netMinutes(r)).toBe(450)
})
test('Timer ohne Rundung', () => {
  const start = new Date(2026, 9, 27, 9, 4, 0).getTime()
  const r = sessionToEntry({ id: 's', startedAt: start, pauses: [], akte: '', category: '', description: '' }, start + 61 * 60000, 1)
  expect([r.start, r.end]).toEqual(['09:04', '10:05'])
})
test('sehr kurzer Timer wird ein Takt', () => {
  const start = new Date(2026, 9, 27, 9, 0, 0).getTime()
  const r = sessionToEntry({ id: 's', startedAt: start, pauses: [], akte: '', category: '', description: '' }, start + 3 * 60000, 15)
  expect([r.start, r.end]).toEqual(['09:00', '09:15'])
})
test('Validierung', () => {
  expect(validateEntry(e({ pauses: [{ id: 'a', start: '18:00', end: '18:30' }] }), []).some((i) => i.level === 'error')).toBe(true)
  const w = validateEntry(e({ id: 'n', start: '10:00', end: '11:00' }), [e({})])
  expect(w.some((i) => i.text.startsWith('Überschneidet'))).toBe(true)
})
test('Kalenderwochen', () => {
  expect(isoWeek('2026-10-27')).toBe(44)
  expect(weekStart('2026-11-01')).toBe('2026-10-26')
})

import { suggestTimes } from './time'
test('Vorschlag: erster Eintrag 10:00, danach Anschluss', () => {
  const now = new Date(2026, 9, 27, 14, 5)
  expect(suggestTimes([], '2026-10-27', now)).toEqual({ start: '10:00', end: '14:00' })
  expect(suggestTimes([e({ start: '10:00', end: '12:15' })], '2026-10-27', now)).toEqual({ start: '12:15', end: '14:00' })
  expect(suggestTimes([e({ start: '10:00', end: '12:15' }), e({ id: 'y', start: '12:15', end: '14:30' })], '2026-10-27', now)).toEqual({ start: '14:30', end: '15:30' })
  expect(suggestTimes([e({ start: '10:00', end: '12:15' })], '2026-10-26', now)).toEqual({ start: '10:00', end: '11:00' })
  expect(suggestTimes([], '2026-10-27', new Date(2026, 9, 27, 8, 30))).toEqual({ start: '10:00', end: '11:00' })
})
