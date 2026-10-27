import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { haptic } from '../lib/device'
import { stepTime } from '../lib/time'

// ---------- Sheet: Griff, nach unten wischen zum Schließen ----------

export function Sheet({
  open,
  onClose,
  title,
  left,
  right,
  children,
  label,
}: {
  open: boolean
  onClose: () => void
  title?: string
  left?: ReactNode
  right?: ReactNode
  children: ReactNode
  label?: string
}) {
  const [closing, setClosing] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y0: number; t0: number; dy: number; active: boolean } | null>(null)

  const close = () => {
    if (closing) return
    setClosing(true)
    const el = sheet.current
    if (el) {
      el.classList.add('settle')
      el.style.transform = 'translateY(100%)'
    }
    setTimeout(() => {
      setClosing(false)
      onClose()
    }, 300)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    document.body.classList.add('sheet-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      document.body.classList.remove('sheet-open')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const onDown = (e: React.PointerEvent, fromBody: boolean) => {
    if (fromBody && (body.current?.scrollTop ?? 0) > 0) return
    const t = e.target as HTMLElement
    if (fromBody && t.closest('input,textarea,select,button,.time-field,.chips')) return
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, active: !fromBody }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    if (!d.active) {
      if (dy > 10) d.active = true
      else if (dy < -4) {
        drag.current = null
        return
      } else return
    }
    d.dy = Math.max(0, dy)
    const el = sheet.current!
    el.classList.remove('settle')
    el.style.transform = `translateY(${d.dy}px)`
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !d.active) return
    const v = d.dy / Math.max(1, performance.now() - d.t0)
    const el = sheet.current!
    if (d.dy > 140 || v > 0.6) close()
    else {
      el.classList.add('settle')
      el.style.transform = ''
    }
  }

  return createPortal(
    <>
      <div className={`backdrop ${closing ? 'closing' : ''}`} onClick={close} />
      <div
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="sheet-grab" onPointerDown={(e) => onDown(e, false)} aria-hidden />
        <div className="sheet-head" onPointerDown={(e) => onDown(e, false)}>
          <div className="left">{left ?? <button className="link-btn" onClick={close}>Schließen</button>}</div>
          <h2>{title}</h2>
          <div className="right">{right}</div>
        </div>
        <div className="sheet-body" ref={body} onPointerDown={(e) => onDown(e, true)}>
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}

// ---------- Swipe-Zeile: rechts bearbeiten, links löschen ----------

export function SwipeRow({ children, onEdit, onDelete, label }: { children: ReactNode; onEdit: () => void; onDelete: () => void; label: string }) {
  const front = useRef<HTMLDivElement>(null)
  const st = useRef<{ x0: number; y0: number; dx: number; mode: 'idle' | 'h' | 'v'; base: number; armed: 0 | 1 | -1 } | null>(null)
  const [open, setOpen] = useState<0 | 1 | -1>(0)
  const [armed, setArmed] = useState<0 | 1 | -1>(0)
  const [dir, setDir] = useState<0 | 1 | -1>(0)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const set = (x: number, settle: boolean) => {
    const el = front.current
    if (!el) return
    el.classList.toggle('settle', settle)
    el.style.transform = x ? `translateX(${x}px)` : ''
    clearTimeout(resetTimer.current)
    if (x === 0) resetTimer.current = setTimeout(() => setDir(0), settle ? 400 : 0)
    else setDir(x > 0 ? 1 : -1)
  }

  const width = () => front.current?.offsetWidth ?? 360
  const REVEAL = 88

  const down = (e: React.PointerEvent) => {
    st.current = { x0: e.clientX, y0: e.clientY, dx: 0, mode: 'idle', base: open * REVEAL, armed: 0 }
  }
  const move = (e: React.PointerEvent) => {
    const s = st.current
    if (!s) return
    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    if (s.mode === 'idle') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        s.mode = 'h'
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } else if (Math.abs(dy) > 8) s.mode = 'v'
      else return
    }
    if (s.mode !== 'h') return
    let x = s.base + dx
    const w = width()
    const max = w * 0.9
    if (Math.abs(x) > max) x = Math.sign(x) * (max + (Math.abs(x) - max) * 0.2)
    s.dx = x
    const a: 0 | 1 | -1 = Math.abs(x) > w * 0.5 ? (x > 0 ? 1 : -1) : 0
    if (a !== s.armed) {
      s.armed = a
      setArmed(a)
      if (a) haptic('medium')
    }
    set(x, false)
  }
  const up = () => {
    const s = st.current
    st.current = null
    if (!s) return
    if (s.mode !== 'h') return
    setArmed(0)
    const w = width()
    if (s.armed === 1) {
      set(0, true)
      setOpen(0)
      onEdit()
    } else if (s.armed === -1) {
      set(-w, true)
      setTimeout(onDelete, 220)
    } else if (Math.abs(s.dx) > REVEAL * 0.6) {
      const dir: 1 | -1 = s.dx > 0 ? 1 : -1
      setOpen(dir)
      set(dir * REVEAL, true)
    } else {
      setOpen(0)
      set(0, true)
    }
  }

  const closeRow = () => {
    setOpen(0)
    set(0, true)
  }

  return (
    <div className={`swipe ${dir === 1 ? 'dir-r' : dir === -1 ? 'dir-l' : ''}`}>
      <div className="swipe-actions" aria-hidden={open === 0}>
        <button className={`swipe-act edit ${armed === 1 ? 'armed' : ''}`} onClick={() => { closeRow(); onEdit() }} tabIndex={open === 1 ? 0 : -1}>
          <Icon name="pencil" />
          Bearbeiten
        </button>
        <button className={`swipe-act del ${armed === -1 ? 'armed' : ''}`} onClick={() => { set(-width(), true); setTimeout(onDelete, 220) }} tabIndex={open === -1 ? 0 : -1}>
          Löschen
          <Icon name="trash" />
        </button>
      </div>
      <div
        ref={front}
        className="swipe-front"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (open !== 0) {
            e.stopPropagation()
            e.preventDefault()
            closeRow()
          }
        }}
        aria-label={label}
      >
        {children}
      </div>
    </div>
  )
}

// ---------- Toast mit Rückgängig ----------

type ToastData = { id: number; text: string; action?: { label: string; run: () => void }; leaving?: boolean }
let toast: ToastData | null = null
const tl = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
const emit = () => tl.forEach((l) => l())

export function hideToast() {
  if (!toast || toast.leaving) return
  clearTimeout(timer)
  const id = toast.id
  toast = { ...toast, leaving: true }
  emit()
  setTimeout(() => {
    if (toast?.id === id) {
      toast = null
      emit()
    }
  }, 220)
}

export function showToast(text: string, action?: ToastData['action'], ms = 4000) {
  toast = { id: Date.now(), text, action }
  emit()
  clearTimeout(timer)
  timer = setTimeout(hideToast, ms)
}

export function ToastHost() {
  const t = useSyncExternalStore(
    (l) => {
      tl.add(l)
      return () => tl.delete(l)
    },
    () => toast,
  )
  const y0 = useRef<number | null>(null)
  if (!t) return null
  return createPortal(
    <div
      className={`toast ${t.leaving ? 'out' : ''}`}
      key={t.id}
      role="status"
      aria-live="polite"
      onPointerDown={(e) => (y0.current = e.clientY)}
      onPointerUp={(e) => {
        if (y0.current !== null && Math.abs(e.clientY - y0.current) > 12) hideToast()
        y0.current = null
      }}
    >
      <span onClick={hideToast}>{t.text}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action!.run()
            hideToast()
            haptic('light')
          }}
        >
          {t.action.label}
        </button>
      )}
    </div>,
    document.body,
  )
}

// ---------- Zeitfeld mit ±15-Minuten-Stepper ----------

export function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="time-field">
      <button type="button" aria-label={`${label} 15 Minuten früher`} onClick={() => { onChange(stepTime(value, -1)); haptic('light') }}>
        <Icon name="minus" />
      </button>
      <input type="time" aria-label={label} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
      <button type="button" aria-label={`${label} 15 Minuten später`} onClick={() => { onChange(stepTime(value, 1)); haptic('light') }}>
        <Icon name="plus" />
      </button>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => { onChange(e.target.checked); haptic('light') }} />
      <i />
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => { onChange(o.value); haptic('light') }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Horizontal wischen auf einer Leiste (Monat/Woche wechseln). */
export function useHSwipe(onLeft: () => void, onRight: () => void) {
  const s = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent) => (s.current = { x: e.clientX, y: e.clientY }),
    onPointerUp: (e: React.PointerEvent) => {
      const a = s.current
      s.current = null
      if (!a) return
      const dx = e.clientX - a.x
      const dy = e.clientY - a.y
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        haptic('light')
        if (dx < 0) onLeft()
        else onRight()
      }
    },
    onPointerCancel: () => (s.current = null),
  }
}

export function useNow(intervalMs: number, active = true) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    const vis = () => setNow(Date.now())
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [intervalMs, active])
  return now
}
