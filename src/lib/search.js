import { listDir, openFile, readRange, pause } from './files.js'
import { normalizeQuery, foldChunk, matches, snippet, alignChar } from './text.js'

const CHUNK = 8192
// Longer than any query, with room for niqqud.
const OVERLAP = 400
const MAX_HITS = 50
const MAX_PER_FILE = 10
const MAX_DEPTH = 8

// job: { cancelled, onFile(name), onHit(hit), onProgress(percent) }.
// hit: { path, offset, end, text }.
async function searchFile(path, query, job, max) {
  const f = await openFile(path)
  if (!f) return 0
  let pos = f.bom
  let done = f.bom
  let count = 0
  while (pos < f.size && !job.cancelled) {
    const bytes = await readRange(path, pos, CHUNK)
    if (!bytes.length) break
    const from = alignChar(bytes, f.enc, pos, 0)
    const found = matches(foldChunk(bytes, f.enc, pos, from, bytes.length), query, done, max - count)
    for (let i = 0; i < found.length; i++) {
      const m = found[i]
      job.onHit({ path: path, offset: m.offset, end: m.end, text: snippet(bytes, f.enc, pos, m.offset) })
      done = m.end
      count++
    }
    if (count >= max) break
    const next = pos + bytes.length
    pos = next >= f.size ? next : Math.max(pos + 1, next - OVERLAP)
    job.onProgress(Math.min(100, Math.floor(next * 100 / f.size)))
    // Gives the CPU back to the system (the watchdog resets a busy app).
    await pause(10)
  }
  return count
}

// Both resolve with true when the result cap was reached.
export async function searchOne(path, text, job) {
  return (await searchFile(path, normalizeQuery(text), job, MAX_HITS)) >= MAX_HITS
}

export async function searchAll(text, job) {
  const query = normalizeQuery(text)
  const queue = [{ path: '', depth: 0 }]
  let hits = 0
  while (queue.length && !job.cancelled) {
    const dir = queue.shift()
    const list = await listDir(dir.path)
    if (dir.depth < MAX_DEPTH) list.dirs.forEach(d => queue.push({ path: d.path, depth: dir.depth + 1 }))
    for (let i = 0; i < list.files.length && !job.cancelled; i++) {
      job.onFile(list.files[i].name)
      hits += await searchFile(list.files[i].path, query, job, Math.min(MAX_PER_FILE, MAX_HITS - hits))
      if (hits >= MAX_HITS) return true
      await pause(10)
    }
  }
  return false
}
