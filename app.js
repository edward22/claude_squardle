'use strict';

const WORDLIST_KEY = 'squardle:wordlist';
const GRID_KEY = 'squardle:grid';

const LETTER_VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

const RANDOM_LETTER_POOL =
  'AAAAAAAAABBCCDDDDEEEEEEEEEEEEFFGGGHHIIIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPQRRRRRRSSSSTTTTTTUUUUVVWWXYYZ';

const dom = {
  wordlistFile: document.getElementById('wordlist-file'),
  loadSample: document.getElementById('load-sample'),
  clearWordlist: document.getElementById('clear-wordlist'),
  wordlistStatus: document.getElementById('wordlist-status'),
  rows: document.getElementById('rows'),
  cols: document.getElementById('cols'),
  resizeGrid: document.getElementById('resize-grid'),
  clearGrid: document.getElementById('clear-grid'),
  randomizeGrid: document.getElementById('randomize-grid'),
  grid: document.getElementById('grid'),
  overlay: document.getElementById('path-overlay'),
  pasteArea: document.getElementById('paste-area'),
  pasteLoad: document.getElementById('paste-load'),
  minLength: document.getElementById('min-length'),
  diagonals: document.getElementById('diagonals'),
  solve: document.getElementById('solve'),
  resultsCount: document.getElementById('results-count'),
  resultsControls: document.getElementById('results-controls'),
  sortBy: document.getElementById('sort-by'),
  results: document.getElementById('results'),
};

let trieRoot = null;
let wordCount = 0;
let cellInputs = [];
let cellDivs = [];
let lastResults = [];

const state = {
  rows: 4,
  cols: 4,
  grid: Array.from({ length: 4 }, () => Array(4).fill('')),
};

// ---------- Trie ----------

function buildTrieFromWords(words) {
  const root = { children: Object.create(null), end: false };
  let count = 0;
  for (const w of words) {
    if (!w) continue;
    let node = root;
    for (const ch of w) {
      if (!node.children[ch]) node.children[ch] = { children: Object.create(null), end: false };
      node = node.children[ch];
    }
    if (!node.end) {
      node.end = true;
      count++;
    }
  }
  return { root, count };
}

function updateWordlistStatus(text) {
  dom.wordlistStatus.textContent = text;
}

function extractWord(line) {
  // Takes the leading run of letters and drops everything after it, so a
  // line like "CARE - to feel concern" or "care, v. to feel..." reduces to
  // just "CARE" regardless of what separates the word from its definition.
  const match = line.trim().match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : '';
}

function loadWordsIntoApp(rawText, sourceLabel, persist = true) {
  const words = rawText
    .split(/\r?\n/)
    .map(extractWord)
    .filter((w) => /^[A-Z]{2,}$/.test(w));
  const unique = Array.from(new Set(words));

  if (unique.length === 0) {
    updateWordlistStatus('That file had no usable words (expected one A-Z word per line).');
    return;
  }

  const built = buildTrieFromWords(unique);
  trieRoot = built.root;
  wordCount = built.count;
  updateWordlistStatus(`${wordCount.toLocaleString()} words loaded (${sourceLabel}).`);

  if (persist) {
    try {
      localStorage.setItem(WORDLIST_KEY, unique.join('\n'));
    } catch (err) {
      updateWordlistStatus(
        `${wordCount.toLocaleString()} words loaded (${sourceLabel}) — too large to save locally, you'll need to re-upload next visit.`
      );
    }
  }
}

// ---------- Word list UI ----------

dom.wordlistFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadWordsIntoApp(reader.result, file.name);
  reader.onerror = () => updateWordlistStatus(`Could not read ${file.name}.`);
  reader.readAsText(file);
});

dom.loadSample.addEventListener('click', async () => {
  updateWordlistStatus('Loading sample list…');
  try {
    const res = await fetch('sample-wordlist.txt');
    const text = await res.text();
    loadWordsIntoApp(text, 'sample list');
  } catch (err) {
    updateWordlistStatus('Could not load sample-wordlist.txt.');
  }
});

dom.clearWordlist.addEventListener('click', () => {
  localStorage.removeItem(WORDLIST_KEY);
  trieRoot = null;
  wordCount = 0;
  updateWordlistStatus('No word list loaded.');
});

// ---------- Grid model ----------

function persistGrid() {
  try {
    localStorage.setItem(GRID_KEY, JSON.stringify({ rows: state.rows, cols: state.cols, grid: state.grid }));
  } catch (err) {
    /* ignore quota errors for grid state */
  }
}

function restoreGridState() {
  try {
    const saved = JSON.parse(localStorage.getItem(GRID_KEY) || 'null');
    if (saved && Number.isInteger(saved.rows) && Number.isInteger(saved.cols) && Array.isArray(saved.grid)) {
      state.rows = saved.rows;
      state.cols = saved.cols;
      state.grid = saved.grid;
      return;
    }
  } catch (err) {
    /* fall through to default */
  }
}

function renderGrid() {
  dom.rows.value = state.rows;
  dom.cols.value = state.cols;
  dom.grid.style.gridTemplateColumns = `repeat(${state.cols}, 52px)`;
  dom.grid.innerHTML = '';
  cellInputs = [];
  cellDivs = [];

  for (let r = 0; r < state.rows; r++) {
    cellInputs.push([]);
    cellDivs.push([]);
    for (let c = 0; c < state.cols; c++) {
      const cellDiv = document.createElement('div');
      cellDiv.className = 'cell';

      const input = document.createElement('input');
      input.maxLength = 4;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = (state.grid[r] && state.grid[r][c]) || '';
      input.addEventListener('input', (e) => onCellInput(e, r, c));
      input.addEventListener('keydown', (e) => onCellKeydown(e, r, c));

      const badge = document.createElement('span');
      badge.className = 'order-badge';

      cellDiv.appendChild(input);
      cellDiv.appendChild(badge);
      dom.grid.appendChild(cellDiv);

      cellInputs[r].push(input);
      cellDivs[r].push(cellDiv);
    }
  }

  updateOverlaySize();
}

function onCellInput(e, r, c) {
  const val = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  e.target.value = val;
  state.grid[r][c] = val;
  persistGrid();
  if (val) focusCell(c + 1 >= state.cols ? [r + 1, 0] : [r, c + 1]);
}

function onCellKeydown(e, r, c) {
  if (e.key === 'Backspace' && !e.target.value) {
    const [pr, pc] = c - 1 < 0 ? [r - 1, state.cols - 1] : [r, c - 1];
    focusCell([pr, pc]);
  } else if (e.key === 'ArrowRight') focusCell([r, c + 1]);
  else if (e.key === 'ArrowLeft') focusCell([r, c - 1]);
  else if (e.key === 'ArrowUp') focusCell([r - 1, c]);
  else if (e.key === 'ArrowDown') focusCell([r + 1, c]);
}

function focusCell([r, c]) {
  if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return;
  const input = cellInputs[r][c];
  input.focus();
  input.select();
}

function resizeGridTo(newRows, newCols) {
  const newGrid = [];
  for (let r = 0; r < newRows; r++) {
    const row = [];
    for (let c = 0; c < newCols; c++) {
      row.push((state.grid[r] && state.grid[r][c]) || '');
    }
    newGrid.push(row);
  }
  state.rows = newRows;
  state.cols = newCols;
  state.grid = newGrid;
  persistGrid();
  renderGrid();
}

dom.resizeGrid.addEventListener('click', () => {
  const r = clamp(parseInt(dom.rows.value, 10) || 4, 2, 10);
  const c = clamp(parseInt(dom.cols.value, 10) || 4, 2, 10);
  resizeGridTo(r, c);
});

dom.clearGrid.addEventListener('click', () => {
  state.grid = Array.from({ length: state.rows }, () => Array(state.cols).fill(''));
  persistGrid();
  renderGrid();
  clearHighlight();
});

dom.randomizeGrid.addEventListener('click', () => {
  state.grid = Array.from({ length: state.rows }, () =>
    Array.from({ length: state.cols }, () => RANDOM_LETTER_POOL[Math.floor(Math.random() * RANDOM_LETTER_POOL.length)])
  );
  persistGrid();
  renderGrid();
  clearHighlight();
});

dom.pasteLoad.addEventListener('click', () => {
  const parsed = parsePastedGrid(dom.pasteArea.value);
  if (!parsed) return;
  state.rows = parsed.length;
  state.cols = parsed[0].length;
  state.grid = parsed;
  persistGrid();
  renderGrid();
  clearHighlight();
});

function parsePastedGrid(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const rows = lines.map((line) => {
    const trimmed = line.trim();
    if (/\s/.test(trimmed)) {
      return trimmed.split(/\s+/).map((tok) => (tok === '_' ? '' : tok.toUpperCase()));
    }
    return trimmed.split('').map((ch) => (ch === '_' ? '' : ch.toUpperCase()));
  });
  const cols = Math.max(...rows.map((r) => r.length));
  rows.forEach((r) => {
    while (r.length < cols) r.push('');
  });
  return rows;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ---------- Path overlay ----------

function updateOverlaySize() {
  const rect = dom.grid.getBoundingClientRect();
  dom.overlay.setAttribute('width', rect.width);
  dom.overlay.setAttribute('height', rect.height);
}

function clearHighlight() {
  cellDivs.flat().forEach((d) => d.classList.remove('active'));
  dom.overlay.innerHTML = '';
}

function highlightPath(path) {
  clearHighlight();
  const gridRect = dom.grid.getBoundingClientRect();
  const centers = [];

  path.forEach(([r, c], i) => {
    const div = cellDivs[r][c];
    div.classList.add('active');
    div.querySelector('.order-badge').textContent = String(i + 1);
    const rect = div.getBoundingClientRect();
    centers.push({
      x: rect.left - gridRect.left + rect.width / 2,
      y: rect.top - gridRect.top + rect.height / 2,
    });
  });

  for (let i = 0; i < centers.length - 1; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', centers[i].x);
    line.setAttribute('y1', centers[i].y);
    line.setAttribute('x2', centers[i + 1].x);
    line.setAttribute('y2', centers[i + 1].y);
    dom.overlay.appendChild(line);
  }
}

window.addEventListener('resize', () => {
  updateOverlaySize();
  clearHighlight();
});

// ---------- Solver ----------

const DIRS_8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];
const DIRS_4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function solveGrid(gridLetters, rows, cols, root, minLen, allowDiagonal) {
  const dirs = allowDiagonal ? DIRS_8 : DIRS_4;
  const found = new Map();
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

  function dfs(r, c, node, path, wordChars) {
    const tile = gridLetters[r][c];
    let curNode = node;
    for (const ch of tile) {
      curNode = curNode.children[ch];
      if (!curNode) return;
    }

    visited[r][c] = true;
    path.push([r, c]);
    wordChars.push(tile);

    if (curNode.end) {
      const word = wordChars.join('');
      if (word.length >= minLen && !found.has(word)) {
        found.set(word, path.slice());
      }
    }

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && gridLetters[nr][nc]) {
        dfs(nr, nc, curNode, path, wordChars);
      }
    }

    wordChars.pop();
    path.pop();
    visited[r][c] = false;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (gridLetters[r][c]) dfs(r, c, root, [], []);
    }
  }

  return found;
}

function scoreWord(word) {
  let total = 0;
  for (const ch of word) total += LETTER_VALUES[ch] || 0;
  return total;
}

dom.solve.addEventListener('click', () => {
  if (!trieRoot) {
    updateWordlistStatus('Load a word list before solving.');
    return;
  }
  const minLen = clamp(parseInt(dom.minLength.value, 10) || 3, 2, 10);
  const allowDiagonal = dom.diagonals.checked;
  const gridLetters = state.grid.map((row) => row.map((cell) => cell.trim()));
  const hasLetters = gridLetters.some((row) => row.some((c) => c));

  if (!hasLetters) {
    lastResults = [];
    renderResults([]);
    dom.resultsCount.textContent = '— fill in the grid first';
    return;
  }

  const found = solveGrid(gridLetters, state.rows, state.cols, trieRoot, minLen, allowDiagonal);
  lastResults = Array.from(found.entries()).map(([word, path]) => ({ word, path, score: scoreWord(word) }));
  renderResults(lastResults);
  clearHighlight();
});

// ---------- Results ----------

function sortEntries(entries, mode) {
  const byWord = (a, b) => a.word.localeCompare(b.word);
  switch (mode) {
    case 'length-asc':
      entries.sort((a, b) => a.word.length - b.word.length || byWord(a, b));
      break;
    case 'alpha':
      entries.sort(byWord);
      break;
    case 'score-desc':
      entries.sort((a, b) => b.score - a.score || byWord(a, b));
      break;
    case 'length-desc':
    default:
      entries.sort((a, b) => b.word.length - a.word.length || byWord(a, b));
      break;
  }
}

function makeChip(entry) {
  const chip = document.createElement('span');
  chip.className = 'word-chip';
  chip.tabIndex = 0;

  const word = document.createElement('span');
  word.textContent = entry.word;
  const score = document.createElement('span');
  score.className = 'score';
  score.textContent = `${entry.word.length}L·${entry.score}pt`;

  chip.appendChild(word);
  chip.appendChild(score);

  chip.addEventListener('mouseenter', () => {
    chip.classList.add('hovered');
    highlightPath(entry.path);
  });
  chip.addEventListener('mouseleave', () => {
    chip.classList.remove('hovered');
    clearHighlight();
  });
  chip.addEventListener('focus', () => highlightPath(entry.path));
  chip.addEventListener('blur', () => clearHighlight());
  chip.addEventListener('click', () => highlightPath(entry.path));

  return chip;
}

function renderResults(entries) {
  sortEntries(entries, dom.sortBy.value);
  dom.results.innerHTML = '';
  dom.resultsControls.hidden = entries.length === 0;
  dom.resultsCount.textContent = entries.length ? `— ${entries.length} words found` : '';

  if (dom.sortBy.value.startsWith('length')) {
    const groups = new Map();
    for (const e of entries) {
      if (!groups.has(e.word.length)) groups.set(e.word.length, []);
      groups.get(e.word.length).push(e);
    }
    const lengths = Array.from(groups.keys()).sort((a, b) => (dom.sortBy.value === 'length-desc' ? b - a : a - b));
    for (const len of lengths) {
      const section = document.createElement('div');
      section.className = 'length-group';
      const h = document.createElement('h3');
      h.textContent = `${len} letters (${groups.get(len).length})`;
      const wrap = document.createElement('div');
      wrap.className = 'results';
      groups.get(len).forEach((e) => wrap.appendChild(makeChip(e)));
      section.appendChild(h);
      section.appendChild(wrap);
      dom.results.appendChild(section);
    }
  } else {
    entries.forEach((e) => dom.results.appendChild(makeChip(e)));
  }
}

dom.sortBy.addEventListener('change', () => {
  if (lastResults.length) renderResults(lastResults);
});

// ---------- Init ----------

(function init() {
  const savedWords = localStorage.getItem(WORDLIST_KEY);
  if (savedWords) {
    loadWordsIntoApp(savedWords, 'restored from browser storage', false);
  }
  restoreGridState();
  renderGrid();
})();
