// Line breaking. The text engine breaks Hebrew inside words, so the reader
// splits lines itself with estimated glyph widths (percent of the font size,
// rounded up, so a line that is too long for the real font stays rare).
const HE = [67, 66, 48, 63, 69, 33, 44, 69, 70, 33, 62, 61, 62, 70, 74, 33, 47, 71, 65, 66, 67, 60, 62, 72, 64, 82, 75]
const NARROW = " .,:;!|'\"()[]ijlft-"
const WIDE = 'mwMW@%'

export function charWidth(c) {
  if (c >= 0x05d0 && c <= 0x05ea) return HE[c - 0x05d0]
  if ((c >= 0x0591 && c <= 0x05bd) || (c >= 0x05bf && c <= 0x05c7) || c === 0x200e || c === 0x200f) return 0
  if (c < 0x80) {
    const s = String.fromCharCode(c)
    if (NARROW.indexOf(s) >= 0) return 38
    if (WIDE.indexOf(s) >= 0) return 96
    return c >= 65 && c <= 90 ? 76 : 62
  }
  return c >= 0x2e80 ? 100 : 65
}

function widthOf(word) {
  let w = 0
  for (let i = 0; i < word.length; i++) w += charWidth(word.charCodeAt(i))
  return w
}

// max: the line width in percent of the font size.
export function wrapLines(text, max) {
  const out = []
  let line = ''
  let width = 0
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (!word) continue
    const w = widthOf(word)
    const space = line ? charWidth(32) : 0
    if (line && width + space + w > max) {
      out.push(line)
      line = word
      width = w
    } else {
      line += (line ? ' ' : '') + word
      width += space + w
    }
  }
  if (line) out.push(line)
  return out
}
