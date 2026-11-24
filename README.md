# text-reader

Text file reader for the DT G1 watch (Glyphix OS, 466x466 round screen). On-screen text is Hebrew.

## Files

Copy `.txt` or `.md` files, with or without subfolders, to `internal://mass/texts/` (`E:\data\mass\texts\` over USB).

The encoding is detected per file: UTF-16 and UTF-8 by BOM, then UTF-8 if the head and three samples are valid, otherwise windows-1255.

## Pages

- **main** - folders and files.
- **reader** - one page (about 1000 bytes) at a time, with the page number. The position of each file is saved.
- **menu** - font size (4 steps), search in the file, search in all files, go to percent.
- **search** - on-screen keyboard (Hebrew, English, digits), results with snippet and file name. Tapping a result opens the place and colors its paragraph. Niqqud, quotes and final letters are ignored. At most 50 results, 10 per file when searching all files.

## Design

- `src/lib/text.js` is pure logic. Every position is a byte offset, and search keeps the byte offset of every folded character, so results map back exactly.
- Files are never loaded whole: `file.read({uri, position, length})` returns a range as a SharedArrayBuffer (checked in the emulator). There is no TextDecoder, so decoding is done in JS. There is no fallback to `readText`: if ranged reads do not work, pages show as empty.
- Pages start on a fixed byte grid, moved to the next white space, so any page can be opened without reading the ones before it.
- Search reads 8 KB chunks with a 400 byte overlap and yields between chunks.
- `src/lib/wrap.js` breaks lines, because the text engine breaks Hebrew inside words and ignores `word-break` and `word-wrap`. The glyph widths are estimates: the Hebrew font of the watch was not available to measure.
- `onShow` must not return a Promise: the page is not presented and its timers do not run until it settles.
- State is in `internal://files/state.json`, written on every page turn.

## Build and test

Requires the Glyphix CLI (`gx`, in `dt-g1-research/tools/glyphix-toolchain`, with its `bin` folder on `PATH`) and the `dtg1-c175r` device profile.

```
node test/text.test.mjs
gx build -d dtg1-c175r -f
gx emulate -d dtg1-emu-466x466 --target=com.abaye.reader
```

In the emulator the files go to `.glyphix-work/image/dtg1-emu-466x466/data/mass/texts/`.

The package is free (no menu slot of its own): it needs a `gui/pkgs.db` entry and a launcher that opens it.
