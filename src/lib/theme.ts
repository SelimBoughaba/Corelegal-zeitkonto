import type { ThemeId } from './store'

export const THEMES: { id: ThemeId; name: string; desc: string; swatch: string[]; bg: { light: string; dark: string } }[] = [
  { id: 'americano', name: 'Americano', desc: 'Kaffeetöne, Neon Lime', swatch: ['#1e1d1d', '#5a4d41', '#e6e2d6', '#e9ff27'], bg: { light: '#f3f1e8', dark: '#1e1d1d' } },
  { id: 'urban', name: 'Urban', desc: 'Urban Gray, Neon Lime', swatch: ['#1c1c1c', '#b2b2b2', '#f4f4f2', '#e9ff27'], bg: { light: '#f4f4f2', dark: '#1c1c1c' } },
  { id: 'sun', name: 'Sun & Pool', desc: 'Strength, Sun, Pool', swatch: ['#000000', '#75705f', '#cddfda', '#f0ea7e'], bg: { light: '#f3f1e8', dark: '#141414' } },
  { id: 'mocha', name: 'Mocha', desc: 'Espresso, Chai, Leinen', swatch: ['#2c1917', '#7e6957', '#c2bca9', '#e6e2d6'], bg: { light: '#e6e2d6', dark: '#1a181a' } },
]

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function applyTheme(theme: ThemeId, appearance: 'auto' | 'light' | 'dark') {
  const mode = appearance === 'auto' ? (mq?.matches ? 'dark' : 'light') : appearance
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.mode = mode
  const t = THEMES.find((x) => x.id === theme) ?? THEMES[0]
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = t.bg[mode]
  document.head.appendChild(meta)
}

export function watchSystemMode(cb: () => void) {
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
