import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, TimeField, showToast } from './ui'
import { Icon } from './Icon'
import { CategoryField } from './EntryEditor'
import { actions, useStore, getState, recentAkten } from '../lib/store'
import { parseDictation, shortcutPrompt, type Draft, type Field } from '../lib/dictation'
import { type Entry, todayKey, fmtDayShort, fmtDur, netMinutes, validateEntry } from '../lib/time'
import { haptic } from '../lib/device'

const DRAFT_KEY = 'zeiten.diktat'
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}
const writeDraft = (v: string) => {
  try {
    if (v) localStorage.setItem(DRAFT_KEY, v)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* egal */
  }
}

const EXAMPLE = 'Heute von 10 bis 12:15 Akte 121 aus 26 Recherche zu Ausschlussfristen, danach bis 14 Uhr Schriftsatz in 117/26 Entwurf Berufungsbegründung.'

type Step = 'text' | 'review' | 'help'

export function DictationSheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const [text, setText] = useState(readDraft)
  const [step, setStep] = useState<Step>('text')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [confirmUnsure, setConfirmUnsure] = useState(false)
  const [shown, setShown] = useState(date)
  if (date !== shown) {
    setShown(date)
    setStep('text')
    setConfirmUnsure(false)
  }
  const entries = useStore((s) => s.entries)
  const categories = useStore((s) => s.settings.categories)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => writeDraft(text), [text])
  useEffect(() => {
    if (date && step === 'text') setTimeout(() => ref.current?.focus(), 350)
  }, [date, step])

  const ctx = useMemo(() => ({ today: todayKey(), defaultDate: date ?? todayKey(), categories, entries }), [date, categories, entries])
  const deferred = useDeferredValue(text)
  const preview = useMemo(() => parseDictation(deferred, ctx), [deferred, ctx])

  if (!date) return null

  const review = () => {
    const d = parseDictation(text, ctx)
    if (!d.length) return
    setDrafts(d)
    setConfirmUnsure(false)
    setStep('review')
    haptic('light')
  }

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) return showToast('Die Zwischenablage ist leer')
      setText((old) => (old.trim() ? old.trim() + '\n' + t.trim() : t.trim()))
      haptic('light')
    } catch {
      showToast('Einfügen nicht erlaubt. Halte im Textfeld gedrückt und wähle „Einsetzen“.')
    }
  }

  const patch = (i: number, p: Partial<Entry>, field: Field) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, entry: { ...d.entry, ...p }, uncertain: d.uncertain.filter((f) => f !== field) } : d)))

  // Prüfung gegen bestehende Einträge und die übrigen Entwürfe
  const issues = drafts.map((d, i) => {
    const others = [...entries, ...drafts.filter((_, j) => j !== i).map((x) => x.entry)]
    const list = validateEntry(d.entry, others)
    if (!d.entry.category) list.unshift({ level: 'error', text: 'Bitte eine Kategorie wählen.' })
    return list
  })
  const errorCount = issues.filter((l) => l.some((x) => x.level === 'error')).length
  const unsureCount = drafts.reduce((s, d) => s + d.uncertain.length, 0)

  const saveAll = () => {
    if (errorCount) {
      haptic('warning')
      showToast(errorCount === 1 ? 'Ein Eintrag hat noch einen Fehler' : `${errorCount} Einträge haben noch Fehler`)
      return
    }
    if (unsureCount && !confirmUnsure) {
      setConfirmUnsure(true)
      haptic('warning')
      return
    }
    const ids = drafts.map((d) => d.entry.id)
    drafts.forEach((d) => actions.upsertEntry(d.entry))
    haptic('success')
    setText('')
    setDrafts([])
    setStep('text')
    onClose()
    showToast(ids.length === 1 ? 'Eintrag gespeichert' : `${ids.length} Einträge gespeichert`, {
      label: 'Rückgängig',
      run: () => ids.forEach((id) => actions.deleteEntry(id)),
    })
  }

  if (step === 'help') return <HelpView onBack={() => setStep('text')} onClose={onClose} categories={categories} />

  if (step === 'review') {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Prüfen"
        left={
          <button className="link-btn" onClick={() => setStep('text')}>
            Zurück
          </button>
        }
        right={
          <button className="link-btn primary" onClick={saveAll} disabled={!drafts.length}>
            Speichern
          </button>
        }
      >
        <p className="muted" style={{ margin: '2px 4px 12px', fontSize: 15 }}>
          {drafts.length === 1 ? '1 Eintrag erkannt.' : `${drafts.length} Einträge erkannt.`} Gelb markierte Felder bitte kurz prüfen.
        </p>
        {drafts.map((d, i) => (
          <DraftCard
            key={d.entry.id}
            index={i}
            draft={d}
            issues={issues[i]}
            onPatch={(p, f) => patch(i, p, f)}
            onRemove={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
          />
        ))}
        {!drafts.length && (
          <div className="group">
            <div className="empty">
              <strong>Keine Einträge übrig</strong>
              Geh zurück und diktiere neu.
            </div>
          </div>
        )}
        {drafts.length > 0 && (
          <>
            {confirmUnsure && unsureCount > 0 && (
              <div className="issue warn" role="alert">
                <Icon name="info" />
                <span>
                  {unsureCount === 1 ? 'Ein markiertes Feld ist' : `${unsureCount} markierte Felder sind`} noch ungeprüft. Tippe erneut, um trotzdem zu speichern.
                </span>
              </div>
            )}
            <button className={`btn block ${errorCount ? '' : 'lime'}`} style={{ marginTop: 14 }} onClick={saveAll}>
              <Icon name="check" />
              {errorCount
                ? `${errorCount} ${errorCount === 1 ? 'Fehler' : 'Fehler'} beheben`
                : confirmUnsure && unsureCount
                  ? 'Trotzdem speichern'
                  : drafts.length === 1
                    ? 'Eintrag speichern'
                    : `${drafts.length} Einträge speichern`}
            </button>
          </>
        )}
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Diktieren"
      left={
        <button className="link-btn" onClick={onClose}>
          Abbrechen
        </button>
      }
      right={
        <button className="link-btn primary" onClick={review} disabled={!preview.length} style={{ opacity: preview.length ? 1 : 0.4 }}>
          Prüfen
        </button>
      }
    >
      <div className="dict-hint">
        <Icon name="mic" />
        <span>
          Tippe ins Feld und dann unten auf der Tastatur auf das <b>Mikrofon</b>. Nenne Zeit, Akte und Kategorie, mehrere Tätigkeiten mit „danach“ verbinden.
        </span>
      </div>
      <textarea
        ref={ref}
        className="field dict-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
        aria-label="Diktat"
        autoCapitalize="sentences"
        enterKeyHint="done"
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn" style={{ minHeight: 40, fontSize: 15, padding: '0 14px' }} onClick={paste}>
          <Icon name="doc" /> Einfügen
        </button>
        {text && (
          <button className="btn" style={{ minHeight: 40, fontSize: 15, padding: '0 14px' }} onClick={() => setText('')}>
            <Icon name="x" /> Leeren
          </button>
        )}
      </div>

      {preview.length > 0 && (
        <>
          <span className="form-label">Erkannt</span>
          <div className="group">
            {preview.map((d) => (
              <div className="row" key={d.entry.id} style={{ alignItems: 'flex-start' }}>
                <span className="row-label">
                  <span className="num" style={{ fontWeight: 600 }}>
                    {d.entry.date !== todayKey() ? `${fmtDayShort(d.entry.date)} ` : ''}
                    {d.entry.start}–{d.entry.end}
                  </span>{' '}
                  <span className="muted">
                    {[d.entry.akte || 'ohne Akte', d.entry.category || 'Kategorie fehlt'].join(' · ')}
                  </span>
                  {d.entry.description && <span className="faint" style={{ display: 'block', fontSize: 14 }}>{d.entry.description}</span>}
                </span>
                <span className="num" style={{ fontWeight: 650 }}>
                  {fmtDur(netMinutes(d.entry))}
                </span>
                {(d.uncertain.length > 0 || !d.entry.category) && <span className="unsure-dot" aria-label="Bitte prüfen" />}
              </div>
            ))}
          </div>
          <button className="btn lime block" style={{ marginTop: 14 }} onClick={review}>
            <Icon name="check" /> Prüfen und speichern
          </button>
        </>
      )}

      <button className="dict-ai" onClick={() => setStep('help')}>
        <Icon name="sparkle" />
        <span>
          <b>Freier sprechen mit Apple Intelligence</b>
          <span className="muted">Kurzbefehl mit dem On-Device-Modell einrichten</span>
        </span>
        <Icon name="right" />
      </button>
    </Sheet>
  )
}

function DraftCard({ draft, index, issues, onPatch, onRemove }: { draft: Draft; index: number; issues: { level: 'error' | 'warn'; text: string }[]; onPatch: (p: Partial<Entry>, f: Field) => void; onRemove: () => void }) {
  const e = draft.entry
  const u = (f: Field) => (draft.uncertain.includes(f) ? 'unsure' : '')
  const entries = useStore((s) => s.entries)
  const recents = useMemo(() => recentAkten(entries, 5), [entries])
  return (
    <section className="draft" aria-label={`Eintrag ${index + 1}`}>
      <div className="draft-head">
        <b>Eintrag {index + 1}</b>
        <span className="num muted">{fmtDur(netMinutes(e))} h</span>
        <button className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`Eintrag ${index + 1} verwerfen`} onClick={onRemove}>
          <Icon name="trash" />
        </button>
      </div>
      <p className="draft-src">„{draft.source}“</p>

      <div className={`draft-field ${u('date')}`}>
        <span className="cap">Tag</span>
        <input className="field" type="date" value={e.date} onChange={(ev) => ev.target.value && onPatch({ date: ev.target.value }, 'date')} aria-label={`Tag Eintrag ${index + 1}`} />
      </div>
      <div className="pair" style={{ marginTop: 8 }}>
        <div className={`draft-field ${u('start')}`}>
          <span className="cap">Beginn</span>
          <TimeField label={`Beginn Eintrag ${index + 1}`} value={e.start} onChange={(v) => onPatch({ start: v }, 'start')} />
        </div>
        <div className={`draft-field ${u('end')}`}>
          <span className="cap">Ende</span>
          <TimeField label={`Ende Eintrag ${index + 1}`} value={e.end} onChange={(v) => onPatch({ end: v }, 'end')} />
        </div>
      </div>
      {e.pauses.length > 0 && (
        <div className={`draft-field ${u('pauses')}`} style={{ marginTop: 8 }}>
          <span className="cap">Pausen</span>
          <div className="chips" style={{ margin: 0, padding: 0 }}>
            {e.pauses.map((p) => (
              <button key={p.id} className="chip" onClick={() => onPatch({ pauses: e.pauses.filter((x) => x.id !== p.id) }, 'pauses')} aria-label={`Pause ${p.start} bis ${p.end} entfernen`}>
                <span className="num">
                  {p.start}–{p.end}
                </span>{' '}
                ✕
              </button>
            ))}
            {draft.uncertain.includes('pauses') && (
              <button className="chip" onClick={() => onPatch({}, 'pauses')}>
                Passt
              </button>
            )}
          </div>
        </div>
      )}
      <div className={`draft-field ${u('akte')}`} style={{ marginTop: 8 }}>
        <span className="cap">Akte</span>
        <input className="field" value={e.akte} placeholder="ohne Akte" onChange={(ev) => onPatch({ akte: ev.target.value }, 'akte')} autoCapitalize="characters" autoCorrect="off" aria-label={`Akte Eintrag ${index + 1}`} />
        {recents.length > 0 && !recents.includes(e.akte) && (
          <div className="chips" style={{ marginTop: 6 }}>
            {recents.map((a) => (
              <button key={a} className="chip" onClick={() => onPatch({ akte: a }, 'akte')}>
                {a}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`draft-field ${u('category')} ${!e.category ? 'missing' : ''}`}>
        <CategoryField value={e.category} onChange={(v) => onPatch({ category: v }, 'category')} />
      </div>
      <div className={`draft-field ${u('description')}`}>
        <span className="cap" style={{ marginTop: 10, display: 'block' }}>Tätigkeitsbeschreibung</span>
        <textarea className="field" style={{ minHeight: 64 }} value={e.description} onChange={(ev) => onPatch({ description: ev.target.value }, 'description')} aria-label={`Beschreibung Eintrag ${index + 1}`} />
      </div>
      {[...issues.map((x) => ({ level: x.level, text: x.text })), ...draft.notes.filter((n) => !/^Keine Kategorie/.test(n) || e.category === '').filter((n) => !/^Keine Akte/.test(n) || !e.akte).map((text) => ({ level: 'warn' as const, text }))]
        .filter((x, i, all) => all.findIndex((y) => y.text === x.text) === i)
        .map((x) => (
          <div key={x.text} className={`issue ${x.level}`}>
            <Icon name={x.level === 'error' ? 'warn' : 'info'} />
            <span>{x.text}</span>
          </div>
        ))}
    </section>
  )
}

function HelpView({ onBack, onClose, categories }: { onBack: () => void; onClose: () => void; categories: string[] }) {
  const prompt = shortcutPrompt(categories)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      haptic('success')
      showToast('Prompt kopiert')
    } catch {
      showToast('Kopieren nicht möglich. Text markieren und kopieren.')
    }
  }
  const steps: [string, string][] = [
    ['Prompt kopieren', 'Tippe unten auf „Prompt kopieren“. Er enthält deine aktuellen Kategorien.'],
    ['Kurzbefehl anlegen', 'Öffne die App Kurzbefehle, tippe auf +, nenne ihn „Zeit diktieren“.'],
    ['Text diktieren', 'Aktion „Text diktieren“ hinzufügen, Sprache Deutsch.'],
    ['Modell verwenden', 'Aktion „Modell verwenden“ hinzufügen und „On-Device“ wählen, nicht Cloud oder ChatGPT. Prompt einfügen, dann [Aktuelles Datum] durch die Variable „Aktuelles Datum“ und [Diktierter Text] durch „Diktierter Text“ ersetzen.'],
    ['In Zwischenablage', 'Aktion „In Zwischenablage kopieren“ mit der Antwort des Modells.'],
    ['Verwenden', 'Sag „Hey Siri, Zeit diktieren“ oder starte den Kurzbefehl. Danach hier in der App auf Diktieren und „Einfügen“ tippen, prüfen, speichern.'],
  ]
  return (
    <Sheet
      open
      onClose={onClose}
      title="Apple Intelligence"
      left={
        <button className="link-btn" onClick={onBack}>
          Zurück
        </button>
      }
    >
      <p className="muted" style={{ margin: '2px 4px 14px', fontSize: 15 }}>
        Das On-Device-Modell versteht frei formulierte Sätze und wandelt sie in ein festes Zeilenformat, das diese App sicher einliest. Es läuft auf deinem iPhone ohne Internet und kostet nichts. Prüfen musst du die Einträge trotzdem.
      </p>
      <div className="group">
        {steps.map(([t, d], i) => (
          <div className="row" key={t} style={{ alignItems: 'flex-start' }}>
            <span className="step-no num">{i + 1}</span>
            <span className="row-label">
              <b style={{ display: 'block' }}>{t}</b>
              <span className="muted" style={{ fontSize: 15 }}>{d}</span>
            </span>
          </div>
        ))}
      </div>
      <button className="btn lime block" style={{ marginTop: 16 }} onClick={copy}>
        <Icon name="copy" /> Prompt kopieren
      </button>
      <span className="form-label">Prompt</span>
      <pre className="prompt-box">{prompt}</pre>
      <p className="hint">
        Voraussetzung: Apple Intelligence ist eingeschaltet. Wähle bewusst „On-Device“: Bei „Cloud“ oder „ChatGPT“ würden Akte und Beschreibung das iPhone verlassen. Wenn die Ausgabe einmal nicht passt, erkennt die App den Text trotzdem mit ihren eigenen Regeln.
      </p>
    </Sheet>
  )
}

export { getState }
