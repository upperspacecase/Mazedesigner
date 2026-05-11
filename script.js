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
      setStatus(`Entrance "${side}" ${entrancesActive[side] ? "enabled" : "disabled"}.`);
    });
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      paintMode = btn.dataset.mode;
    });
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

  // --- Init ----------------------------------------------------------------

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "";
    if (kind === "ok") statusEl.classList.add("is-ok");
    else if (kind === "err") statusEl.classList.add("is-err");
  }

  buildGrid();
  syncEntranceButtons();
  render();
  setStatus("Ready. Top entrance enabled by default.");
})();
