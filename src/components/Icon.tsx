const P: Record<string, string> = {
  play: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z',
  pause: 'M7 5h3.2v14H7zM13.8 5H17v14h-3.2z',
  stop: 'M6.5 6.5h11v11h-11z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  gear: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Zm7.4-1.9 1.6 1.3-1.8 3.1-2-.7a7.6 7.6 0 0 1-1.8 1l-.3 2.1h-3.6l-.3-2.1a7.6 7.6 0 0 1-1.8-1l-2 .7-1.8-3.1 1.6-1.3a7.8 7.8 0 0 1 0-2.6L3 9.4l1.8-3.1 2 .7a7.6 7.6 0 0 1 1.8-1L8.9 4h3.6l.3 2.1a7.6 7.6 0 0 1 1.8 1l2-.7 1.8 3.1-1.6 1.3a7.8 7.8 0 0 1 0 2.6Z',
  trash: 'M4.5 7h15M9.5 7V5h5v2M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6',
  pencil: 'M4.5 19.5l1-4 10-10 3 3-10 10-4 1ZM13.5 7.5l3 3',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  today: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  list: 'M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01',
  chart: 'M4.5 20V13M9.5 20V8M14.5 20v-5M19.5 20V4',
  share: 'M12 15V3.5M8 7.5l4-4 4 4M6 11H5v9.5h14V11h-1',
  faceid: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8.5 9v1.5M15.5 9v1.5M12 9v4h-1M9 16a4.5 4.5 0 0 0 6 0',
  lock: 'M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v10h-13z',
  home: 'M12 3.5v11M8 7.5l4-4 4 4M5 13v7.5h14V13',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M8.5 8.5h11v11h-11zM15.5 8.5v-4h-11v11h4',
  warn: 'M12 4l9 15.5H3L12 4ZM12 10v4M12 17h.01',
  back: 'M21 7v10H9l-5-5 5-5h12ZM12.5 9.5l5 5M17.5 9.5l-5 5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  doc: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.5h.01',
}

const FILLED = new Set(['play', 'pause', 'stop'])

export function Icon({ name, label }: { name: keyof typeof P | string; label?: string }) {
  const filled = FILLED.has(name)
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path d={P[name]} />
    </svg>
  )
}
