import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from './components/Icon'
import { ToastHost } from './components/ui'
import { EntryEditor, blankEntry } from './components/EntryEditor'
import { Dock, TimerSheet, useStopFlow } from './components/Timer'
import { SettingsSheet } from './components/SettingsSheet'
import { LockScreen, Onboarding, PinSetup } from './components/Lock'
import { Today } from './views/Today'
import { History } from './views/History'
import { Stats } from './views/Stats'
import { Export } from './views/Export'
import { useStore, getState } from './lib/store'
import { type Entry } from './lib/time'
import { haptic, requestPersistence } from './lib/device'
import { applyTheme, watchSystemMode } from './lib/theme'

type Tab = 'today' | 'history' | 'stats' | 'export'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Heute', icon: 'today' },
  { id: 'history', label: 'Verlauf', icon: 'list' },
  { id: 'stats', label: 'Statistik', icon: 'chart' },
  { id: 'export', label: 'Export', icon: 'share' },
]

type EditState = { entry: Entry; isNew?: boolean; focus?: boolean } | null

export default function App() {
  const onboarded = useStore((s) => s.settings.onboarded)
  const lockEnabled = useStore((s) => s.settings.lockEnabled)
  const [locked, setLocked] = useState(() => getState().settings.lockEnabled)
  const [tab, setTab] = useState<Tab>('today')
  const [edit, setEdit] = useState<EditState>(null)
  const [timerOpen, setTimerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinSetup, setPinSetup] = useState(false)
  const hiddenAt = useRef<number | null>(null)

  const theme = useStore((s) => s.settings.theme)
  const appearance = useStore((s) => s.settings.appearance)

  useEffect(() => {
    requestPersistence()
  }, [])

  useEffect(() => {
    applyTheme(theme, appearance)
    return watchSystemMode(() => applyTheme(theme, appearance))
  }, [theme, appearance])

  // Erneut sperren, wenn die App länger im Hintergrund war
  useEffect(() => {
    const onVis = () => {
      const st = getState().settings
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (st.lockEnabled && hiddenAt.current !== null && Date.now() - hiddenAt.current >= st.lockAfterMin * 60_000) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const stop = useStopFlow((e) => setEdit({ entry: e, focus: true }))

  const switchTab = (t: Tab) => {
    if (t === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    haptic('light')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const apply = () => {
      flushSync(() => setTab(t))
      window.scrollTo(0, 0)
    }
    if (doc.startViewTransition && !reduce) doc.startViewTransition(apply)
    else apply()
  }

  if (!onboarded) return <Onboarding onFinish={() => setLocked(false)} />
  if (locked && lockEnabled) return <LockScreen onUnlock={() => setLocked(false)} />
  if (pinSetup) return <PinSetup onDone={() => setPinSetup(false)} onCancel={() => setPinSetup(false)} />

  const openEdit = (e: Entry) => setEdit({ entry: e })
  const openNew = (date?: string) => setEdit({ entry: blankEntry(date), isNew: true })

  return (
    <div className="app">
      <main>
        {tab === 'today' && <Today onEdit={openEdit} onNew={() => openNew()} onSettings={() => setSettingsOpen(true)} />}
        {tab === 'history' && <History onEdit={openEdit} onNew={openNew} />}
        {tab === 'stats' && <Stats />}
        {tab === 'export' && <Export onSettings={() => setSettingsOpen(true)} />}
      </main>

      <Dock onOpen={() => setTimerOpen(true)} onStop={stop} />

      <nav className="tabbar" role="tablist" aria-label="Bereiche">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}>
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>

      <TimerSheet open={timerOpen} onClose={() => setTimerOpen(false)} onStop={stop} />
      <EntryEditor entry={edit?.entry ?? null} isNew={edit?.isNew} focusDetails={edit?.focus} onClose={() => setEdit(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onSetupPin={() => { setSettingsOpen(false); setPinSetup(true) }} />
      <ToastHost />
    </div>
  )
}
