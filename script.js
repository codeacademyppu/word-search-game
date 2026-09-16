(function () {
  "use strict";

  const STORE_KEY = "ca_wordsearch_games_v3";
  function getGames() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function setGames(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  let audioCtx = null;
  let soundOn = true;
  function ensureCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function unlockAudioOnce() {
    ensureCtx();
    document.removeEventListener("pointerdown", unlockAudioOnce);
    document.removeEventListener("keydown", unlockAudioOnce);
  }
  document.addEventListener("pointerdown", unlockAudioOnce, { once: true });
  document.addEventListener("keydown", unlockAudioOnce, { once: true });

  function beep(freq, dur, type, vol, delay) {
    if (!soundOn) return;
    const ctx = ensureCtx();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol || 0.15, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  function sndCorrect() {
    beep(660, 0.12, "sine", 0.16);
    beep(880, 0.14, "sine", 0.14, 0.09);
  }
  function sndWrong() {
    beep(160, 0.16, "sawtooth", 0.1);
  }
  function sndWin() {
    [523, 659, 784, 1046].forEach((f, i) =>
      beep(f, 0.22, "triangle", 0.15, i * 0.11)
    );
  }
  function sndLose() {
    beep(300, 0.28, "sine", 0.13);
    beep(220, 0.32, "sine", 0.11, 0.14);
  }

  const muteBtn = document.getElementById("muteBtn");
  const iconOn = document.getElementById("iconSoundOn");
  const iconOff = document.getElementById("iconSoundOff");
  muteBtn.addEventListener("click", () => {
    ensureCtx();
    soundOn = !soundOn;
    iconOn.hidden = !soundOn;
    iconOff.hidden = soundOn;
    if (soundOn) beep(500, 0.08, "sine", 0.12);
  });

  let pendingWords = [];
  let targetTouched = false;
  let usingDifficultyDefaults = false;
  let editingId = null;
  let current = null;
  let gridData = null;
  let foundSet = new Set();
  let cellSizePct = 0;
  let timerInterval = null;
  let remaining = 0;
  let selecting = false;
  let startCell = null;
  let curPath = [];
  let gameEnded = false;
  const lineColors = ["#1C84DD", "#F3B444", "#0D3B66", "#7CAE5C"];
  let colorIdx = 0;

  const els = {};
  [
    "view-home",
    "view-game",
    "grid",
    "lineOverlay",
    "wordList",
    "gameTitle",
    "gameSub",
    "timerNum",
    "ringFg",
    "timerRing",
    "timerBox",
    "modalCreate",
    "modalSaved",
    "modalResult",
    "createModalTitle",
    "inpName",
    "inpWords",
    "inpDifficulty",
    "previewWords",
    "inpTarget",
    "targetVal",
    "targetMax",
    "inpDuration",
    "durationVal",
    "inpSave",
    "createErr",
    "savedList",
    "resultIcon",
    "resultTitle",
    "resultMsg",
    "statFound",
    "statTime",
    "confettiWrap",
    "progressBadge",
    "startCreated",
    "hintOverlay",
    "suggestionBank",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });

  const DIFFICULTY_WORDS = {
    easy: [
      "MOUSE",
      "SCREEN",
      "LAPTOP",
      "PHONE",
      "EMAIL",
      "WIFI",
      "USB",
      "FILE",
      "FOLDER",
      "PRINT",
    ],
    medium: [
      "HTML",
      "CSS",
      "PYTHON",
      "BROWSER",
      "SERVER",
      "DATABASE",
      "FUNCTION",
      "VARIABLE",
      "DEBUG",
      "INPUT",
      "OUTPUT",
      "LOGIN",
      "CODE",
      "SYNTAX",
    ],
    hard: [
      "ALGORITHM",
      "JAVASCRIPT",
      "TERMINAL",
      "FRAMEWORK",
      "REPOSITORY",
      "ENCRYPTION",
      "FIREWALL",
      "COMPILER",
      "PROTOCOL",
      "RECURSION",
      "NETWORK",
      "CACHE",
      "ASYNC",
      "INTERFACE",
      "CONSTRUCTOR",
      "AUTHENTICATION",
    ],
  };

  const DIFFICULTY_LABELS = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
  };

  function showView(id) {
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById(id).classList.add("active");
  }
  function openModal(el) {
    el.hidden = false;
  }
  function closeModal(el) {
    el.hidden = true;
  }
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.addEventListener(
      "click",
      () => (b.closest(".modal-backdrop").hidden = true)
    );
  });
  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => {
      if (e.target === bd) bd.hidden = true;
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      document
        .querySelectorAll(".modal-backdrop:not([hidden])")
        .forEach((m) => (m.hidden = true));
  });

  document.getElementById("logoHome").addEventListener("click", () => {
    stopTimer();
    showView("view-home");
  });
  document.getElementById("backHome").addEventListener("click", () => {
    stopTimer();
    showView("view-home");
  });
  document
    .getElementById("openCreate")
    .addEventListener("click", () => resetCreateModal());
  document
    .getElementById("openSavedTop")
    .addEventListener("click", () => openSavedModal());
  document
    .getElementById("openSavedHero")
    .addEventListener("click", () => openSavedModal());

  function fillRange(el) {
    const min = +el.min,
      max = +el.max,
      val = +el.value;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    el.style.background = `linear-gradient(to right, var(--blue) ${pct}%, var(--gray) ${pct}%)`;
  }
  function fmtMMSS(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  els.inpTarget.addEventListener("input", () => {
    targetTouched = true;
    els.targetVal.textContent = els.inpTarget.value;
    fillRange(els.inpTarget);
  });
  els.inpDuration.addEventListener("input", () => {
    els.durationVal.textContent = fmtMMSS(parseInt(els.inpDuration.value));
    fillRange(els.inpDuration);
  });

  function resetCreateModal() {
    editingId = null;
    targetTouched = false;
    usingDifficultyDefaults = true;
    pendingWords = [];
    els.createModalTitle.textContent = "Create New Game";
    els.startCreated.textContent = "Start Game";
    els.inpName.value = "";
    els.inpDifficulty.value = "easy";
    els.inpTarget.min = 1;
    els.inpTarget.max = 1;
    els.inpTarget.value = 1;
    els.inpDuration.value = 180;
    els.inpSave.checked = true;
    els.createErr.style.display = "none";
    setDifficultyWords("easy");
    els.durationVal.textContent = fmtMMSS(180);
    fillRange(els.inpDuration);
    openModal(els.modalCreate);
    setTimeout(() => els.inpName.focus(), 60);
  }

  function openEditModal(game) {
    editingId = game.id;
    targetTouched = true;
    usingDifficultyDefaults = false;
    pendingWords = [...game.words];
    els.createModalTitle.textContent = "Edit Game";
    els.startCreated.textContent = "Save & Play";
    els.inpName.value = game.name;
    els.inpWords.value = game.words.join(", ");
    els.inpDifficulty.value = game.difficulty || "medium";
    renderPreviewWords();
    els.inpTarget.max = Math.max(1, pendingWords.length);
    els.inpTarget.value = Math.min(game.targetCount, pendingWords.length);
    els.targetVal.textContent = els.inpTarget.value;
    els.targetMax.textContent = pendingWords.length;
    els.inpDuration.value = game.timeLimit;
    els.durationVal.textContent = fmtMMSS(game.timeLimit);
    els.inpSave.checked = true;
    els.createErr.style.display = "none";
    fillRange(els.inpTarget);
    fillRange(els.inpDuration);
    openModal(els.modalCreate);
  }

  function parseWords(raw) {
    return raw
      .split(/[\n,]+/)
      .map((w) =>
        w
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
      )
      .filter((w) => w.length >= 2)
      .filter((w, i, arr) => arr.indexOf(w) === i)
      .slice(0, 40);
  }

  function syncWordsFromInput() {
    pendingWords = parseWords(els.inpWords.value);
    renderPreviewWords();
    const maxW = Math.max(1, pendingWords.length);
    els.targetMax.textContent = pendingWords.length;
    els.inpTarget.max = maxW;
    if (!targetTouched) {
      els.inpTarget.value = defaultTargetForCount(pendingWords.length);
    } else if (parseInt(els.inpTarget.value) > pendingWords.length) {
      els.inpTarget.value = maxW;
    }
    els.targetVal.textContent = els.inpTarget.value;
    fillRange(els.inpTarget);
  }

  function defaultTargetForCount(count) {
    if (count <= 0) return 1;
    return Math.min(count, Math.max(2, Math.ceil(count * 0.55)));
  }

  function setInputWords(words, fromDifficultyDefaults) {
    usingDifficultyDefaults = !!fromDifficultyDefaults;
    els.inpWords.value = words.join(", ");
    syncWordsFromInput();
  }

  function setDifficultyWords(difficulty) {
    targetTouched = false;
    setInputWords(
      DIFFICULTY_WORDS[difficulty] || DIFFICULTY_WORDS.medium,
      true
    );
  }

  els.inpWords.addEventListener("input", () => {
    usingDifficultyDefaults = false;
    syncWordsFromInput();
  });

  els.inpDifficulty.addEventListener("change", () => {
    if (editingId) return;
    if (usingDifficultyDefaults || !parseWords(els.inpWords.value).length) {
      setDifficultyWords(els.inpDifficulty.value);
    }
  });

  els.suggestionBank.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-difficulty]");
    if (!btn) return;
    els.inpDifficulty.value = btn.dataset.difficulty;
    setDifficultyWords(btn.dataset.difficulty);
  });

  function renderPreviewWords() {
    els.previewWords.innerHTML = "";
    if (!pendingWords.length) {
      els.previewWords.innerHTML =
        '<span class="empty-note">Enter words above and they will appear here</span>';
      els.targetMax.textContent = 0;
      return;
    }
    pendingWords.forEach((w) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span>${w}</span><button class="rm" type="button" title="Remove">✕</button>`;
      chip.querySelector(".rm").addEventListener("click", () => {
        setInputWords(pendingWords.filter((x) => x !== w));
      });
      els.previewWords.appendChild(chip);
    });
    els.targetMax.textContent = pendingWords.length;
  }

  els.startCreated.addEventListener("click", () => {
    pendingWords = parseWords(els.inpWords.value);
    if (pendingWords.length < 2) {
      els.createErr.textContent = "Enter at least two valid words.";
      els.createErr.style.display = "block";
      return;
    }
    let target = parseInt(els.inpTarget.value) || 1;
    target = Math.max(1, Math.min(target, pendingWords.length));
    const timeLimit = Math.max(20, parseInt(els.inpDuration.value) || 180);

    const game = {
      id:
        editingId ||
        "g_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      name: els.inpName.value.trim() || "Untitled Game",
      words: pendingWords,
      difficulty: els.inpDifficulty.value || "medium",
      targetCount: target,
      timeLimit: timeLimit,
      createdAt: Date.now(),
    };
    if (els.inpSave.checked) {
      const list = getGames();
      const idx = list.findIndex((x) => x.id === game.id);
      if (idx >= 0) list[idx] = game;
      else list.unshift(game);
      setGames(list);
    }
    editingId = null;
    closeModal(els.modalCreate);
    launchGame(game);
  });

  function openSavedModal() {
    renderSavedList();
    openModal(els.modalSaved);
  }
  function renderSavedList() {
    const list = getGames();
    if (!list.length) {
      els.savedList.innerHTML =
        '<p class="empty-note">No saved games yet. Create a game and enable the save option.</p>';
      return;
    }
    els.savedList.innerHTML = "";
    list.forEach((g) => {
      const row = document.createElement("div");
      row.className = "saved-item";
      const mins = Math.floor(g.timeLimit / 60),
        secs = g.timeLimit % 60;
      const difficultyLabel =
        DIFFICULTY_LABELS[g.difficulty] || DIFFICULTY_LABELS.medium;
      row.innerHTML = `
        <div class="info">
          <b>${escapeHtml(g.name)}</b>
          <span>${g.words.length} words · Win goal ${
        g.targetCount
      } words · ${mins}:${String(secs).padStart(2, "0")} min</span>
        </div>
        <div class="actions">
          <button class="icon-btn edit" title="Edit" data-id="${g.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0D3B66" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn play" title="Play" data-id="${g.id}">
            <svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="icon-btn del" title="Delete" data-id="${g.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0D3B66" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>`;
      row.querySelector(".info span").textContent += ` - ${difficultyLabel}`;
      row.querySelector(".edit").addEventListener("click", () => {
        closeModal(els.modalSaved);
        openEditModal(g);
      });
      row.querySelector(".play").addEventListener("click", () => {
        closeModal(els.modalSaved);
        launchGame(g);
      });
      row.querySelector(".del").addEventListener("click", () => {
        setGames(getGames().filter((x) => x.id !== g.id));
        renderSavedList();
      });
      els.savedList.appendChild(row);
    });
  }
  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ];
  const DIFFICULTY_DIRS = {
    easy: [
      [0, 1],
      [1, 0],
    ],
    medium: [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ],
    hard: DIRS,
  };
  const GRID_LIMITS = {
    easy: { min: 10, max: 18 },
    medium: { min: 12, max: 22 },
    hard: { min: 14, max: 26 },
  };
  const WORD_LIMITS = {
    easy: 10,
    medium: 14,
    hard: 40,
  };

  function computeSize(words, difficulty) {
    const longest = Math.max(...words.map((w) => w.length));
    const totalLetters = words.reduce((a, w) => a + w.length, 0);
    const count = words.length;
    const limits = GRID_LIMITS[difficulty] || GRID_LIMITS.medium;
    const density =
      difficulty === "easy" ? 0.44 : difficulty === "hard" ? 0.58 : 0.5;
    const padding = difficulty === "easy" ? 2 : difficulty === "hard" ? 0 : 1;
    const bySpace = Math.ceil(Math.sqrt(totalLetters / density));
    const byCount = Math.ceil(count / 2) + 3;
    let size = Math.max(bySpace, longest + 1 + padding, byCount + padding);
    return Math.min(Math.max(size, limits.min), limits.max);
  }

  function wordsForRound(words, difficulty) {
    const limit = WORD_LIMITS[difficulty] || WORD_LIMITS.medium;
    if (words.length <= limit) return [...words];
    return [...words]
      .sort((a, b) => a.length - b.length || a.localeCompare(b))
      .slice(0, limit);
  }

  function buildGrid(words, difficulty) {
    const level = DIFFICULTY_DIRS[difficulty] ? difficulty : "medium";
    const limits = GRID_LIMITS[level] || GRID_LIMITS.medium;
    let size = computeSize(words, level);
    let result = null;
    while (!result && size <= limits.max) {
      result = tryPlaceAll(words, size, false, level);
      if (!result) size++;
    }
    if (!result) result = tryPlaceAll(words, limits.max, true, level);
    return result;
  }

  function tryPlaceAll(words, size, force, difficulty) {
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    const placements = {};
    const dirs = DIFFICULTY_DIRS[difficulty] || DIFFICULTY_DIRS.medium;
    const sorted = [...words].sort((a, b) => b.length - a.length);
    for (const word of sorted) {
      let placed = false;
      for (let tries = 0; tries < 600 && !placed; tries++) {
        const dir = dirs[Math.floor(Math.random() * dirs.length)];
        const r0 = Math.floor(Math.random() * size);
        const c0 = Math.floor(Math.random() * size);
        const rEnd = r0 + dir[0] * (word.length - 1);
        const cEnd = c0 + dir[1] * (word.length - 1);
        if (rEnd < 0 || rEnd >= size || cEnd < 0 || cEnd >= size) continue;
        let ok = true;
        const cells = [];
        for (let i = 0; i < word.length; i++) {
          const r = r0 + dir[0] * i,
            c = c0 + dir[1] * i;
          const ex = grid[r][c];
          if (ex && ex !== word[i]) {
            ok = false;
            break;
          }
          cells.push({ r, c });
        }
        if (!ok) continue;
        cells.forEach((cell, i) => {
          grid[cell.r][cell.c] = word[i];
        });
        placements[word] = { cells };
        placed = true;
      }
      if (!placed && !force) return null;
    }
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        if (!grid[r][c]) grid[r][c] = letters[Math.floor(Math.random() * 26)];
      }
    return { size, grid, placements };
  }

  function launchGame(game) {
    const difficulty = game.difficulty || "medium";
    const roundWords = wordsForRound(game.words, difficulty);
    const requestedTarget =
      parseInt(game.targetCount) || defaultTargetForCount(roundWords.length);
    current = {
      ...game,
      difficulty,
      words: roundWords,
      originalWordCount: game.words.length,
      targetCount: Math.min(requestedTarget, roundWords.length),
    };
    foundSet = new Set();
    gameEnded = false;
    colorIdx = 0;
    gridData = buildGrid(current.words, difficulty);
    cellSizePct = 100 / gridData.size;

    els.gameTitle.textContent = current.name;
    updateProgress();
    renderGrid();
    renderWordList();
    startTimer(current.timeLimit);
    showView("view-game");
    revealed = false;
    const revealBtn = document.getElementById("revealWords");
    if (revealBtn)
      revealBtn.textContent = "Reveal all words (confirm they're in the grid)";
  }
  document.getElementById("restartSame").addEventListener("click", () => {
    if (current) launchGame(current);
  });

  let revealed = false;
  document.getElementById("revealWords").addEventListener("click", (e) => {
    revealed = !revealed;
    e.target.textContent = revealed
      ? "Hide revealed words"
      : "Reveal all words (confirm they're in the grid)";
    els.hintOverlay.innerHTML = "";
    if (revealed) {
      Object.keys(gridData.placements).forEach((word) => {
        const cells = gridData.placements[word].cells;
        drawHintLine(cells[0], cells[cells.length - 1]);
      });
    }
  });
  function drawHintLine(a, b) {
    const frac = cellSizePct;
    const x1 = (a.c + 0.5) * frac,
      y1 = (a.r + 0.5) * frac;
    const x2 = (b.c + 0.5) * frac,
      y2 = (b.r + 0.5) * frac;
    const dx = x2 - x1,
      dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const line = document.createElement("div");
    line.className = "hint-line";
    line.style.left = x1 + "%";
    line.style.top = y1 + "%";
    line.style.width = len + "%";
    line.style.transform = `rotate(${ang}deg)`;
    els.hintOverlay.appendChild(line);
  }

  function updateProgress() {
    const difficultyLabel =
      DIFFICULTY_LABELS[current.difficulty] || DIFFICULTY_LABELS.medium;
    const roundNote =
      current.originalWordCount > current.words.length
        ? ` - ${current.words.length} of ${current.originalWordCount} words in this round`
        : "";
    els.gameSub.textContent = `${difficultyLabel}${roundNote} - drag to select a word - need ${current.targetCount} to win`;
    els.progressBadge.textContent = `${foundSet.size}/${current.targetCount}`;
  }

  function renderGrid() {
    const wrap = document.getElementById("gridWrap");
    wrap.style.animation = "none";
    void wrap.offsetWidth;
    wrap.style.animation = "";
    const g = els.grid;
    g.innerHTML = "";
    g.style.gridTemplateColumns = `repeat(${gridData.size}, 1fr)`;
    g.style.gridTemplateRows = `repeat(${gridData.size}, 1fr)`;
    els.lineOverlay.innerHTML = "";
    els.hintOverlay.innerHTML = "";
    for (let r = 0; r < gridData.size; r++) {
      for (let c = 0; c < gridData.size; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.textContent = gridData.grid[r][c];
        cell.dataset.r = r;
        cell.dataset.c = c;
        g.appendChild(cell);
      }
    }
    attachPointerHandlers();
  }
  function cellEl(r, c) {
    return els.grid.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }

  function renderWordList() {
    els.wordList.innerHTML = "";
    current.words.forEach((w) => {
      const chip = document.createElement("div");
      chip.className = "word-chip" + (foundSet.has(w) ? " found" : "");
      chip.textContent = w;
      chip.dataset.word = w;
      els.wordList.appendChild(chip);
    });
  }

  let handlersAttached = false;
  function attachPointerHandlers() {
    if (handlersAttached) return;
    handlersAttached = true;
    const gridEl = els.grid;
    gridEl.addEventListener("pointerdown", onDown);
    gridEl.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }
  function cellFromPoint(x, y) {
    const rect = els.grid.getBoundingClientRect();
    const px = (x - rect.left) / rect.width,
      py = (y - rect.top) / rect.height;
    const c = Math.floor(px * gridData.size);
    const r = Math.floor(py * gridData.size);
    if (r < 0 || c < 0 || r >= gridData.size || c >= gridData.size) return null;
    return { r, c };
  }
  function onDown(e) {
    if (gameEnded) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    selecting = true;
    startCell = cell;
    curPath = [cell];
    try {
      els.grid.setPointerCapture(e.pointerId);
    } catch (err) {}
    paintPreview();
  }
  function onMove(e) {
    if (!selecting || gameEnded) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    curPath = snapPath(startCell, cell);
    paintPreview();
  }
  function onUp(e) {
    if (!selecting) return;
    selecting = false;
    if (gameEnded) {
      curPath = [];
      paintPreview();
      return;
    }
    evaluateSelection();
  }
  function snapPath(start, end) {
    let dr = end.r - start.r,
      dc = end.c - start.c;
    if (dr === 0 && dc === 0) return [start];
    const adr = Math.abs(dr),
      adc = Math.abs(dc);
    let sr, sc;
    if (adr === 0) {
      sr = 0;
      sc = Math.sign(dc);
    } else if (adc === 0) {
      sr = Math.sign(dr);
      sc = 0;
    } else if (adr >= adc * 1.8) {
      sr = Math.sign(dr);
      sc = 0;
    } else if (adc >= adr * 1.8) {
      sr = 0;
      sc = Math.sign(dc);
    } else {
      sr = Math.sign(dr);
      sc = Math.sign(dc);
    }
    const len = sr !== 0 && sc !== 0 ? Math.min(adr, adc) : Math.max(adr, adc);
    const path = [];
    for (let i = 0; i <= len; i++) {
      const r = start.r + sr * i,
        c = start.c + sc * i;
      if (r < 0 || c < 0 || r >= gridData.size || c >= gridData.size) break;
      path.push({ r, c });
    }
    return path;
  }
  function paintPreview() {
    document
      .querySelectorAll(".cell.preview")
      .forEach((el) => el.classList.remove("preview"));
    curPath.forEach((cell) => {
      const el = cellEl(cell.r, cell.c);
      if (el && !el.classList.contains("found")) el.classList.add("preview");
    });
  }
  function evaluateSelection() {
    document
      .querySelectorAll(".cell.preview")
      .forEach((el) => el.classList.remove("preview"));
    if (curPath.length < 2) {
      curPath = [];
      return;
    }
    const straight = curPath.map((c) => gridData.grid[c.r][c.c]).join("");
    const reversed = straight.split("").reverse().join("");
    let match = current.words.find(
      (w) => (w === straight || w === reversed) && !foundSet.has(w)
    );
    if (match) {
      sndCorrect();
      markFound(match, curPath);
    } else {
      sndWrong();
      curPath.forEach((cell) => {
        const el = cellEl(cell.r, cell.c);
        if (el) el.classList.add("wrong");
      });
      const dying = curPath;
      setTimeout(() => {
        dying.forEach((cell) => {
          const el = cellEl(cell.r, cell.c);
          if (el) el.classList.remove("wrong");
        });
      }, 320);
    }
    curPath = [];
  }

  function markFound(word, path) {
    foundSet.add(word);
    const color = lineColors[colorIdx % lineColors.length];
    colorIdx++;
    path.forEach((cell) => {
      const el = cellEl(cell.r, cell.c);
      if (el) {
        el.classList.add("found");
        el.style.background = color;
      }
    });
    drawLine(path[0], path[path.length - 1], color);

    const chip = els.wordList.querySelector(`.word-chip[data-word="${word}"]`);
    if (chip) chip.classList.add("found");

    updateProgress();
    if (foundSet.size >= current.targetCount) {
      triggerResult(true);
    }
  }

  function drawLine(a, b, color) {
    const frac = cellSizePct;
    const x1 = (a.c + 0.5) * frac,
      y1 = (a.r + 0.5) * frac;
    const x2 = (b.c + 0.5) * frac,
      y2 = (b.r + 0.5) * frac;
    const dx = x2 - x1,
      dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const line = document.createElement("div");
    line.className = "found-line";
    line.style.left = x1 + "%";
    line.style.top = y1 + "%";
    line.style.width = len + "%";
    line.style.background = color;
    line.style.transform = `rotate(${ang}deg)`;
    els.lineOverlay.appendChild(line);
  }

  const RING_CIRC = 2 * Math.PI * 19;
  function startTimer(seconds) {
    stopTimer();
    remaining = seconds;
    updateTimerUI(seconds);
    timerInterval = setInterval(() => {
      remaining--;
      updateTimerUI(remaining);
      if (remaining <= 0) {
        stopTimer();
        sndLose();
        triggerResult(false);
      }
    }, 1000);
  }
  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }
  function updateTimerUI(sec) {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60),
      s = sec % 60;
    els.timerNum.textContent = `${m}:${String(s).padStart(2, "0")}`;
    const total = current ? current.timeLimit : 1;
    const ratio = Math.max(0, sec / total);
    els.ringFg.style.strokeDasharray = RING_CIRC;
    els.ringFg.style.strokeDashoffset = RING_CIRC * (1 - ratio);
    const low = ratio <= 0.15;
    els.timerBox.classList.toggle("low", low);
    els.timerRing.classList.toggle("low", low);
  }

  const winMsgs = [
    "Excellent! You found the required number of words before time ran out.",
    "Clean run! You hit the win goal with time to spare.",
    "Nailed it — you reached the target word count.",
  ];
  const loseMsgs = [
    "Time's up! Give it another shot — you'll likely be faster next time.",
    "So close! Time ran out before you hit the target — try adding more time in the settings.",
    "You don't have to hit the goal on the first try. Give it another go!",
  ];

  function triggerResult(won) {
    gameEnded = true;
    selecting = false;
    curPath = [];
    paintPreview();
    stopTimer();
    els.statFound.textContent = `${foundSet.size}/${current.targetCount}`;
    const used = current.timeLimit - Math.max(0, remaining);
    els.statTime.textContent = `${Math.floor(used / 60)}:${String(
      used % 60
    ).padStart(2, "0")}`;

    if (won) {
      els.resultTitle.textContent = "You Won!";
      els.resultMsg.textContent =
        winMsgs[Math.floor(Math.random() * winMsgs.length)];
      els.resultIcon.innerHTML = winIconSvg();
      sndWin();
      spawnConfetti();
    } else {
      els.resultTitle.textContent = "Time's Up";
      els.resultMsg.textContent =
        loseMsgs[Math.floor(Math.random() * loseMsgs.length)];
      els.resultIcon.innerHTML = loseIconSvg();
      els.confettiWrap.innerHTML = "";
    }
    openModal(els.modalResult);
  }
  function winIconSvg() {
    return `<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="32" fill="#F3B444"/><path d="M20 36 L30 46 L50 24" stroke="#0D3B66" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function loseIconSvg() {
    return `<svg width="70" height="70" viewBox="0 0 70 70"><circle cx="35" cy="35" r="32" fill="#D9E1E0"/><path d="M35 20 V40" stroke="#0D3B66" stroke-width="5" stroke-linecap="round"/><circle cx="35" cy="49" r="3.4" fill="#0D3B66"/></svg>`;
  }
  function spawnConfetti() {
    els.confettiWrap.innerHTML = "";
    const colors = ["#1C84DD", "#F3B444", "#0D3B66", "#7CAE5C"];
    for (let i = 0; i < 18; i++) {
      const el = document.createElement("div");
      el.className = "confetti";
      el.style.left = Math.random() * 100 + "%";
      el.style.background = colors[i % colors.length];
      el.style.animationDelay = Math.random() * 0.4 + "s";
      el.style.transform = `rotate(${Math.random() * 360}deg)`;
      els.confettiWrap.appendChild(el);
    }
  }

  document.getElementById("resultHome").addEventListener("click", () => {
    closeModal(els.modalResult);
    showView("view-home");
  });
  document.getElementById("resultReplay").addEventListener("click", () => {
    closeModal(els.modalResult);
    if (current) launchGame(current);
  });

  fillRange(els.inpTarget);
  fillRange(els.inpDuration);
})();
