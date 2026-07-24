# Squardle Solver

A small client-side web app that finds every valid word hidden in a
Squaredle-style letter grid: enter (or paste) the grid, upload a word list,
and it searches all paths of adjacent letters (horizontal, vertical, and
diagonal by default) for valid words, with no cell reused twice in the same
word.

Everything runs in the browser — no backend, no build step.

## Running it

Any static file server works, e.g.:

```sh
python3 -m http.server 8000
```

then open `http://localhost:8000`.

(Opening `index.html` directly with `file://` also mostly works, except the
"Load small sample list" button, which fetches `sample-wordlist.txt` and
needs an HTTP server due to browser fetch restrictions on `file://`.)

## Word list

The app ships with a small bundled `sample-wordlist.txt` (a few hundred
common words) so the UI is usable immediately, but it's not a real Scrabble
dictionary — it's just enough to try things out.

For real results, upload your own word list via the **Upload word list**
button: a plain text file with **one word per line**. This is a good fit for
an exported TWL06, NWL2020, or NWL2023 word list (the official North
American tournament Scrabble dictionaries), which aren't included here
because they're not freely redistributable. Any other list works too, such
as the public-domain [ENABLE word
list](https://github.com/dolph/dictionary) if you want a free
Scrabble-like approximation.

If your list has definitions after each word (e.g. `CARE - to feel
concern`, `care, v. to feel...`, tab-separated glosses, etc.), you don't
need to clean it up first — only the leading run of letters on each line is
kept, everything after it is dropped automatically.

The uploaded list is cached in your browser's `localStorage`, so you only
need to upload it once per browser (until you clear it or clear site data).
Very large lists (a few MB+) may exceed the browser's storage quota — if
that happens the app tells you and you'll need to re-upload each visit.

## Grid input

- Type directly into the grid cells (auto-advances to the next cell).
- Or use **Paste whole grid instead** to paste rows of letters at once, e.g.:
  ```
  ABCD
  EFGH
  IJKL
  MNOP
  ```
  Space-separate tokens if you need multi-letter tiles in one cell (e.g. a
  `QU` tile), and use `_` for a hole (a cell that's simply not part of the
  grid's shape — common in Squaredle's irregular layouts).
- **Resize** changes the grid dimensions (2–10 per side), preserving both
  letters and holes that still fit.
- **Random demo grid** fills the non-hole cells with randomized,
  frequency-weighted letters for quick testing.

### Holes (irregular grid shapes)

Squaredle grids aren't always a clean rectangle — some cells are simply
absent. Click **Mark holes**, then tap any cell to toggle it as a hole
(shown with a hatched pattern, excluded from solving); tap **Mark holes**
again to go back to normal typing. **Clear holes** resets the grid back to
a full rectangle. Holes persist through resize, and **Clear letters**
leaves them in place (it only wipes typed letters) — use **Clear holes**
when you want to start over with a full rectangle.

### Fill the grid from a screenshot (OCR)

Open **Fill grid from a screenshot (OCR)** under the grid. Set the rows/cols
above to match the screenshot first, then get an image in one of three ways:
click the paste box and press Ctrl/Cmd+V, drag an image file onto it, or use
**Upload screenshot**. Drag the blue crop box's corner handles so it tightly
covers just the letter grid (crop out any surrounding UI/buttons/score text
for best accuracy), then click **Run OCR**.

Recognition runs one grid cell at a time using
[Tesseract.js](https://github.com/naptha/tesseract.js) — cells that come
back mostly blank/uniform are automatically marked as holes instead of
guessed at. The OCR engine (a few MB) is fetched from a CDN the first time
you use this feature, so it needs an internet connection on first use; after
that it's cached by the browser. OCR is never perfect (isolated glyphs like
a lone "I" are a known hard case) — the recognized grid is always editable
afterward, so review it before hitting Solve.

## Options

- **Minimum word length** — default 3.
- **Allow diagonal moves** — on by default, matching Squaredle; turn off for
  orthogonal-only (Boggle "no diagonals") variants.

## Results

Words are grouped and sorted (longest first by default, or alphabetical /
by Scrabble score). Hover, focus, or click a word to see its path
highlighted on the grid, numbered in order.

## Files

- `index.html` — page structure
- `style.css` — styling
- `app.js` — grid state, trie-based solver, and all UI logic
- `sample-wordlist.txt` — small bundled demo word list
