import { useRef, useState } from 'react'
import { Sheet, Switch, Segmented, showToast } from './ui'
import { THEMES } from '../lib/theme'
import { Icon } from './Icon'
import { actions, useStore, DEFAULT_CATEGORIES } from '../lib/store'
import { faceIdAvailable, registerFaceId, shareFile, haptic } from '../lib/device'
import { todayKey } from '../lib/time'

export function SettingsSheet({ open, onClose, onSetupPin }: { open: boolean; onClose: () => void; onSetupPin: () => void }) {
  const s = useStore((x) => x.settings)
  const count = useStore((x) => x.entries.length)
  const [newCat, setNewCat] = useState('')
  const [confirmWipe, setConfirmWipe] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const addCat = () => {
    const c = newCat.trim()
    if (!c || s.categories.includes(c)) return
    actions.updateSettings({ categories: [...s.categories, c] })
    setNewCat('')
    haptic('light')
  }

  const toggleFace = async (on: boolean) => {
    if (!on) return actions.updateSettings({ faceIdCredential: null })
    if (!(await faceIdAvailable())) return showToast('Face ID ist auf diesem Gerät nicht verfügbar')
    try {
      actions.updateSettings({ faceIdCredential: await registerFaceId() })
      showToast('Face ID aktiviert')
    } catch {
      showToast('Face ID wurde nicht eingerichtet')
    }
  }

  const backup = async () => {
    const blob = new Blob([actions.exportBackup()], { type: 'application/json' })
    await shareFile(blob, `Zeiten_Backup_${todayKey()}.json`)
  }

  const restore = async (f: File) => {
    try {
      const n = actions.importBackup(JSON.parse(await f.text()))
      showToast(`${n} Einträge importiert`)
    } catch (e) {
      showToast((e as Error).message || 'Datei konnte nicht gelesen werden')
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Einstellungen" left={<span />} right={<button className="link-btn primary" onClick={onClose}>Fertig</button>}>
      <span className="form-label">Darstellung</span>
      <Segmented<'auto' | 'light' | 'dark'>
        label="Hell oder dunkel"
        value={s.appearance}
        onChange={(v) => actions.updateSettings({ appearance: v })}
        options={[
          { value: 'auto', label: 'Automatisch' },
          { value: 'light', label: 'Hell' },
          { value: 'dark', label: 'Dunkel' },
        ]}
      />
      <div className="themes" style={{ marginTop: 12 }} role="group" aria-label="Farbpalette">
        {THEMES.map((t) => (
          <button key={t.id} className="theme-opt" aria-pressed={s.theme === t.id} onClick={() => { actions.updateSettings({ theme: t.id }); haptic('light') }}>
            <span className="theme-swatch" aria-hidden>
              {t.swatch.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            <b>{t.name}</b>
            <span>{t.desc}</span>
          </button>
        ))}
      </div>

      <span className="form-label">Nachweis</span>
      <div className="group">
        <label className="row">
          <span className="row-label">Dein Name</span>
          <input className="inline" value={s.name} placeholder="für den Excel-Nachweis" onChange={(e) => actions.updateSettings({ name: e.target.value })} autoComplete="name" />
        </label>
      </div>

      <span className="form-label">Timer</span>
      <div className="group">
        <div className="row">
          <span className="row-label">
            Auf 15 Minuten runden
            <div className="faint" style={{ fontSize: 13 }}>Beginn, Ende und Pausen beim Stoppen. Manuelle Zeiten bleiben exakt.</div>
          </span>
          <Switch label="Auf 15 Minuten runden" checked={s.roundTimer} onChange={(v) => actions.updateSettings({ roundTimer: v })} />
        </div>
        <label className="row">
          <span className="row-label">Wochenlimit</span>
          <select
            className="inline"
            value={s.weeklyLimit ?? 0}
            onChange={(e) => actions.updateSettings({ weeklyLimit: Number(e.target.value) || null })}
          >
            <option value={0}>Aus</option>
            {[10, 12, 15, 16, 18, 20, 25, 30, 40].map((h) => (
              <option key={h} value={h}>{h} Stunden</option>
            ))}
          </select>
        </label>
      </div>

      <span className="form-label">Kategorien</span>
      <div className="group">
        {s.categories.map((c) => (
          <div className="row" key={c}>
            <span className="row-label">{c}</span>
            {s.categories.length > 1 && (
              <button className="icon-btn" style={{ width: 36, height: 36, background: 'none' }} aria-label={`${c} entfernen`} onClick={() => actions.updateSettings({ categories: s.categories.filter((x) => x !== c) })}>
                <Icon name="x" />
              </button>
            )}
          </div>
        ))}
        <div className="row">
          <input
            className="row-label"
            style={{ background: 'none', border: 0, outline: 'none', fontSize: 17, padding: '8px 0' }}
            placeholder="Neue Kategorie"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCat()}
            enterKeyHint="done"
            aria-label="Neue Kategorie"
          />
          <button className="link-btn" onClick={addCat} disabled={!newCat.trim()}>Hinzufügen</button>
        </div>
      </div>
      {s.categories.join() !== DEFAULT_CATEGORIES.join() && (
        <button className="link-btn" onClick={() => actions.updateSettings({ categories: DEFAULT_CATEGORIES })}>Standard wiederherstellen</button>
      )}

      <span className="form-label">Sicherheit</span>
      <div className="group">
        <div className="row">
          <span className="row-label">App mit Code sperren</span>
          <Switch
            label="App mit Code sperren"
            checked={s.lockEnabled}
            onChange={(v) => (v ? onSetupPin() : actions.updateSettings({ lockEnabled: false, pinHash: null, pinSalt: null, faceIdCredential: null }))}
          />
        </div>
        {s.lockEnabled && (
          <>
            <div className="row">
              <span className="row-label">Face ID</span>
              <Switch label="Face ID" checked={!!s.faceIdCredential} onChange={toggleFace} />
            </div>
            <label className="row">
              <span className="row-label">Sperren nach</span>
              <select className="inline" value={s.lockAfterMin} onChange={(e) => actions.updateSettings({ lockAfterMin: Number(e.target.value) })}>
                <option value={0}>Sofort</option>
                <option value={1}>1 Minute</option>
                <option value={5}>5 Minuten</option>
                <option value={15}>15 Minuten</option>
              </select>
            </label>
            <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={onSetupPin}>
              <span className="row-label">Code ändern</span>
              <Icon name="right" />
            </button>
          </>
        )}
      </div>
      <p className="hint">Die Sperre schützt vor neugierigen Blicken. Die Daten selbst liegen unverschlüsselt im Speicher dieser App auf deinem iPhone.</p>

      <span className="form-label">Daten ({count} Einträge)</span>
      <div className="group">
        <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={backup}>
          <span className="row-label">Backup sichern</span>
          <Icon name="share" />
        </button>
        <button className="row" style={{ width: '100%', textAlign: 'left' }} onClick={() => fileRef.current?.click()}>
          <span className="row-label">Backup einspielen</span>
          <Icon name="doc" />
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
        <button className="row" style={{ width: '100%', textAlign: 'left', color: 'var(--danger)' }} onClick={() => setConfirmWipe(true)}>
          <span className="row-label">Alle Einträge löschen</span>
          <Icon name="trash" />
        </button>
      </div>
      {confirmWipe && (
        <div className="issue error" style={{ flexDirection: 'column' }} role="alertdialog" aria-label="Alle Einträge löschen">
          <span>Alle {count} Einträge werden endgültig gelöscht. Das lässt sich nicht rückgängig machen. Sichere vorher ein Backup.</span>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button className="btn block" style={{ minHeight: 44 }} onClick={() => setConfirmWipe(false)}>Abbrechen</button>
            <button className="btn block" style={{ minHeight: 44, background: 'var(--danger)', color: 'var(--on-danger)' }} onClick={() => { actions.wipeAll(); setConfirmWipe(false); showToast('Alle Einträge gelöscht') }}>
              Endgültig löschen
            </button>
          </div>
        </div>
      )}
      <p className="hint">Backups enthalten keine Sperrdaten. Bewahre sie wie den Excel-Export vertraulich auf.</p>
    </Sheet>
  )
}
