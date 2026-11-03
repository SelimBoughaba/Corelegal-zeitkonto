import { parseDictation, germanNumber, normalizeNumbers, parseTime, parseDuration, type ParseContext } from './dictation'
import type { Entry } from './time'

const CATS = ['Recherche', 'Schriftsatz', 'Prompt-Bibliothek', 'Orga', 'Sonstiges']
const ctx = (p: Partial<ParseContext> = {}): ParseContext => ({ today: '2026-11-03', defaultDate: '2026-11-03', categories: CATS, entries: [], ...p })
const ex = (p: Partial<Entry>): Entry => ({ id: 'x', date: '2026-11-03', start: '10:00', end: '12:15', pauses: [], akte: '121/26', category: 'Recherche', description: '', source: 'manual', createdAt: 0, updatedAt: 0, ...p })
const short = (text: string, c = ctx()) =>
  parseDictation(text, c).map((d) => ({
    date: d.entry.date,
    von: d.entry.start,
    bis: d.entry.end,
    pausen: d.entry.pauses.map((p) => `${p.start}-${p.end}`),
    akte: d.entry.akte,
    kat: d.entry.category,
    text: d.entry.description,
    unsicher: d.uncertain,
  }))

describe('Bausteine', () => {
  test('Zahlwörter', () => {
    expect(germanNumber('hunderteinundzwanzig')).toBe(121)
    expect(germanNumber('sechsundzwanzig')).toBe(26)
    expect(germanNumber('zwölf')).toBe(12)
    expect(germanNumber('zweitausendsechsundzwanzig')).toBe(2026)
    expect(germanNumber('gutachten')).toBeNull()
    expect(normalizeNumbers('von zehn bis zwölf Uhr ein Gutachten')).toBe('von 10 bis 12 Uhr ein Gutachten')
    expect(normalizeNumbers('eine Stunde')).toBe('1 Stunde')
  })
  test('Uhrzeiten', () => {
    expect(parseTime('12:15')?.min).toBe(735)
    expect(parseTime('12.15 Uhr')?.min).toBe(735)
    expect(parseTime('10 Uhr 30')?.min).toBe(630)
    expect(parseTime('halb 11')?.min).toBe(630)
    expect(parseTime('viertel nach 10')?.min).toBe(615)
    expect(parseTime('viertel vor 11')?.min).toBe(645)
    expect(parseTime('viertel 11')?.min).toBe(615) // bairisch
    expect(parseTime('dreiviertel 11')?.min).toBe(645)
  })
  test('Dauer', () => {
    expect(parseDuration('2 Stunden')).toBe(120)
    expect(parseDuration('1,5 Stunden')).toBe(90)
    expect(parseDuration('anderthalb Stunden')).toBe(90)
    expect(parseDuration('halbe Stunde')).toBe(30)
    expect(parseDuration('45 Minuten')).toBe(45)
    expect(parseDuration('2 Stunden 15 Minuten')).toBe(135)
  })
})

describe('Diktate', () => {
  test('Standardsatz mit Akte und Kategorie', () => {
    expect(short('Heute von 10 bis 12:15 Akte 121/26 Recherche zu Ausschlussfristen')).toEqual([
      { date: '2026-11-03', von: '10:00', bis: '12:15', pausen: [], akte: '121/26', kat: 'Recherche', text: 'Ausschlussfristen', unsicher: [] },
    ])
  })

  test('"121 aus 26" und ausgeschriebene Zahlen', () => {
    const r = short('von zehn bis zwölf Uhr Akte hunderteinundzwanzig aus sechsundzwanzig Kategorie Schriftsatz Entwurf Klageerwiderung')
    expect(r[0]).toMatchObject({ von: '10:00', bis: '12:00', akte: '121/26', kat: 'Schriftsatz', text: 'Entwurf Klageerwiderung' })
    expect(short('Akte 121 aus 26 von 10 bis 11 Orga')[0].akte).toBe('121/26')
    expect(short('Akte 121 Strich 26 von 10 bis 11 Orga')[0].akte).toBe('121/26')
  })

  test('Mehrere Einträge mit "danach" und Anschlusszeit', () => {
    const r = short('Von 10 bis 12:15 Akte 121/26 Recherche Ausschlussfristen, danach bis 14 Uhr Schriftsatz in 117/26 Entwurf Berufungsbegründung.')
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ von: '10:00', bis: '12:15', akte: '121/26', kat: 'Recherche', text: 'Ausschlussfristen' })
    expect(r[1]).toMatchObject({ von: '12:15', bis: '14:00', akte: '117/26', kat: 'Schriftsatz', text: 'Entwurf Berufungsbegründung' })
  })

  test('Sätze getrennt durch Punkt', () => {
    const r = short('10 bis 11 Uhr Orga Postfach sortiert. 11 bis 13 Uhr Akte 98/26 Recherche Rechtsprechung zum Widerruf.')
    expect(r.map((x) => [x.von, x.bis, x.kat, x.akte])).toEqual([
      ['10:00', '11:00', 'Orga', ''],
      ['11:00', '13:00', 'Recherche', '98/26'],
    ])
  })

  test('Nachmittag ohne Angabe: "von 10 bis 2" wird 14 Uhr', () => {
    const r = short('von 10 bis 2 Recherche Akte 121/26')
    expect(r[0]).toMatchObject({ von: '10:00', bis: '14:00' })
    expect(r[0].unsicher).toContain('end')
  })

  test('Dauer statt Endzeit, Start schließt an bestehende Einträge an', () => {
    const r = short('2 Stunden Prompt Bibliothek Prompts für NDA getestet', ctx({ entries: [ex({ start: '10:00', end: '12:15' })] }))
    expect(r[0]).toMatchObject({ von: '12:15', bis: '14:15', kat: 'Prompt-Bibliothek', text: 'Prompts für NDA getestet' })
  })

  test('Erster Eintrag ohne Zeit beginnt um 10', () => {
    const r = short('eine halbe Stunde Orga Fristen eingetragen')
    expect(r[0]).toMatchObject({ von: '10:00', bis: '10:30', kat: 'Orga' })
  })

  test('Pause mit Uhrzeit', () => {
    const r = short('von 10 bis 15 Uhr Akte 117/26 Schriftsatz mit Pause von 12:30 bis 13 Uhr')
    expect(r[0]).toMatchObject({ von: '10:00', bis: '15:00', pausen: ['12:30-13:00'], text: '' })
  })

  test('Pause als Dauer', () => {
    const r = short('von 10 bis 16 Uhr Recherche Akte 121/26 30 Minuten Pause')
    expect(r[0].pausen).toEqual(['12:45-13:15'])
    expect(r[0].unsicher).toContain('pauses')
  })

  test('Mittagspause als eigener Abschnitt verschiebt den Anschluss', () => {
    const r = short('Von 10 bis 12 Uhr Recherche in 121/26, dann Mittagspause bis halb 1, danach bis 15 Uhr Schriftsatz 117/26')
    expect(r.map((x) => [x.von, x.bis, x.kat])).toEqual([
      ['10:00', '12:00', 'Recherche'],
      ['12:30', '15:00', 'Schriftsatz'],
    ])
  })

  test('Gestern und Wochentag', () => {
    expect(short('gestern von 10 bis 12 Orga')[0].date).toBe('2026-11-02')
    expect(short('am Donnerstag von 10 bis 12 Orga')[0].date).toBe('2026-10-29')
    expect(short('am 27.10. von 10 bis 12 Orga')[0].date).toBe('2026-10-27')
    expect(short('am 27. Oktober von 10 bis 12 Orga')[0].date).toBe('2026-10-27')
  })

  test('Datum gilt für folgende Einträge weiter', () => {
    const r = short('Am Donnerstag von 10 bis 12 Orga, danach bis 13 Uhr Recherche 121/26')
    expect(r.map((x) => x.date)).toEqual(['2026-10-29', '2026-10-29'])
    expect(r[1].von).toBe('12:00')
  })

  test('halb und viertel', () => {
    expect(short('von halb 11 bis viertel nach 12 Recherche')[0]).toMatchObject({ von: '10:30', bis: '12:15' })
  })

  test('Kategorie mit Diktatfehler wird erkannt, aber markiert', () => {
    const r = short('von 10 bis 11 Schriftsätze für 117/26')
    expect(r[0].kat).toBe('Schriftsatz')
    expect(r[0].unsicher).toContain('category')
  })

  test('Fehlende Kategorie bleibt leer', () => {
    expect(short('von 10 bis 11 Akte 121/26 Telefonat')[0].kat).toBe('')
  })

  test('Bis-Zeit allein schließt an', () => {
    const r = short('bis 13:30 Recherche 121/26', ctx({ entries: [ex({ start: '10:00', end: '12:15' })] }))
    expect(r[0]).toMatchObject({ von: '12:15', bis: '13:30' })
  })

  test('Beschreibung ohne Füllwörter', () => {
    const r = short('Heute habe ich von 10 bis 12 Uhr in der Akte 121/26 Recherche gemacht und zwar zu Ausschlussfristen im Arbeitsvertrag')
    expect(r[0].text).toBe('Ausschlussfristen im Arbeitsvertrag')
  })

  test('Zeilenformat aus dem KI-Kurzbefehl', () => {
    const r = short(
      '03.11.2026 | 10:00 | 12:15 | keine | 121/26 | Recherche | Ausschlussfristen\n03.11.2026 | 12:15 | 15:00 | 13:00-13:30 | 117/26 | Schriftsatz | Entwurf Berufungsbegründung',
    )
    expect(r).toEqual([
      { date: '2026-11-03', von: '10:00', bis: '12:15', pausen: [], akte: '121/26', kat: 'Recherche', text: 'Ausschlussfristen', unsicher: [] },
      { date: '2026-11-03', von: '12:15', bis: '15:00', pausen: ['13:00-13:30'], akte: '117/26', kat: 'Schriftsatz', text: 'Entwurf Berufungsbegründung', unsicher: [] },
    ])
  })

  test('Typische Diktat-Varianten', () => {
    expect(short('10:00 Uhr bis 12:15 Uhr Akte Nummer 121/26 recherche')[0]).toMatchObject({ von: '10:00', bis: '12:15', akte: '121/26', kat: 'Recherche' })
    expect(short('von 10 Uhr bis 12 Uhr 30 Orga')[0]).toMatchObject({ von: '10:00', bis: '12:30' })
    expect(short('10-12 Prompt-Bibliothek Vorlagen ergänzt')[0]).toMatchObject({ von: '10:00', bis: '12:00', kat: 'Prompt-Bibliothek', text: 'Vorlagen ergänzt' })
    expect(short('ab 10 Uhr 2 Stunden Schriftsatz für Akte 117/26')[0]).toMatchObject({ von: '10:00', bis: '12:00', akte: '117/26', text: '' })
    expect(short('von 10 bis 12 Recherche 2 Verträge geprüft')[0]).toMatchObject({ von: '10:00', bis: '12:00', text: '2 Verträge geprüft' })
    expect(short('Akte 2026 aus 26 von 10 bis 11 Orga')[0].akte).toBe('2026/26')
  })

  test('Drei Einträge in einem Diktat', () => {
    const r = short('Heute von 10 bis 11 Orga Postfach. Dann bis 13 Uhr Recherche in 121/26 zu Verjährung. Anschließend eine Stunde Schriftsatz 117/26 Entwurf.')
    expect(r.map((x) => `${x.von}-${x.bis} ${x.kat} ${x.akte} ${x.text}`.trim())).toEqual([
      '10:00-11:00 Orga  Postfach',
      '11:00-13:00 Recherche 121/26 Verjährung',
      '13:00-14:00 Schriftsatz 117/26 Entwurf',
    ])
  })

  test('Leerer oder sinnloser Text', () => {
    expect(short('')).toEqual([])
    const r = parseDictation('Hallo', ctx())
    expect(r).toHaveLength(1)
    expect(r[0].uncertain).toEqual(expect.arrayContaining(['start', 'end']))
  })
})
