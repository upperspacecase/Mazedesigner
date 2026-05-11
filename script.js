(() => {
  const SIZE = 9;
  const CENTER_MIN = 3;
  const CENTER_MAX = 5;
  const MID = 4;

  // Entrance positions: each side's middle border cell.
  const ENTRANCES = {
    top:    { r: 0,        c: MID },
    bottom: { r: SIZE - 1, c: MID },
    left:   { r: MID,      c: 0 },
    right:  { r: MID,      c: SIZE - 1 },
  };

  // Cell roles
  const ROLE_NORMAL = "normal";
  const ROLE_CENTER = "center";
  const ROLE_ENTRANCE = "entrance";

  // Paint modes
  let paintMode = "path"; // or "wall"

  // Grid state: each cell is { open: bool }
  // Center cells are always open. Entrance cells are open iff the entrance is enabled.
  const cells = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ open: false }))
  );

  // Which entrances are active.
  const entrancesActive = { top: true, right: false, bottom: false, left: false };

  const gridEl = document.getElementById("grid");
  const statusEl = document.getElementById("status-line");
  const jsonArea = document.getElementById("json-area");

  // --- Cell role helpers ---------------------------------------------------

  function isCenter(r, c) {
    return r >= CENTER_MIN && r <= CENTER_MAX && c >= CENTER_MIN && c <= CENTER_MAX;
  }

  function entranceSideAt(r, c) {
    for (const side of Object.keys(ENTRANCES)) {
      const e = ENTRANCES[side];
      if (e.r === r && e.c === c) return side;
    }
    return null;
  }

  function roleOf(r, c) {
    if (isCenter(r, c)) return ROLE_CENTER;
    if (entranceSideAt(r, c)) return ROLE_ENTRANCE;
    return ROLE_NORMAL;
  }

  function isOpen(r, c) {
    const role = roleOf(r, c);
    if (role === ROLE_CENTER) return true;
    if (role === ROLE_ENTRANCE) return entrancesActive[entranceSideAt(r, c)];
    return cells[r][c].open;
  }

  // --- DOM construction ----------------------------------------------------

  const cellEls = [];

  function buildGrid() {
    gridEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        const el = document.createElement("div");
        el.className = "cell";
        el.dataset.r = r;
        el.dataset.c = c;
        const role = roleOf(r, c);
        if (role === ROLE_ENTRANCE) el.classList.add("is-entrance-slot");
        gridEl.appendChild(el);
        row.push(el);
      }
      cellEls.push(row);
    }
  }

  function render() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cellEls[r][c];
        const role = roleOf(r, c);
        el.classList.remove("is-path", "is-center", "is-entrance", "is-path-on-route");
        if (role === ROLE_CENTER) {
          el.classList.add("is-center");
        } else if (role === ROLE_ENTRANCE) {
          if (entrancesActive[entranceSideAt(r, c)]) el.classList.add("is-entrance");
        } else if (cells[r][c].open) {
          el.classList.add("is-path");
        }
      }
    }
  }

  // --- Painting ------------------------------------------------------------

  let isPainting = false;
  let paintValue = null; // true => open, false => wall

  function paintCell(r, c) {
    if (roleOf(r, c) !== ROLE_NORMAL) return;
    const desired = paintValue;
    if (cells[r][c].open === desired) return;
    cells[r][c].open = desired;
    const el = cellEls[r][c];
    el.classList.toggle("is-path", desired);
  }

  function onPointerDown(e) {
    const target = e.target.closest(".cell");
    if (!target) return;
    const r = +target.dataset.r;
    const c = +target.dataset.c;
    if (roleOf(r, c) !== ROLE_NORMAL) return;
    isPainting = true;
    // Determine paint value:
    //   - If paint mode forces a side, use it.
    //   - Otherwise toggle from the cell's current state.
    if (paintMode === "path") paintValue = true;
    else if (paintMode === "wall") paintValue = false;
    else paintValue = !cells[r][c].open;
    paintCell(r, c);
    e.preventDefault();
    gridEl.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    if (!isPainting) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !el.classList.contains("cell")) return;
    const r = +el.dataset.r;
    const c = +el.dataset.c;
    paintCell(r, c);
  }

  function onPointerUp() {
    isPainting = false;
    paintValue = null;
    clearRouteHighlight();
  }

  gridEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  // Prevent right-click context menu on the grid so future right-click erase can be added.
  gridEl.addEventListener("contextmenu", (e) => e.preventDefault());

  // --- Buttons -------------------------------------------------------------

  document.querySelectorAll(".entrance-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.side;
      entrancesActive[side] = !entrancesActive[side];
      btn.classList.toggle("is-active", entrancesActive[side]);
      render();
      setStatus(
        `Entrance "${side}" ${entrancesActive[side] ? "enabled" : "disabled"}. ` +
        `Hit Generate to recarve corridors.`
      );
    });
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      paintMode = btn.dataset.mode;
    });
  });

  document.getElementById("btn-generate").addEventListener("click", () => {
    const difficulty = document.getElementById("gen-difficulty").value;
    const sidesUsed = generateMaze(difficulty);
    const result = checkSolvable();
    showSolvability(result);
    setStatus(
      `Generated ${difficulty} maze with ${sidesUsed.length} entrance${sidesUsed.length === 1 ? "" : "s"} (${sidesUsed.join(", ")}).`,
      result.ok ? "ok" : "err"
    );
  });

  document.getElementById("btn-rand-entrances").addEventListener("click", () => {
    randomizeEntrances();
    syncEntranceButtons();
    render();
    setStatus(`Randomized entrances: ${activeSides().join(", ") || "none"}.`);
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (roleOf(r, c) === ROLE_NORMAL) cells[r][c].open = false;
      }
    }
    render();
    setStatus("Cleared all paths.");
  });

  document.getElementById("btn-check").addEventListener("click", () => {
    const result = checkSolvable();
    showSolvability(result);
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    jsonArea.value = JSON.stringify(serialize(), null, 2);
    setStatus("Exported maze to JSON.");
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    try {
      const data = JSON.parse(jsonArea.value);
      deserialize(data);
      render();
      syncEntranceButtons();
      setStatus("Imported maze from JSON.");
    } catch (err) {
      setStatus(`Import failed: ${err.message}`, "err");
    }
  });

  // --- Serialization -------------------------------------------------------

  function serialize() {
    const grid = [];
    for (let r = 0; r < SIZE; r++) {
      const row = [];
      for (let c = 0; c < SIZE; c++) {
        row.push(isOpen(r, c) ? 1 : 0);
      }
      grid.push(row);
    }
    return {
      size: SIZE,
      center: { rMin: CENTER_MIN, rMax: CENTER_MAX, cMin: CENTER_MIN, cMax: CENTER_MAX },
      entrances: { ...entrancesActive },
      grid,
    };
  }

  function deserialize(data) {
    if (!data || data.size !== SIZE || !Array.isArray(data.grid) || data.grid.length !== SIZE) {
      throw new Error("invalid maze data");
    }
    if (data.entrances) {
      for (const side of Object.keys(entrancesActive)) {
        entrancesActive[side] = !!data.entrances[side];
      }
    }
    for (let r = 0; r < SIZE; r++) {
      if (!Array.isArray(data.grid[r]) || data.grid[r].length !== SIZE) {
        throw new Error(`invalid row ${r}`);
      }
      for (let c = 0; c < SIZE; c++) {
        if (roleOf(r, c) !== ROLE_NORMAL) continue;
        cells[r][c].open = !!data.grid[r][c];
      }
    }
  }

  function syncEntranceButtons() {
    document.querySelectorAll(".entrance-btn").forEach((btn) => {
      btn.classList.toggle("is-active", entrancesActive[btn.dataset.side]);
    });
  }

  // --- Solvability check ---------------------------------------------------

  function checkSolvable() {
    const activeSides = Object.keys(entrancesActive).filter((s) => entrancesActive[s]);
    if (activeSides.length === 0) {
      return { ok: false, reason: "no entrances enabled", reachable: [], unreachable: [] };
    }

    const reachable = [];
    const unreachable = [];
    const anyRouteCells = new Set();

    for (const side of activeSides) {
      const start = ENTRANCES[side];
      const result = bfsToCenter(start.r, start.c);
      if (result.found) {
        reachable.push(side);
        for (const key of result.path) anyRouteCells.add(key);
      } else {
        unreachable.push(side);
      }
    }

    return {
      ok: unreachable.length === 0,
      reachable,
      unreachable,
      routeCells: anyRouteCells,
    };
  }

  function bfsToCenter(startR, startC) {
    if (!isOpen(startR, startC)) return { found: false };
    const visited = new Array(SIZE * SIZE).fill(false);
    const parent = new Array(SIZE * SIZE).fill(-1);
    const queue = [];
    const startIdx = startR * SIZE + startC;
    visited[startIdx] = true;
    queue.push(startIdx);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    let goal = -1;
    while (queue.length) {
      const idx = queue.shift();
      const r = Math.floor(idx / SIZE);
      const c = idx % SIZE;
      if (isCenter(r, c)) { goal = idx; break; }
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (!isOpen(nr, nc)) continue;
        const nIdx = nr * SIZE + nc;
        if (visited[nIdx]) continue;
        visited[nIdx] = true;
        parent[nIdx] = idx;
        queue.push(nIdx);
      }
    }
    if (goal === -1) return { found: false };
    const path = new Set();
    let cur = goal;
    while (cur !== -1) {
      path.add(cur);
      cur = parent[cur];
    }
    return { found: true, path };
  }

  function showSolvability(result) {
    clearRouteHighlight();
    if (!result.ok && result.reason === "no entrances enabled") {
      setStatus("Enable at least one entrance to check solvability.", "err");
      return;
    }
    if (result.routeCells) {
      for (const idx of result.routeCells) {
        const r = Math.floor(idx / SIZE);
        const c = idx % SIZE;
        if (roleOf(r, c) === ROLE_NORMAL) cellEls[r][c].classList.add("is-path-on-route");
      }
    }
    if (result.ok) {
      setStatus(`Solvable from every active entrance (${result.reachable.join(", ")}).`, "ok");
    } else {
      setStatus(
        `Unreachable from: ${result.unreachable.join(", ") || "none"}. ` +
        `Reachable from: ${result.reachable.join(", ") || "none"}.`,
        "err"
      );
    }
  }

  function clearRouteHighlight() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        cellEls[r][c].classList.remove("is-path-on-route");
      }
    }
  }

  // --- Generation ----------------------------------------------------------

  const BRANCH_COUNT = { low: 1, medium: 4, high: 8 };
  const BRANCH_MAX_LEN = { low: 3, medium: 5, high: 7 };

  function activeSides() {
    return Object.keys(entrancesActive).filter((s) => entrancesActive[s]);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function randomizeEntrances() {
    const sides = shuffle(Object.keys(ENTRANCES));
    const count = 1 + Math.floor(Math.random() * 4);
    for (const s of Object.keys(entrancesActive)) entrancesActive[s] = false;
    for (let i = 0; i < count; i++) entrancesActive[sides[i]] = true;
  }

  function generateMaze(difficulty) {
    // Wipe paintable cells.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (roleOf(r, c) === ROLE_NORMAL) cells[r][c].open = false;
      }
    }

    // Need at least one entrance — randomize 1–4 if none selected.
    if (activeSides().length === 0) {
      randomizeEntrances();
      syncEntranceButtons();
    }

    // Carve a winding random path from each active entrance to the center.
    const sides = activeSides();
    for (const side of sides) {
      const start = ENTRANCES[side];
      const path = randomDFSPathToCenter(start.r, start.c);
      if (path) {
        for (const [r, c] of path) {
          if (roleOf(r, c) === ROLE_NORMAL) cells[r][c].open = true;
        }
      }
    }

    // Sprinkle dead-end branches off existing corridors for maze feel.
    const branches = BRANCH_COUNT[difficulty] ?? BRANCH_COUNT.medium;
    const maxLen = BRANCH_MAX_LEN[difficulty] ?? BRANCH_MAX_LEN.medium;
    addDeadEndBranches(branches, maxLen);

    render();
    return sides;
  }

  // Randomized DFS from (startR, startC) to any center cell. The first path
  // found tends to be winding because DFS commits to a direction before
  // backtracking. Other entrance cells are blocked so paths don't merge there.
  function randomDFSPathToCenter(startR, startC) {
    const blocked = new Set();
    for (const side of Object.keys(ENTRANCES)) {
      const e = ENTRANCES[side];
      if (!(e.r === startR && e.c === startC)) blocked.add(e.r * SIZE + e.c);
    }
    const visited = new Set([startR * SIZE + startC]);
    const stack = [{ r: startR, c: startC, path: [[startR, startC]] }];
    while (stack.length) {
      const node = stack.pop();
      if (isCenter(node.r, node.c)) return node.path;
      const dirs = shuffle([[-1,0],[1,0],[0,-1],[0,1]]);
      for (const [dr, dc] of dirs) {
        const nr = node.r + dr;
        const nc = node.c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const key = nr * SIZE + nc;
        if (visited.has(key) || blocked.has(key)) continue;
        visited.add(key);
        stack.push({ r: nr, c: nc, path: node.path.concat([[nr, nc]]) });
      }
    }
    return null;
  }

  // Pick random open cells and snake outward into walls, creating dead-ends.
  // Skips cells adjacent to the center so we don't accidentally widen it.
  function addDeadEndBranches(branches, maxLen) {
    for (let i = 0; i < branches; i++) {
      const seeds = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (roleOf(r, c) === ROLE_NORMAL && cells[r][c].open) seeds.push([r, c]);
        }
      }
      if (seeds.length === 0) return;
      let [cr, cc] = seeds[Math.floor(Math.random() * seeds.length)];
      const len = 2 + Math.floor(Math.random() * (maxLen - 1));
      for (let s = 0; s < len; s++) {
        const dirs = shuffle([[-1,0],[1,0],[0,-1],[0,1]]);
        let moved = false;
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
          if (roleOf(nr, nc) !== ROLE_NORMAL) continue;
          if (cells[nr][nc].open) continue;
          // Avoid carving a cell that touches the center, which would widen the open room.
          if (touchesCenter(nr, nc)) continue;
          cells[nr][nc].open = true;
          cr = nr; cc = nc;
          moved = true;
          break;
        }
        if (!moved) break;
      }
    }
  }

  function touchesCenter(r, c) {
    if (isCenter(r, c)) return true;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (isCenter(nr, nc)) return true;
    }
    return false;
  }

  // --- Init ----------------------------------------------------------------

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "";
    if (kind === "ok") statusEl.classList.add("is-ok");
    else if (kind === "err") statusEl.classList.add("is-err");
  }

  buildGrid();
  randomizeEntrances();
  syncEntranceButtons();
  const initialSides = generateMaze("medium");
  const initialCheck = checkSolvable();
  showSolvability(initialCheck);
  setStatus(
    `Generated medium maze with ${initialSides.length} entrance${initialSides.length === 1 ? "" : "s"} (${initialSides.join(", ")}). ` +
    `Hit Generate for a new one.`,
    initialCheck.ok ? "ok" : ""
  );
})();
