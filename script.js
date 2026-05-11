(() => {
  const SIZE = 9;
  const CENTER_MIN = 3;
  const CENTER_MAX = 5;
  const MID = 4;

  const CELL = 48;
  const MARGIN = 18;
  const SVG_W = SIZE * CELL + MARGIN * 2;
  const SVG_H = SIZE * CELL + MARGIN * 2;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const STROKE_W = Math.round(CELL * 0.42);
  const DOT_R = Math.round(CELL * 0.30);

  const ENTRANCES = {
    top:    { r: 0,        c: MID,      color: "#22c55e" },
    right:  { r: MID,      c: SIZE - 1, color: "#ef4444" },
    bottom: { r: SIZE - 1, c: MID,      color: "#3b82f6" },
    left:   { r: MID,      c: 0,        color: "#eab308" },
  };
  const SIDE_ORDER = ["top", "right", "bottom", "left"];

  const entrancesActive = { top: true, right: true, bottom: true, left: true };

  let grid;       // grid[r][c] = pathIndex (>=0) or -1 if unassigned
  let paths;      // paths[i] = ordered array of [r, c] cells
  let pathSides;  // pathSides[i] = side name corresponding to paths[i]
  let endsOnWhite; // how many completed paths have ended on a (r+c) even center
  let endsOnBlack; // how many completed paths have ended on a (r+c) odd center
  let deadline;    // performance.now() value to stop searching at

  // Parity facts for the 9x9 grid:
  //   * (r+c) even ("white") cells: 41; (r+c) odd ("black") cells: 40
  //   * All four entrance cells (0,4),(4,8),(8,4),(4,0) are white (r+c even)
  //   * Since each path starts on white, the (W − B) it contributes is +1 if
  //     it ends on white, 0 if it ends on black.
  //   * Sum over N paths must equal 41 − 40 = 1, so exactly one snake ends on
  //     a white center cell and the remaining N−1 snakes end on black ones.

  const svg = document.getElementById("maze-svg");
  const statusEl = document.getElementById("status-line");
  const jsonArea = document.getElementById("json-area");
  svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);

  // --- Helpers -------------------------------------------------------------

  function isCenter(r, c) {
    return r >= CENTER_MIN && r <= CENTER_MAX && c >= CENTER_MIN && c <= CENTER_MAX;
  }

  function activeSides() {
    return SIDE_ORDER.filter((s) => entrancesActive[s]);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function syncEntranceButtons() {
    document.querySelectorAll(".entrance-btn").forEach((btn) => {
      btn.classList.toggle("is-active", entrancesActive[btn.dataset.side]);
    });
  }

  function randomizeEntrances() {
    const sides = shuffle([...SIDE_ORDER]);
    const count = 1 + Math.floor(Math.random() * 4);
    for (const s of SIDE_ORDER) entrancesActive[s] = false;
    for (let i = 0; i < count; i++) entrancesActive[sides[i]] = true;
  }

  function unassignedNeighbors(r, c) {
    const result = [];
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
      if (grid[nr][nc] !== -1) continue;
      result.push([nr, nc]);
    }
    return result;
  }

  function countUnassigned() {
    let n = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if (grid[r][c] === -1) n++;
    }
    return n;
  }

  // --- Feasibility: union-find the unassigned cells, then verify every
  // unassigned cell is reachable from at least one source (current head or
  // future entrance) and every future entrance can still reach an unassigned
  // center cell.

  function isFeasible(pathIdx, startCells) {
    const total = SIZE * SIZE;
    const parent = new Array(total);
    for (let i = 0; i < total; i++) parent[i] = i;
    function find(x) {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    }

    // Union adjacent unassigned cells (right and down neighbors only — covers all pairs).
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== -1) continue;
        const k = r * SIZE + c;
        if (c + 1 < SIZE && grid[r][c + 1] === -1) union(k, r * SIZE + (c + 1));
        if (r + 1 < SIZE && grid[r + 1][c] === -1) union(k, (r + 1) * SIZE + c);
      }
    }

    // Collect components touched by each source via its unassigned neighbors.
    function reachableComps(sr, sc) {
      const out = new Set();
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = sr + dr, nc = sc + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (grid[nr][nc] !== -1) continue;
        out.add(find(nr * SIZE + nc));
      }
      return out;
    }

    const owned = new Set();
    const headCell = paths[pathIdx][paths[pathIdx].length - 1];
    for (const comp of reachableComps(headCell[0], headCell[1])) owned.add(comp);
    for (let i = pathIdx + 1; i < startCells.length; i++) {
      for (const comp of reachableComps(startCells[i][0], startCells[i][1])) owned.add(comp);
    }

    // Every unassigned cell must be in an owned component.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== -1) continue;
        if (!owned.has(find(r * SIZE + c))) return false;
      }
    }

    // Each future entrance must reach at least one unassigned center cell.
    for (let i = pathIdx + 1; i < startCells.length; i++) {
      const comps = reachableComps(startCells[i][0], startCells[i][1]);
      if (comps.size === 0) return false;
      let canEnd = false;
      for (let r = CENTER_MIN; r <= CENTER_MAX && !canEnd; r++) {
        for (let c = CENTER_MIN; c <= CENTER_MAX && !canEnd; c++) {
          if (grid[r][c] !== -1) continue;
          if (comps.has(find(r * SIZE + c))) canEnd = true;
        }
      }
      if (!canEnd) return false;
    }

    return true;
  }

  // --- Backtracking generator ---------------------------------------------

  function extend(pathIdx, startCells) {
    if (performance.now() > deadline) return false;

    const path = paths[pathIdx];
    const [r, c] = path[path.length - 1];
    const N = startCells.length;

    const candidates = [];

    // Candidate: end this path here (only legal inside center, and only when
    // the parity quota allows this cell's color).
    if (isCenter(r, c)) {
      const endIsWhite = ((r + c) & 1) === 0;
      const newW = endsOnWhite + (endIsWhite ? 1 : 0);
      const newB = endsOnBlack + (endIsWhite ? 0 : 1);
      // Global constraint: exactly 1 path ends on white, N−1 on black.
      const parityOk = newW <= 1 && newB <= N - 1;
      if (parityOk) {
        if (pathIdx === N - 1) {
          if (countUnassigned() === 0 && newW === 1 && newB === N - 1) return true;
        } else {
          candidates.push({ type: "next", endIsWhite });
        }
      }
    }

    // Candidate: extend to any unassigned neighbor.
    const neigh = unassignedNeighbors(r, c);
    // Light Warnsdorff bias: cells with fewer escape routes first, so the
    // search fills corners and avoids stranding cells. Tie-break randomly.
    const scored = neigh.map(([nr, nc]) => {
      let deg = 0;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nnr = nr + dr, nnc = nc + dc;
        if (nnr < 0 || nnr >= SIZE || nnc < 0 || nnc >= SIZE) continue;
        if (grid[nnr][nnc] === -1 && !(nnr === r && nnc === c)) deg++;
      }
      return { cell: [nr, nc], deg, rand: Math.random() };
    });
    scored.sort((a, b) => a.deg - b.deg || a.rand - b.rand);
    for (const s of scored) candidates.push({ type: "extend", cell: s.cell });

    // Slight randomization between ending-vs-extending so snake lengths vary.
    // We only swap the "next" candidate to a random position rather than fully
    // shuffling, so Warnsdorff order is preserved for extensions.
    const nextIdx = candidates.findIndex((c) => c.type === "next");
    if (nextIdx !== -1) {
      const target = Math.floor(Math.random() * candidates.length);
      [candidates[nextIdx], candidates[target]] = [candidates[target], candidates[nextIdx]];
    }

    for (const cand of candidates) {
      if (cand.type === "next") {
        if (cand.endIsWhite) endsOnWhite++; else endsOnBlack++;
        if (extend(pathIdx + 1, startCells)) return true;
        if (cand.endIsWhite) endsOnWhite--; else endsOnBlack--;
      } else {
        const [nr, nc] = cand.cell;
        grid[nr][nc] = pathIdx;
        path.push([nr, nc]);
        if (isFeasible(pathIdx, startCells) && extend(pathIdx, startCells)) return true;
        grid[nr][nc] = -1;
        path.pop();
      }
    }

    return false;
  }

  function generateAttempt(timeBudgetMs) {
    const sides = activeSides();
    grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
    paths = sides.map(() => []);
    pathSides = sides;
    endsOnWhite = 0;
    endsOnBlack = 0;
    deadline = performance.now() + timeBudgetMs;

    const startCells = sides.map((s) => [ENTRANCES[s].r, ENTRANCES[s].c]);
    for (let i = 0; i < startCells.length; i++) {
      const [r, c] = startCells[i];
      grid[r][c] = i;
      paths[i].push([r, c]);
    }

    return extend(0, startCells) ? sides : null;
  }

  // generate() tries several time budgets so easy cases return instantly while
  // hard ones still get enough search time. Each attempt re-randomizes since
  // the heuristic uses Math.random() for tie-breaks.
  function generate() {
    if (activeSides().length === 0) {
      randomizeEntrances();
      syncEntranceButtons();
    }
    const budgets = [50, 200, 800, 3000];
    for (const ms of budgets) {
      const sides = generateAttempt(ms);
      if (sides) {
        render();
        return sides;
      }
    }
    return null;
  }

  // --- Rendering -----------------------------------------------------------

  function cellCenter(r, c) {
    return {
      x: MARGIN + c * CELL + CELL / 2,
      y: MARGIN + r * CELL + CELL / 2,
    };
  }

  function el(name, attrs = {}) {
    const e = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  function render() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // Cell backgrounds — center gets the tinted variant.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        svg.appendChild(el("rect", {
          x: MARGIN + c * CELL,
          y: MARGIN + r * CELL,
          width: CELL,
          height: CELL,
          class: isCenter(r, c) ? "cell-center" : "cell-bg",
        }));
      }
    }

    // Center chamber outline.
    svg.appendChild(el("rect", {
      x: MARGIN + CENTER_MIN * CELL + 2,
      y: MARGIN + CENTER_MIN * CELL + 2,
      width: 3 * CELL - 4,
      height: 3 * CELL - 4,
      class: "center-outline",
    }));

    // Paths — one polyline per snake plus endpoint dots.
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      const color = ENTRANCES[pathSides[i]].color;
      if (path.length < 1) continue;

      if (path.length >= 2) {
        const pts = path.map(([r, c]) => {
          const p = cellCenter(r, c);
          return `${p.x},${p.y}`;
        }).join(" ");
        svg.appendChild(el("polyline", {
          points: pts,
          stroke: color,
          "stroke-width": STROKE_W,
          class: "path-line",
        }));
      }

      const startP = cellCenter(path[0][0], path[0][1]);
      svg.appendChild(el("circle", { cx: startP.x, cy: startP.y, r: DOT_R, fill: color }));
      const endP = cellCenter(path[path.length - 1][0], path[path.length - 1][1]);
      svg.appendChild(el("circle", { cx: endP.x, cy: endP.y, r: DOT_R, fill: color }));
    }

    // Entrance arrows in the margin, color-matched to the snake.
    for (let i = 0; i < pathSides.length; i++) {
      const side = pathSides[i];
      svg.appendChild(makeEntranceArrow(side, ENTRANCES[side].color));
    }
  }

  function makeEntranceArrow(side, color) {
    const e = ENTRANCES[side];
    const cx = MARGIN + e.c * CELL + CELL / 2;
    const cy = MARGIN + e.r * CELL + CELL / 2;
    const a = 8;
    let points;
    if (side === "top") {
      const tipY = MARGIN - 3;
      points = `${cx},${tipY} ${cx - a},${tipY - a} ${cx + a},${tipY - a}`;
    } else if (side === "bottom") {
      const tipY = SVG_H - MARGIN + 3;
      points = `${cx},${tipY} ${cx - a},${tipY + a} ${cx + a},${tipY + a}`;
    } else if (side === "left") {
      const tipX = MARGIN - 3;
      points = `${tipX},${cy} ${tipX - a},${cy - a} ${tipX - a},${cy + a}`;
    } else {
      const tipX = SVG_W - MARGIN + 3;
      points = `${tipX},${cy} ${tipX + a},${cy - a} ${tipX + a},${cy + a}`;
    }
    return el("polygon", { points, fill: color, class: "entrance-arrow" });
  }

  // --- UI ------------------------------------------------------------------

  document.getElementById("btn-generate").addEventListener("click", () => {
    runGenerate("Generated.");
  });

  document.getElementById("btn-rand-entrances").addEventListener("click", () => {
    randomizeEntrances();
    syncEntranceButtons();
    runGenerate("Randomized entrances. Generated.");
  });

  document.querySelectorAll(".entrance-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.side;
      entrancesActive[side] = !entrancesActive[side];
      btn.classList.toggle("is-active", entrancesActive[side]);
      if (activeSides().length === 0) {
        setStatus("Select at least one entrance and hit Generate.");
        return;
      }
      runGenerate(`Entrance "${side}" ${entrancesActive[side] ? "added" : "removed"}.`);
    });
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    jsonArea.value = JSON.stringify(serialize(), null, 2);
    setStatus("Exported.");
  });

  function runGenerate(prefix) {
    const t0 = performance.now();
    const sides = generate();
    const ms = Math.round(performance.now() - t0);
    if (sides) {
      const lengths = paths.map((p) => p.length).join(" + ");
      setStatus(
        `${prefix} ${sides.length} snake${sides.length === 1 ? "" : "s"} (${sides.join(", ")}) ` +
        `fill all ${SIZE * SIZE} cells (${lengths}). ${ms} ms.`,
        "ok"
      );
    } else {
      setStatus("Could not fill the grid with the chosen entrances.", "err");
    }
  }

  function serialize() {
    return {
      size: SIZE,
      center: { rMin: CENTER_MIN, rMax: CENTER_MAX, cMin: CENTER_MIN, cMax: CENTER_MAX },
      entrances: activeSides(),
      paths: paths.map((p, i) => ({
        side: pathSides[i],
        color: ENTRANCES[pathSides[i]].color,
        length: p.length,
        cells: p,
      })),
    };
  }

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "";
    if (kind === "ok") statusEl.classList.add("is-ok");
    else if (kind === "err") statusEl.classList.add("is-err");
  }

  // --- Init ----------------------------------------------------------------

  syncEntranceButtons();
  runGenerate("Generated.");
})();
