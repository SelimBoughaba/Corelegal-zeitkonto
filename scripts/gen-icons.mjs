// Erzeugt die App-Icons beim Build (keine Binärdateien im Repo nötig)
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

function icon(size, pad = 0) {
  const bg = hex('#1E1D1D'), ring = hex('#F3F1E8'), lime = hex('#E9FF27')
  const S = 4 // Supersampling
  const c = size / 2, r = size * 0.3 * (1 - pad), w = size * 0.07 * (1 - pad), dot = size * 0.055 * (1 - pad)
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S
          const d = Math.hypot(px - c, py - c)
          let col = bg
          if (Math.abs(d - (r - w / 2)) <= w / 2) col = ring
          const inHand = Math.abs(px - c) <= w / 2 && py <= c && py >= c - r * 0.7
          const capTop = Math.hypot(px - c, py - (c - r * 0.7)) <= w / 2
          if (inHand || capTop || d <= dot) col = lime
          acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]
        }
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = acc[0] / (S * S); raw[o + 1] = acc[1] / (S * S); raw[o + 2] = acc[2] / (S * S)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/apple-touch-icon.png', icon(180))
writeFileSync('public/icons/icon-192.png', icon(192))
writeFileSync('public/icons/icon-512.png', icon(512, 0.15))
console.log('Icons erzeugt')
