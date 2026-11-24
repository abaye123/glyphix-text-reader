import file from '@system.file'
import { detect, PAGE, MARGIN, boundary, paragraphs, pageCount } from './text.js'

export const ROOT = 'internal://mass/texts/'

export const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function attempt(fn) {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    console.info('[reader] ' + e)
    return { ok: false, value: null }
  }
}

// A byte range. read() gives an ArrayBuffer or a SharedArrayBuffer.
export async function readRange(path, position, length) {
  const r = await attempt(() => file.read({ uri: ROOT + path, position: position, length: length }))
  if (!r.ok || !r.value) return new Uint8Array(0)
  const bytes = new Uint8Array(r.value.buffer || r.value)
  return bytes.length > length ? bytes.subarray(0, length) : bytes
}

function compareNames(a, b) {
  const x = a.name.toLowerCase()
  const y = b.name.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
}

// { dirs: [{ name, path }], files: [{ name, path, size }] } of a folder ("" is the root).
export async function listDir(path) {
  const base = path ? path + '/' : ''
  const r = await attempt(() => file.list({ uri: ROOT + base }))
  const out = { dirs: [], files: [] }
  const names = r.ok && Array.isArray(r.value) ? r.value : []
  for (let i = 0; i < names.length; i++) {
    const name = String(names[i]).replace(/\/+$/, '')
    if (!name || name.charAt(0) === '.') continue
    const isText = /\.(txt|md)$/i.test(name)
    const s = await attempt(() => file.stat({ uri: ROOT + base + name }))
    if (!s.ok || !s.value) continue
    if (s.value.isFile === false) out.dirs.push({ name: name, path: base + name })
    else if (isText) out.files.push({ name: name.replace(/\.[^.]+$/, ''), path: base + name, size: s.value.size || 0 })
  }
  out.dirs.sort(compareNames)
  out.files.sort(compareNames)
  return out
}

// { path, size, enc, bom }, or null when the file is missing.
export async function openFile(path) {
  const s = await attempt(() => file.stat({ uri: ROOT + path }))
  if (!s.ok || !s.value) return null
  const size = s.value.size || 0
  const head = await readRange(path, 0, 2048)
  const samples = []
  // A long file may have only ASCII at its start.
  if (size > 2048) {
    for (let i = 1; i <= 3; i++) samples.push(await readRange(path, Math.floor(size * i / 4), 1024))
  }
  const d = detect(head, samples)
  console.info('[reader] open ' + path + ' ' + d.enc + ' ' + size)
  return { path: path, size: size, enc: d.enc, bom: d.bom }
}

// Page k: { k, count, start, items }.
export async function loadPage(f, k) {
  const count = pageCount(f.size)
  k = Math.max(0, Math.min(count - 1, k))
  const base = k * PAGE
  const bytes = await readRange(f.path, base, PAGE + MARGIN)
  const from = k === 0 ? f.bom : boundary(bytes, f.enc, base, 0)
  const to = k === count - 1 ? bytes.length : boundary(bytes, f.enc, base, PAGE)
  return { k: k, count: count, start: base + from, items: paragraphs(bytes, f.enc, base, Math.min(from, to), to) }
}

// The page that shows the byte at `offset`.
export async function pageOf(f, offset) {
  const k = Math.floor(offset / PAGE)
  if (k === 0) return 0
  const base = k * PAGE
  const bytes = await readRange(f.path, base, MARGIN)
  return boundary(bytes, f.enc, base, 0) + base > offset ? k - 1 : k
}
