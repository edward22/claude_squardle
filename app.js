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
  holeMode: document.getElementById('hole-mode'),
  clearHoles: document.getElementById('clear-holes'),
  holeHint: document.getElementById('hole-hint'),
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
  ocrPasteZone: document.getElementById('ocr-paste-zone'),
  ocrFile: document.getElementById('ocr-file'),
  ocrRun: document.getElementById('ocr-run'),
  ocrClear: document.getElementById('ocr-clear'),
  ocrStatus: document.getElementById('ocr-status'),
  ocrImageWrap: document.getElementById('ocr-image-wrap'),
  ocrImage: document.getElementById('ocr-image'),
  ocrCrop: document.getElementById('ocr-crop'),
};

let trieRoot = null;
let wordCount = 0;
let cellInputs = [];
let cellDivs = [];
let lastResults = [];
let holeModeActive = false;

const state = {
  rows: 4,
  cols: 4,
  grid: Array.from({ length: 4 }, () => Array(4).fill('')),
  holes: Array.from({ length: 4 }, () => Array(4).fill(false)),
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

function emptyHoles(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(false));
}

function persistGrid() {
  try {
    localStorage.setItem(
      GRID_KEY,
      JSON.stringify({ rows: state.rows, cols: state.cols, grid: state.grid, holes: state.holes })
    );
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
      state.holes = Array.isArray(saved.holes) ? saved.holes : emptyHoles(saved.rows, saved.cols);
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
      const isHole = !!(state.holes[r] && state.holes[r][c]);

      const cellDiv = document.createElement('div');
      cellDiv.className = isHole ? 'cell hole' : 'cell';
      cellDiv.addEventListener('click', () => {
        if (holeModeActive) toggleHole(r, c);
      });

      const input = document.createElement('input');
      input.maxLength = 4;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.disabled = isHole;
      input.value = isHole ? '' : (state.grid[r] && state.grid[r][c]) || '';
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

  dom.grid.classList.toggle('hole-mode', holeModeActive);
  updateOverlaySize();
}

function toggleHole(r, c) {
  state.holes[r][c] = !state.holes[r][c];
  if (state.holes[r][c]) state.grid[r][c] = '';
  persistGrid();
  renderGrid();
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
  const newHoles = [];
  for (let r = 0; r < newRows; r++) {
    const row = [];
    const holeRow = [];
    for (let c = 0; c < newCols; c++) {
      row.push((state.grid[r] && state.grid[r][c]) || '');
      holeRow.push(!!(state.holes[r] && state.holes[r][c]));
    }
    newGrid.push(row);
    newHoles.push(holeRow);
  }
  state.rows = newRows;
  state.cols = newCols;
  state.grid = newGrid;
  state.holes = newHoles;
  persistGrid();
  renderGrid();
}

dom.resizeGrid.addEventListener('click', () => {
  const r = clamp(parseInt(dom.rows.value, 10) || 4, 2, 10);
  const c = clamp(parseInt(dom.cols.value, 10) || 4, 2, 10);
  resizeGridTo(r, c);
});

dom.clearGrid.addEventListener('click', () => {
  // Leaves hole shape intact; only wipes typed letters.
  state.grid = Array.from({ length: state.rows }, () => Array(state.cols).fill(''));
  persistGrid();
  renderGrid();
  clearHighlight();
});

dom.randomizeGrid.addEventListener('click', () => {
  state.grid = state.grid.map((row, r) =>
    row.map((_, c) =>
      (state.holes[r] && state.holes[r][c])
        ? ''
        : RANDOM_LETTER_POOL[Math.floor(Math.random() * RANDOM_LETTER_POOL.length)]
    )
  );
  persistGrid();
  renderGrid();
  clearHighlight();
});

dom.holeMode.addEventListener('click', () => {
  holeModeActive = !holeModeActive;
  dom.holeMode.classList.toggle('active', holeModeActive);
  dom.holeMode.setAttribute('aria-pressed', String(holeModeActive));
  dom.holeHint.hidden = !holeModeActive;
  dom.grid.classList.toggle('hole-mode', holeModeActive);
});

dom.clearHoles.addEventListener('click', () => {
  state.holes = emptyHoles(state.rows, state.cols);
  persistGrid();
  renderGrid();
  clearHighlight();
});

dom.pasteLoad.addEventListener('click', () => {
  const parsed = parsePastedGrid(dom.pasteArea.value);
  if (!parsed) return;
  state.rows = parsed.grid.length;
  state.cols = parsed.grid[0].length;
  state.grid = parsed.grid;
  state.holes = parsed.holes;
  persistGrid();
  renderGrid();
  clearHighlight();
});

function parsePastedGrid(text) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  const tokenRows = lines.map((line) => {
    const trimmed = line.trim();
    if (/\s/.test(trimmed)) return trimmed.split(/\s+/);
    return trimmed.split('');
  });
  const cols = Math.max(...tokenRows.map((r) => r.length));
  tokenRows.forEach((r) => {
    while (r.length < cols) r.push('_');
  });
  return {
    grid: tokenRows.map((row) => row.map((tok) => (tok === '_' ? '' : tok.toUpperCase()))),
    holes: tokenRows.map((row) => row.map((tok) => tok === '_')),
  };
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

// ---------- OCR (fill grid from a pasted/uploaded screenshot) ----------

const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
const OCR_CROP_PX = 140; // working resolution for the initial per-cell crop
const OCR_CELL_PX = 200; // final padded canvas size handed to Tesseract
const OCR_CELL_INSET = 0.1; // fraction trimmed off each side of a cell before cropping
const OCR_PAD_FRAC = 0.16; // quiet white margin added around the binarized glyph
const OCR_BLANK_STDDEV_THRESHOLD = 12; // below this, a cell is treated as a hole rather than OCR'd

let tesseractLoadPromise = null;
let ocrWorker = null;
let ocrImageURL = null;
// Crop box stored as fractions (0-1) of the displayed image, so it survives resizes/scaling.
let cropBox = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
let cropDragMode = null;
let cropDragStart = null;
let cropDragStartBox = null;

function updateOcrStatus(text) {
  dom.ocrStatus.textContent = text;
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractLoadPromise) return tesseractLoadPromise;
  tesseractLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN_URL;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => {
      tesseractLoadPromise = null;
      reject(new Error('Could not load the OCR engine — check your internet connection.'));
    };
    document.head.appendChild(script);
  });
  return tesseractLoadPromise;
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  updateOcrStatus('Loading OCR engine…');
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status && typeof m.progress === 'number') {
        updateOcrStatus(`${m.status}… ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
  });
  ocrWorker = worker;
  return worker;
}

// ---- Image loading (paste / drop / upload) ----

function loadImageFromBlob(blob) {
  if (ocrImageURL) URL.revokeObjectURL(ocrImageURL);
  ocrImageURL = URL.createObjectURL(blob);
  dom.ocrImage.onload = () => {
    dom.ocrImageWrap.hidden = false;
    dom.ocrRun.hidden = false;
    dom.ocrClear.hidden = false;
    cropBox = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
    renderCropBox();
  };
  dom.ocrImage.src = ocrImageURL;
}

dom.ocrPasteZone.addEventListener('paste', (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        loadImageFromBlob(blob);
        updateOcrStatus('Image pasted. Adjust the crop box, then Run OCR.');
      }
      e.preventDefault();
      break;
    }
  }
});

dom.ocrPasteZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dom.ocrPasteZone.classList.add('dragover');
});
dom.ocrPasteZone.addEventListener('dragleave', () => {
  dom.ocrPasteZone.classList.remove('dragover');
});
dom.ocrPasteZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dom.ocrPasteZone.classList.remove('dragover');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    loadImageFromBlob(file);
    updateOcrStatus('Image dropped. Adjust the crop box, then Run OCR.');
  }
});

dom.ocrFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    loadImageFromBlob(file);
    updateOcrStatus('Image uploaded. Adjust the crop box, then Run OCR.');
  }
});

dom.ocrClear.addEventListener('click', () => {
  if (ocrImageURL) {
    URL.revokeObjectURL(ocrImageURL);
    ocrImageURL = null;
  }
  dom.ocrImage.removeAttribute('src');
  dom.ocrImageWrap.hidden = true;
  dom.ocrRun.hidden = true;
  dom.ocrClear.hidden = true;
  dom.ocrFile.value = '';
  updateOcrStatus('');
});

// ---- Crop box drag / resize ----

function renderCropBox() {
  const rect = dom.ocrImage.getBoundingClientRect();
  dom.ocrCrop.style.left = `${cropBox.x * rect.width}px`;
  dom.ocrCrop.style.top = `${cropBox.y * rect.height}px`;
  dom.ocrCrop.style.width = `${cropBox.w * rect.width}px`;
  dom.ocrCrop.style.height = `${cropBox.h * rect.height}px`;
}

function startCropDrag(e, mode) {
  cropDragMode = mode;
  cropDragStart = { x: e.clientX, y: e.clientY };
  cropDragStartBox = { ...cropBox };
  e.target.setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();
}

dom.ocrCrop.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('ocr-handle')) return;
  startCropDrag(e, 'move');
});

dom.ocrCrop.querySelectorAll('.ocr-handle').forEach((handle) => {
  handle.addEventListener('pointerdown', (e) => startCropDrag(e, handle.dataset.handle));
});

document.addEventListener('pointermove', (e) => {
  if (!cropDragMode) return;
  const rect = dom.ocrImage.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dx = (e.clientX - cropDragStart.x) / rect.width;
  const dy = (e.clientY - cropDragStart.y) / rect.height;
  const minSize = 0.05;

  if (cropDragMode === 'move') {
    cropBox = {
      ...cropDragStartBox,
      x: clamp(cropDragStartBox.x + dx, 0, 1 - cropDragStartBox.w),
      y: clamp(cropDragStartBox.y + dy, 0, 1 - cropDragStartBox.h),
    };
  } else {
    let left = cropDragStartBox.x;
    let top = cropDragStartBox.y;
    let right = cropDragStartBox.x + cropDragStartBox.w;
    let bottom = cropDragStartBox.y + cropDragStartBox.h;
    if (cropDragMode.includes('w')) left = clamp(cropDragStartBox.x + dx, 0, right - minSize);
    if (cropDragMode.includes('e')) right = clamp(right + dx, left + minSize, 1);
    if (cropDragMode.includes('n')) top = clamp(cropDragStartBox.y + dy, 0, bottom - minSize);
    if (cropDragMode.includes('s')) bottom = clamp(bottom + dy, top + minSize, 1);
    cropBox = { x: left, y: top, w: right - left, h: bottom - top };
  }
  renderCropBox();
});

document.addEventListener('pointerup', () => {
  cropDragMode = null;
});

window.addEventListener('resize', () => {
  if (!dom.ocrImageWrap.hidden) renderCropBox();
});

// ---- Recognition ----
//
// Tuned against real Squaredle-style screenshots (dark rounded tiles, bold
// light-on-dark letters): raw crops fed straight to Tesseract were unreliable
// (~73% on a synthetic test grid) because (a) light-on-dark text confuses a
// model mostly trained on dark-on-light text, (b) the rounded tile
// background/border adds noise right at each cell's edge, and (c) an
// isolated "I" is just a thin stroke that Tesseract's layout analysis often
// discards as noise before classification ever runs. Auto-inverting +
// binarizing (Otsu) fixed (a)/(b); a geometric fallback for (c) (a very
// tall, narrow, dense, centered ink blob has no other realistic match in
// A-Z) brought the same test grid to 100%.

function isCellBlank(ctx, size) {
  const { data } = ctx.getImageData(0, 0, size, size);
  const margin = Math.floor(size * 0.15);
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = margin; y < size - margin; y += 2) {
    for (let x = margin; x < size - margin; x += 2) {
      const i = (y * size + x) * 4;
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += brightness;
      sumSq += brightness * brightness;
      count++;
    }
  }
  if (count === 0) return true;
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  return Math.sqrt(Math.max(variance, 0)) < OCR_BLANK_STDDEV_THRESHOLD;
}

// Grayscale + auto-invert (so text always ends up dark-on-light) + Otsu
// threshold, producing a clean black/white canvas the same size as the input.
function binarizeCell(srcCanvas) {
  const size = srcCanvas.width;
  const { data } = srcCanvas.getContext('2d').getImageData(0, 0, size, size);
  const gray = new Float64Array(size * size);
  const hist = new Array(256).fill(0);
  let sum = 0;
  for (let p = 0; p < size * size; p++) {
    const i = p * 4;
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    hist[Math.round(g)]++;
    sum += g;
  }
  const invert = sum / (size * size) < 128;

  const total = size * size;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let weightBg = 0;
  let bestVariance = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBg += hist[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumB += t * hist[t];
    const meanBg = sumB / weightBg;
    const meanFg = (sumAll - sumB) / weightFg;
    const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = t;
    }
  }

  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const octx = out.getContext('2d');
  const outData = octx.createImageData(size, size);
  for (let p = 0; p < size * size; p++) {
    const isInk = invert ? 255 - gray[p] < 255 - threshold : gray[p] < threshold;
    const val = isInk ? 0 : 255;
    const idx = p * 4;
    outData.data[idx] = val;
    outData.data[idx + 1] = val;
    outData.data[idx + 2] = val;
    outData.data[idx + 3] = 255;
  }
  octx.putImageData(outData, 0, 0);
  return out;
}

// A lone "I" is just a thin vertical stroke — measurably distinct (tall,
// narrow, dense, centered) from every other uppercase letter's ink blob.
function looksLikeLetterI(canvas) {
  const size = canvas.width;
  const { data } = canvas.getContext('2d').getImageData(0, 0, size, size);
  let minX = size;
  let maxX = -1;
  let minY = size;
  let maxY = -1;
  let inkCount = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4] < 128) {
        inkCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (inkCount === 0) return false;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const aspect = h / w;
  const density = inkCount / (w * h);
  const cx = (minX + maxX) / 2 / size;
  return aspect > 2.5 && w < size * 0.15 && density > 0.7 && cx > 0.35 && cx < 0.65;
}

async function runOcr() {
  if (!dom.ocrImage.src) return;
  dom.ocrRun.disabled = true;
  try {
    const worker = await getOcrWorker();

    const rows = state.rows;
    const cols = state.cols;
    const naturalW = dom.ocrImage.naturalWidth;
    const naturalH = dom.ocrImage.naturalHeight;
    const srcX = cropBox.x * naturalW;
    const srcY = cropBox.y * naturalH;
    const srcW = cropBox.w * naturalW;
    const srcH = cropBox.h * naturalH;

    const newGrid = Array.from({ length: rows }, () => Array(cols).fill(''));
    const newHoles = emptyHoles(rows, cols);

    let done = 0;
    const total = rows * cols;
    const cellW = srcW / cols;
    const cellH = srcH / rows;
    // Trim in from each cell's raw slice so a rounded tile's border/gap
    // with its neighbor never bleeds into the crop.
    const insetX = cellW * OCR_CELL_INSET;
    const insetY = cellH * OCR_CELL_INSET;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        updateOcrStatus(`Reading cell ${done + 1} of ${total}…`);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = OCR_CROP_PX;
        cropCanvas.height = OCR_CROP_PX;
        const cropCtx = cropCanvas.getContext('2d');
        cropCtx.drawImage(
          dom.ocrImage,
          srcX + c * cellW + insetX,
          srcY + r * cellH + insetY,
          cellW - 2 * insetX,
          cellH - 2 * insetY,
          0,
          0,
          OCR_CROP_PX,
          OCR_CROP_PX
        );

        if (isCellBlank(cropCtx, OCR_CROP_PX)) {
          newHoles[r][c] = true;
          done++;
          continue;
        }

        const bw = binarizeCell(cropCanvas);

        // Place the clean glyph, shrunk, onto a padded white canvas — Tesseract
        // reads isolated characters far more reliably with a quiet margin.
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = OCR_CELL_PX;
        finalCanvas.height = OCR_CELL_PX;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.fillStyle = 'white';
        finalCtx.fillRect(0, 0, OCR_CELL_PX, OCR_CELL_PX);
        const pad = OCR_CELL_PX * OCR_PAD_FRAC;
        finalCtx.drawImage(bw, 0, 0, OCR_CROP_PX, OCR_CROP_PX, pad, pad, OCR_CELL_PX - 2 * pad, OCR_CELL_PX - 2 * pad);

        const { data } = await worker.recognize(finalCanvas);
        const match = (data.text || '').toUpperCase().match(/[A-Z]/);
        let letter = match ? match[0] : '';
        if (!letter && looksLikeLetterI(bw)) letter = 'I';
        newGrid[r][c] = letter;
        done++;
      }
    }

    state.grid = newGrid;
    state.holes = newHoles;
    persistGrid();
    renderGrid();

    const letterCount = newGrid.flat().filter(Boolean).length;
    const holeCount = newHoles.flat().filter(Boolean).length;
    updateOcrStatus(
      `Done — recognized ${letterCount} letter${letterCount === 1 ? '' : 's'}, ${holeCount} likely hole${holeCount === 1 ? '' : 's'}. Please check the grid before solving.`
    );
  } catch (err) {
    updateOcrStatus(err.message || 'OCR failed.');
  } finally {
    dom.ocrRun.disabled = false;
  }
}

dom.ocrRun.addEventListener('click', runOcr);

// ---------- Init ----------

(function init() {
  const savedWords = localStorage.getItem(WORDLIST_KEY);
  if (savedWords) {
    loadWordsIntoApp(savedWords, 'restored from browser storage', false);
  }
  restoreGridState();
  renderGrid();
})();
