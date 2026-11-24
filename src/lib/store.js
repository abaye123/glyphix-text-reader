import file from '@system.file'

const STATE_URI = 'internal://files/state.json'
const MAX_FILES = 200

// positions: [[path, byte offset]], most recent first.
export const st = { size: 1, positions: [] }

// Shared between pages; router params are not relied on.
export const nav = { path: '', size: 0, target: null, hit: null, searchScope: 'all' }

let loaded = null
let dirty = false
let writing = false

export function loadState() {
  if (!loaded) loaded = load()
  return loaded
}

async function load() {
  try {
    const v = await file.readText({ uri: STATE_URI })
    const text = typeof v === 'string' ? v : (v && v.text) || ''
    if (!text) return
    const d = JSON.parse(text)
    if (d.size >= 0 && d.size <= 3) st.size = d.size
    if (Array.isArray(d.positions)) st.positions = d.positions.filter(p => Array.isArray(p) && p.length === 2)
  } catch (e) {
    console.info('[reader] no state: ' + e)
  }
}

export function positionOf(path) {
  for (let i = 0; i < st.positions.length; i++) {
    if (st.positions[i][0] === path) return Number(st.positions[i][1]) || 0
  }
  return 0
}

// Written at once: the JS context may be killed a second after the screen turns off.
export function setPosition(path, offset) {
  if (st.positions.length && st.positions[0][0] === path && st.positions[0][1] === offset) return
  st.positions = [[path, offset]].concat(st.positions.filter(p => p[0] !== path)).slice(0, MAX_FILES)
  dirty = true
  saveNow()
}

export function setSize(n) {
  st.size = Math.max(0, Math.min(3, n))
  dirty = true
  saveNow()
}

export async function saveNow() {
  if (!dirty || writing) return
  writing = true
  while (dirty) {
    dirty = false
    try {
      await file.writeText({ uri: STATE_URI, text: JSON.stringify(st) })
    } catch (e) {
      console.info('[reader] save failed: ' + e)
    }
  }
  writing = false
}
