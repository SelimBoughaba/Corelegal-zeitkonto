import { useSyncExternalStore } from 'react'
import { type Entry, type Session, uid, sessionToEntry, isPaused, sortEntries } from './time'

export type Settings = {
  name: string
  roundTimer: boolean
  roundStep: number
  weeklyLimit: number | null
  categories: string[]
  lockEnabled: boolean
  pinHash: string | null
  pinSalt: string | null
  faceIdCredential: string | null
  lockAfterMin: number
  onboarded: boolean
  theme: ThemeId
  appearance: 'auto' | 'light' | 'dark'
}

export type ThemeId = 'americano' | 'urban' | 'sun' | 'mocha'

export type Draft = { akte: string; category: string; description: string }

export type State = {
  version: 1
  entries: Entry[]
  session: Session | null
  draft: Draft
  settings: Settings
}

const KEY = 'corelegal-zeiten.v1'

export const DEFAULT_CATEGORIES = ['Recherche', 'Schriftsatz', 'Prompt-Bibliothek', 'Orga', 'Sonstiges']

const initial: State = {
  version: 1,
  entries: [],
  session: null,
  draft: { akte: '', category: 'Recherche', description: '' },
  settings: {
    name: '',
    roundTimer: true,
    roundStep: 15,
    weeklyLimit: 20,
    categories: DEFAULT_CATEGORIES,
    lockEnabled: false,
    pinHash: null,
    pinSalt: null,
    faceIdCredential: null,
    lockAfterMin: 1,
    onboarded: false,
    theme: 'americano',
    appearance: 'auto',
  },
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return initial
    const parsed = JSON.parse(raw) as State
    return { ...initial, ...parsed, settings: { ...initial.settings, ...parsed.settings }, draft: { ...initial.draft, ...parsed.draft } }
  } catch {
    return initial
  }
}

let state: State = typeof localStorage === 'undefined' ? initial : load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* Speicher voll oder gesperrt: Zustand bleibt im Arbeitsspeicher */
  }
}

function set(fn: (s: State) => State) {
  state = fn(state)
  persist()
  listeners.forEach((l) => l())
}

export const getState = () => state

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sel(state),
  )
}

// Mehrere Tabs: Änderungen aus anderen Fenstern übernehmen
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      state = load()
      listeners.forEach((l) => l())
    }
  })
}

// ---------- Aktionen ----------

export const actions = {
  startTimer() {
    if (state.session) return
    const d = state.draft
    set((s) => ({ ...s, session: { id: uid(), startedAt: Date.now(), pauses: [], akte: d.akte, category: d.category, description: d.description } }))
  },

  togglePause() {
    const s0 = state.session
    if (!s0) return
    const now = Date.now()
    const pauses = isPaused(s0)
      ? s0.pauses.map((p, i) => (i === s0.pauses.length - 1 ? { ...p, end: now } : p))
      : [...s0.pauses, { start: now, end: null }]
    set((s) => ({ ...s, session: { ...s0, pauses } }))
  },

  /** Beendet den Timer. Idempotent über die Sitzungs-ID: doppelt tippen erzeugt keinen zweiten Eintrag. */
  stopTimer(): { entry: Entry; session: Session } | null {
    const s0 = state.session
    if (!s0) return null
    if (state.entries.some((e) => e.id === s0.id)) {
      set((s) => ({ ...s, session: null }))
      return null
    }
    const step = state.settings.roundTimer ? state.settings.roundStep : 1
    const entry = sessionToEntry(s0, Date.now(), step)
    set((s) => ({
      ...s,
      session: null,
      entries: sortEntries([...s.entries, entry]),
      draft: { akte: '', category: s0.category, description: '' },
    }))
    return { entry, session: s0 }
  },

  /** Rückgängig nach Stopp: Eintrag entfernen, Timer läuft weiter. */
  resumeSession(session: Session) {
    set((s) => ({ ...s, session, entries: s.entries.filter((e) => e.id !== session.id) }))
  },

  discardTimer() {
    set((s) => ({ ...s, session: null }))
  },

  updateSession(patch: Partial<Pick<Session, 'akte' | 'category' | 'description' | 'startedAt'>>) {
    if (!state.session) return
    set((s) => ({ ...s, session: s.session ? { ...s.session, ...patch } : null }))
  },

  updateDraft(patch: Partial<Draft>) {
    set((s) => ({ ...s, draft: { ...s.draft, ...patch } }))
  },

  upsertEntry(e: Entry) {
    const t = Date.now()
    set((s) => {
      const exists = s.entries.some((x) => x.id === e.id)
      const next = exists ? s.entries.map((x) => (x.id === e.id ? { ...e, updatedAt: t } : x)) : [...s.entries, { ...e, createdAt: t, updatedAt: t }]
      return { ...s, entries: sortEntries(next) }
    })
  },

  deleteEntry(id: string): Entry | null {
    const e = state.entries.find((x) => x.id === id) ?? null
    set((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== id) }))
    return e
  },

  restoreEntry(e: Entry) {
    set((s) => ({ ...s, entries: sortEntries([...s.entries.filter((x) => x.id !== e.id), e]) }))
  },

  duplicateEntry(id: string, date: string): Entry | null {
    const src = state.entries.find((x) => x.id === id)
    if (!src) return null
    const t = Date.now()
    const copy: Entry = { ...src, id: uid(), date, pauses: src.pauses.map((p) => ({ ...p, id: uid() })), source: 'manual', createdAt: t, updatedAt: t }
    set((s) => ({ ...s, entries: sortEntries([...s.entries, copy]) }))
    return copy
  },

  updateSettings(patch: Partial<Settings>) {
    set((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  },

  importBackup(data: unknown): number {
    const d = data as Partial<State>
    if (!d || !Array.isArray(d.entries)) throw new Error('Die Datei enthält keine Einträge aus dieser App.')
    const valid = d.entries.filter((e) => e && typeof e.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && /^\d{2}:\d{2}$/.test(e.start) && /^\d{2}:\d{2}$/.test(e.end))
    set((s) => {
      const map = new Map(s.entries.map((e) => [e.id, e]))
      valid.forEach((e) => map.set(e.id, { ...e, pauses: Array.isArray(e.pauses) ? e.pauses : [] }))
      return { ...s, entries: sortEntries([...map.values()]) }
    })
    return valid.length
  },

  exportBackup(): string {
    const { settings, ...rest } = state
    const safeSettings = { ...settings, pinHash: null, pinSalt: null, faceIdCredential: null, lockEnabled: false }
    return JSON.stringify({ ...rest, settings: safeSettings, exportedAt: new Date().toISOString() }, null, 2)
  },

  wipeAll() {
    set(() => ({ ...initial, settings: { ...initial.settings, onboarded: true } }))
  },
}

/** Zuletzt benutzte Akten, neueste zuerst */
export function recentAkten(entries: Entry[], limit = 6): string[] {
  const seen: string[] = []
  const byUse = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
  for (let i = 0; i < byUse.length && seen.length < limit; i++) {
    const a = byUse[i].akte.trim()
    if (a && !seen.includes(a)) seen.push(a)
  }
  return seen
}
