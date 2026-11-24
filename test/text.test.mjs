// node test/text.test.mjs
import assert from 'assert'
import { readFileSync } from 'fs'

const src = readFileSync(new URL('../src/lib/text.js', import.meta.url), 'utf8')
const T = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))

const enc1255 = s => Uint8Array.from([...s].map(c => {
  const n = c.charCodeAt(0)
  return n >= 0x5d0 && n <= 0x5ea ? n - 0x5d0 + 0xe0 : n >= 0x5b0 && n <= 0x5bc ? n - 0x5b0 + 0xc0 : n === 0x5c1 ? 0xd1 : n
}))
const utf8 = s => new Uint8Array(Buffer.from(s, 'utf8'))
const u16le = s => new Uint8Array(Buffer.from('﻿' + s, 'utf16le'))
const u16be = s => new Uint8Array(Buffer.from('﻿' + s, 'utf16le').swap16())
const body = Array.from({ length: 300 }, (_, i) => 'שורה ' + i + ' עם מילים רבות, בְּרֵאשִׁית בָּרָא ושלום עולם').join('\r\n')
const cases = [
  ['utf8', utf8(body)], ['utf8', utf8('﻿' + body)], ['utf16le', u16le(body)],
  ['utf16be', u16be(body)], ['cp1255', enc1255(body)]
]
for (const [name, bytes] of cases) {
  const samples = [1, 2, 3].map(i => bytes.subarray(Math.floor(bytes.length * i / 4)).subarray(0, 1024))
  const d = T.detect(bytes.subarray(0, 2048), samples)
  assert.equal(d.enc, name)
  // Pages tile the file exactly.
  const n = T.pageCount(bytes.length)
  let end = d.bom
  let all = ''
  for (let k = 0; k < n; k++) {
    const base = k * T.PAGE
    const w = bytes.subarray(base, base + T.PAGE + T.MARGIN)
    const from = k ? T.boundary(w, d.enc, base, 0) : d.bom
    const to = k === n - 1 ? w.length : T.boundary(w, d.enc, base, T.PAGE)
    assert.equal(base + from, end)
    end = base + to
    all += T.paragraphs(w, d.enc, base, Math.min(from, to), to).map(p => p.text).join('')
  }
  assert.equal(end, bytes.length)
  assert.equal(all.replace(/\s/g, ''), body.replace(/\s/g, ''))
  // Matches map back to the right bytes, with niqqud and final letters folded.
  const m = T.matches(T.foldChunk(bytes, d.enc, 0, d.bom, bytes.length), T.normalizeQuery('בראשית ברא'), 0, 999)
  assert.equal(m.length, 300)
  assert.ok(T.snippet(bytes, d.enc, 0, m[7].offset).includes('ושלום'))
}
assert.equal(T.normalizeQuery(' שלום  "עולם" '), 'שלומ עולמ')
// No white space at all: the boundary is the first whole character.
const solid = utf8('א'.repeat(2000))
assert.equal(T.boundary(solid.subarray(1000, 2160), 'utf8', 1000, 0), 0)
assert.equal(T.boundary(solid.subarray(1001, 2161), 'utf8', 1001, 0), 1)
// Performance guard for the watch: 1 MB in node.
const t0 = Date.now()
const big = utf8(body.repeat(40)).subarray(0, 1 << 20)
T.matches(T.foldChunk(big, 'utf8', 0, 0, big.length), 'xyz', 0, 10)
console.log('ok, 1 MB fold ms:', Date.now() - t0)

// Line wrapping keeps every word.
const wsrc = readFileSync(new URL('../src/lib/wrap.js', import.meta.url), 'utf8')
const W = await import('data:text/javascript;base64,' + Buffer.from(wsrc).toString('base64'))
const para = body.slice(0, 600).replace(/\s+/g, ' ').trim()
assert.equal(W.wrapLines(para, 1220).join(' '), para)
assert.ok(W.wrapLines(para, 1220).length > 5)
