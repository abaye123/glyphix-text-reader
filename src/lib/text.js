// Pure text logic: encoding detection, decoding, paging and search matching.
// All positions are byte offsets in the file.

export const PAGE = 1000
// A page boundary is looked for in this many bytes after the grid point.
export const MARGIN = 160
const PIECE = 160

const CP_80 = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0xfffd, 0x2039, 0xfffd, 0xfffd, 0xfffd, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0xfffd, 0x203a, 0xfffd, 0xfffd, 0xfffd, 0xfffd
]

function cp1255(b) {
  if (b < 0x80) return b
  if (b < 0xa0) return CP_80[b - 0x80]
  if (b === 0xa4) return 0x20aa
  if (b === 0xaa) return 0xd7
  if (b === 0xba) return 0xf7
  if (b < 0xc0) return b
  if (b <= 0xd3) return b === 0xca ? 0xfffd : 0x05b0 + b - 0xc0
  if (b <= 0xd8) return 0x05f0 + b - 0xd4
  if (b >= 0xe0 && b <= 0xfa) return 0x05d0 + b - 0xe0
  if (b === 0xfd) return 0x200e
  if (b === 0xfe) return 0x200f
  return 0xfffd
}

// Length of a valid UTF-8 sequence at i; 0 when invalid, -1 when cut by the end.
function seqLen(bytes, i) {
  const b = bytes[i]
  if (b < 0x80) return 1
  const n = b >= 0xc2 && b <= 0xdf ? 2 : b >= 0xe0 && b <= 0xef ? 3 : b >= 0xf0 && b <= 0xf4 ? 4 : 0
  if (!n) return 0
  for (let k = 1; k < n; k++) {
    if (i + k >= bytes.length) return -1
    if ((bytes[i + k] & 0xc0) !== 0x80) return 0
  }
  return n
}

// atStart: the sample starts on a character; otherwise it may start inside one.
export function validUtf8(bytes, atStart) {
  let i = 0
  if (!atStart) while (i < 3 && i < bytes.length && (bytes[i] & 0xc0) === 0x80) i++
  while (i < bytes.length) {
    const n = seqLen(bytes, i)
    if (n < 0) return true
    if (n === 0) return false
    i += n
  }
  return true
}

// Encoding of a file from its head and extra samples: { enc, bom }.
export function detect(head, samples) {
  if (head.length >= 2 && head[0] === 0xff && head[1] === 0xfe) return { enc: 'utf16le', bom: 2 }
  if (head.length >= 2 && head[0] === 0xfe && head[1] === 0xff) return { enc: 'utf16be', bom: 2 }
  if (head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return { enc: 'utf8', bom: 3 }
  let ok = validUtf8(head, true)
  const list = samples || []
  for (let i = 0; ok && i < list.length; i++) ok = validUtf8(list[i], false)
  return { enc: ok ? 'utf8' : 'cp1255', bom: 0 }
}

// Calls emit(code, offset, length) for every whole character.
function walk(bytes, enc, from, to, emit) {
  let i = from
  if (enc === 'utf16le' || enc === 'utf16be') {
    const lo = enc === 'utf16le' ? 0 : 1
    for (; i + 1 < to; i += 2) emit(bytes[i + lo] | (bytes[i + 1 - lo] << 8), i, 2)
    return
  }
  if (enc === 'cp1255') {
    for (; i < to; i++) emit(cp1255(bytes[i]), i, 1)
    return
  }
  while (i < to) {
    const n = seqLen(bytes, i)
    if (n < 0) return
    const b = bytes[i]
    if (n <= 1) {
      emit(n ? b : 0xfffd, i, 1)
      i++
      continue
    }
    let c = n === 2 ? b & 0x1f : n === 3 ? b & 0x0f : b & 0x07
    for (let k = 1; k < n; k++) c = (c << 6) | (bytes[i + k] & 0x3f)
    emit(c, i, n)
    i += n
  }
}

function chr(c) {
  if (c < 0x10000) return String.fromCharCode(c)
  const d = c - 0x10000
  return String.fromCharCode(0xd800 + (d >> 10), 0xdc00 + (d & 0x3ff))
}

// First character start at or after index i of bytes (base = file offset of bytes[0]).
export function alignChar(bytes, enc, base, i) {
  if (enc === 'utf16le' || enc === 'utf16be') return (base + i) % 2 ? i + 1 : i
  if (enc === 'utf8') {
    let n = 0
    while (n < 3 && i < bytes.length && (bytes[i] & 0xc0) === 0x80) { i++; n++ }
  }
  return i
}

// Where the page at grid point index `at` really starts: after the first white
// space in the margin, or at the first whole character. Returns an index.
export function boundary(bytes, enc, base, at) {
  const start = alignChar(bytes, enc, base, at)
  const end = Math.min(bytes.length, at + MARGIN)
  let found = -1
  walk(bytes, enc, start, end, (c, i, n) => {
    if (found < 0 && (c === 32 || c === 10 || c === 13)) found = i + n
  })
  return found >= 0 ? found : start
}

export function pageCount(size) {
  return Math.max(1, Math.ceil(size / PAGE))
}

// Short paragraphs (so no text node is long): [{ text, start, end }] with byte offsets.
export function paragraphs(bytes, enc, base, from, to) {
  const out = []
  let text = ''
  let start = from
  let last = from
  const flush = end => {
    const t = text.trim()
    if (t) out.push({ text: t, start: base + start, end: base + end })
    text = ''
    start = end
  }
  walk(bytes, enc, from, to, (c, i, n) => {
    last = i + n
    if (c === 10 || c === 13) {
      flush(last)
      return
    }
    if (c === 0xfeff || c === 0) return
    text += c === 9 ? ' ' : chr(c)
    if (text.length >= PIECE && c === 32) flush(last)
    else if (text.length >= PIECE * 2) flush(last)
  })
  flush(last)
  return out
}

const FINALS = { 0x05da: 0x05db, 0x05dd: 0x05de, 0x05df: 0x05e0, 0x05e3: 0x05e4, 0x05e5: 0x05e6 }

function dropped(c) {
  return c === 0 || c === 34 || c === 39 || c === 0x05f3 || c === 0x05f4 || c === 0xfeff ||
    (c >= 0x200b && c <= 0x200f) || (c >= 0x2018 && c <= 0x201e)
}

// The folded code, 32 for any white space or maqaf, or 0 for a dropped character.
function fold(c) {
  if (c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x05be) return 32
  if (c >= 65 && c <= 90) return c + 32
  if (c >= 0x05d0 && c <= 0x05ea) return FINALS[c] || c
  if (c >= 0x0591 && c <= 0x05c7) return 0
  return dropped(c) ? 0 : c
}

export function normalizeQuery(q) {
  let out = ''
  const s = String(q || '')
  for (let i = 0; i < s.length; i++) {
    const c = fold(s.charCodeAt(i))
    if (!c || (c === 32 && (!out || out.charAt(out.length - 1) === ' '))) continue
    out += String.fromCharCode(c)
  }
  return out.trim()
}

// Folded text of a chunk with the byte offset of every folded character.
export function foldChunk(bytes, enc, base, from, to) {
  const parts = []
  const map = []
  let space = false
  walk(bytes, enc, from, to, (c, i) => {
    const f = c >= 0x10000 ? 32 : fold(c)
    if (!f) return
    if (f === 32) {
      if (space) return
      space = true
    } else {
      space = false
    }
    parts.push(String.fromCharCode(f))
    map.push(base + i)
  })
  return { text: parts.join(''), map: map }
}

// Matches of the folded query at or after byte minOffset: [{ offset, end }].
export function matches(folded, query, minOffset, max) {
  const out = []
  let i = folded.text.indexOf(query)
  while (i >= 0 && out.length < max) {
    const last = i + query.length - 1
    if (folded.map[i] >= minOffset) out.push({ offset: folded.map[i], end: folded.map[last] + 1 })
    i = folded.text.indexOf(query, i + query.length)
  }
  return out
}

// Readable text around a match.
export function snippet(bytes, enc, base, offset) {
  const unit = enc === 'cp1255' ? 1 : 2
  let from = Math.max(0, offset - base - 24 * unit)
  if (from > 0) {
    from = alignChar(bytes, enc, base, from)
    // Starts on a whole word.
    let word = -1
    walk(bytes, enc, from, offset - base, (c, i, n) => {
      if (word < 0 && (c === 32 || c === 10)) word = i + n
    })
    if (word >= 0) from = word
  } else {
    from = alignChar(bytes, enc, base, 0)
  }
  let s = ''
  walk(bytes, enc, from, Math.min(bytes.length, offset - base + 60 * unit), c => {
    s += c < 32 ? ' ' : chr(c)
  })
  return s.replace(/ +/g, ' ').trim()
}
