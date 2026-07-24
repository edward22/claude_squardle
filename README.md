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
  `QU` tile), and use `_` for a blank/unusable cell.
- **Resize** changes the grid dimensions (2–10 per side).
- **Random demo grid** fills the grid with randomized, frequency-weighted
  letters for quick testing.

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
