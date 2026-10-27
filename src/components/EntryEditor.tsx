import { useEffect, useMemo, useState } from 'react'
import { Sheet, TimeField, showToast } from './ui'
import { Icon } from './Icon'
import { actions, recentAkten, useStore } from '../lib/store'
import { type Entry, uid, todayKey, netMinutes, pauseMinutes, fmtDur, validateEntry, toMin, fromMin, roundMin, span } from '../lib/time'
import { haptic } from '../lib/device'

export function blankEntry(date = todayKey()): Entry {
  const now = new Date()
  const end = roundMin(now.getHours() * 60 + now.getMinutes(), 15)
  const start = Math.max(0, end - 120)
  return {
    id: uid(),
    date,
    start: fromMin(start),
    end: fromMin(end),
    pauses: [],
    akte: '',
    category: 'Recherche',
    description: '',
    source: 'manual',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function AkteField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const entries = useStore((s) => s.entries)
  const recents = useMemo(() => recentAkten(entries), [entries])
  return (
    <>
      <label className="form-label" htmlFor="akte">Akte</label>
      <input
        id="akte"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Aktenzeichen, z. B. 123/26"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        enterKeyHint="next"
        autoFocus={autoFocus}
      />
      {recents.length > 0 && (
        <div className="chips" style={{ marginTop: 8 }} aria-label="Zuletzt verwendete Akten">
          {recents.map((a) => (
            <button key={a} className="chip" aria-pressed={a === value} onClick={() => { onChange(a); haptic('light') }}>
              {a}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export function CategoryField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cats = useStore((s) => s.settings.categories)
  return (
    <>
      <span className="form-label">Kategorie</span>
      <div className="chips" role="group" aria-label="Kategorie">
        {cats.map((c) => (
          <button key={c} className="chip" aria-pressed={c === value} onClick={() => { onChange(c); haptic('light') }}>
            {c}
          </button>
        ))}
      </div>
    </>
  )
}

export function EntryEditor({ entry, onClose, isNew, focusDetails }: { entry: Entry | null; onClose: () => void; isNew?: boolean; focusDetails?: boolean }) {
  const [e, setE] = useState<Entry | null>(entry)
  const all = useStore((s) => s.entries)
  useEffect(() => setE(entry), [entry])

  const issues = useMemo(() => (e ? validateEntry(e, all) : []), [e, all])
  if (!e) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const patch = (p: Partial<Entry>) => setE({ ...e, ...p })
  const hasError = issues.some((i) => i.level === 'error')

  const save = () => {
    if (hasError) {
      haptic('warning')
      return
    }
    actions.upsertEntry(e)
    haptic('success')
    showToast(isNew ? 'Eintrag hinzugefügt' : 'Änderungen gespeichert')
    onClose()
  }

  const addPause = () => {
    const s = toMin(e.start)
    const total = span(e.start, e.end)
    const mid = roundMin(s + total / 2 - 15, 15)
    patch({ pauses: [...e.pauses, { id: uid(), start: fromMin(mid), end: fromMin(mid + 30) }] })
    haptic('light')
  }

  const del = () => {
    const removed = actions.deleteEntry(e.id)
    onClose()
    if (removed) showToast('Eintrag gelöscht', { label: 'Rückgängig', run: () => actions.restoreEntry(removed) })
  }

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={isNew ? 'Neuer Eintrag' : 'Eintrag'}
      left={<button className="link-btn" onClick={onClose}>Abbrechen</button>}
      right={
        <button className="link-btn primary" onClick={save} disabled={hasError} style={{ opacity: hasError ? 0.4 : 1 }}>
          Speichern
        </button>
      }
    >
      <label className="form-label" htmlFor="datum">Tag</label>
      <input id="datum" className="field" type="date" value={e.date} onChange={(ev) => ev.target.value && patch({ date: ev.target.value })} />

      <div className="pair" style={{ marginTop: 18 }}>
        <div>
          <div className="cap">Beginn</div>
          <TimeField label="Beginn" value={e.start} onChange={(v) => patch({ start: v })} />
        </div>
        <div>
          <div className="cap">Ende</div>
          <TimeField label="Ende" value={e.end} onChange={(v) => patch({ end: v })} />
        </div>
      </div>

      <span className="form-label">Pausen</span>
      {e.pauses.length === 0 && <p className="hint" style={{ marginTop: 0 }}>Keine Pause eingetragen.</p>}
      {e.pauses.map((p, i) => (
        <div className="pause-row" key={p.id}>
          <TimeField label={`Pause ${i + 1} von`} value={p.start} onChange={(v) => patch({ pauses: e.pauses.map((x) => (x.id === p.id ? { ...x, start: v } : x)) })} />
          <TimeField label={`Pause ${i + 1} bis`} value={p.end} onChange={(v) => patch({ pauses: e.pauses.map((x) => (x.id === p.id ? { ...x, end: v } : x)) })} />
          <button className="icon-btn" aria-label={`Pause ${i + 1} entfernen`} onClick={() => patch({ pauses: e.pauses.filter((x) => x.id !== p.id) })}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 10, minHeight: 44 }} onClick={addPause}>
        <Icon name="plus" /> Pause hinzufügen
      </button>

      <div className="calc">
        <span className="muted">
          Arbeitszeit{e.pauses.length ? ` (abzgl. ${fmtDur(pauseMinutes(e))} Pause)` : ''}
        </span>
        <b className="num">{fmtDur(netMinutes(e))} h</b>
      </div>

      {issues.map((i) => (
        <div key={i.text} className={`issue ${i.level}`} role={i.level === 'error' ? 'alert' : undefined}>
          <Icon name={i.level === 'error' ? 'warn' : 'info'} />
          <span>{i.text}</span>
        </div>
      ))}

      <AkteField value={e.akte} onChange={(v) => patch({ akte: v })} autoFocus={focusDetails && !e.akte} />
      <CategoryField value={e.category} onChange={(v) => patch({ category: v })} />

      <label className="form-label" htmlFor="desc">Tätigkeitsbeschreibung</label>
      <textarea
        id="desc"
        className="field"
        value={e.description}
        onChange={(ev) => patch({ description: ev.target.value })}
        placeholder="Was hast du gemacht?"
        autoFocus={focusDetails && !!e.akte && !e.description}
      />
      <p className="hint">Nur interne Aktenzeichen und neutrale Beschreibungen, keine Mandantennamen oder vertraulichen Details.</p>

      <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
        <button className="btn primary block" onClick={save} disabled={hasError}>
          Speichern
        </button>
      </div>
      {!isNew && (
        <button className="btn danger block" style={{ marginTop: 8 }} onClick={del}>
          <Icon name="trash" /> Eintrag löschen
        </button>
      )}
    </Sheet>
  )
}
