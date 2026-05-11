(() => {
  const SIZE = 9;
  const CENTER_MIN = 3;
  const CENTER_MAX = 5;
  const MID = 4;

  const CELL = 48;
  const MARGIN = 12;
  const SVG_W = SIZE * CELL + MARGIN * 2;
  const SVG_H = SIZE * CELL + MARGIN * 2;
  const SVG_NS = "http://www.w3.org/2000/svg";

  // Where on the perimeter each entrance sits (which wall to remove).
  const ENTRANCES = {
    top:    { r: 0,        c: MID, wall: { kind: "h", r: 0,    c: MID } },
    bottom: { r: SIZE - 1, c: MID, wall: { kind: "h", r: SIZE, c: MID } },
    left:   { r: MID,      c: 0,        wall: { kind: "v", r: MID, c: 0 } },
    right:  { r: MID,      c: SIZE - 1, wall: { kind: "v", r: MID, c: SIZE } },
  };

  const entrancesActive = { top: true, right: false, bottom: false, left: false };

  // hWalls[r][c]: wall on the top of cell (r, c). r ∈ [0, SIZE], c ∈ [0, SIZE).
  // vWalls[r][c]: wall on the left of cell (r, c). r ∈ [0, SIZE), c ∈ [0, SIZE].
  // true = wall present, false = open passage.
  let hWalls;
  let vWalls;

  let showingSolution = false;

  const svg = document.getElementById("maze-svg");
  const statusEl = document.getElementById("status-line");
  const jsonArea = document.getElementById("json-area");
  svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);

  // --- Wall state ----------------------------------------------------------

  function initWalls() {
    hWalls = Array.from({ length: SIZE + 1 }, () => Array(SIZE).fill(true));
    vWalls = Array.from({ length: SIZE }, () => Array(SIZE + 1).fill(true));
  }

  function isCenter(r, c) {
    return r >= CENTER_MIN && r <= CENTER_MAX && c >= CENTER_MIN && c <= CENTER_MAX;
  }

  function openCenterChamber() {
    for (let r = CENTER_MIN; r <= CENTER_MAX; r++) {
      for (let c = CENTER_MIN; c <= CENTER_MAX; c++) {
        if (c < CENTER_MAX) vWalls[r][c + 1] = false;
        if (r < CENTER_MAX) hWalls[r + 1][c] = false;
      }
    }
  }

  function applyEntrances() {
    for (const side of Object.keys(ENTRANCES)) {
      const w = ENTRANCES[side].wall;
      const isOpen = entrancesActive[side];
      if (w.kind === "h") hWalls[w.r][w.c] = !isOpen;
      else vWalls[w.r][w.c] = !isOpen;
    }
  }

  function wallBetween(r1, c1, r2, c2) {
    if (r1 === r2) {
      return { kind: "v", r: r1, c: Math.max(c1, c2) };
    }
    return { kind: "h", r: Math.max(r1, r2), c: c1 };
  }

  function isPassageOpen(r1, c1, r2, c2) {
    const w = wallBetween(r1, c1, r2, c2);
    return w.kind === "h" ? !hWalls[w.r][w.c] : !vWalls[w.r][w.c];
  }

  function openPassage(r1, c1, r2, c2) {
    const w = wallBetween(r1, c1, r2, c2);
    if (w.kind === "h") hWalls[w.r][w.c] = false;
    else vWalls[w.r][w.c] = false;
  }

  // --- Generation (Kruskal's, center as super-node) ------------------------

  function makeUF() {
    const parent = new Map();
    const rank = new Map();
    function add(x) {
      if (!parent.has(x)) { parent.set(x, x); rank.set(x, 0); }
    }
    function find(x) {
      let p = parent.get(x);
      if (p === x) return x;
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    function union(a, b) {
      const ra = find(a), rb = find(b);
      if (ra === rb) return false;
      const raRank = rank.get(ra), rbRank = rank.get(rb);
      if (raRank < rbRank) parent.set(ra, rb);
      else if (raRank > rbRank) parent.set(rb, ra);
      else { parent.set(rb, ra); rank.set(ra, raRank + 1); }
      return true;
    }
    return { add, find, union };
  }

  function cellId(r, c) {
    return isCenter(r, c) ? "C" : `${r},${c}`;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function activeSides() {
    return Object.keys(entrancesActive).filter((s) => entrancesActive[s]);
  }

  function randomizeEntrances() {
    const sides = shuffle(Object.keys(ENTRANCES));
    const count = 1 + Math.floor(Math.random() * 4);
    for (const s of Object.keys(entrancesActive)) entrancesActive[s] = false;
    for (let i = 0; i < count; i++) entrancesActive[sides[i]] = true;
  }

  function syncEntranceButtons() {
    document.querySelectorAll(".entrance-btn").forEach((btn) => {
      btn.classList.toggle("is-active", entrancesActive[btn.dataset.side]);
    });
  }

  function generateMaze(loopFactor) {
    if (activeSides().length === 0) {
      randomizeEntrances();
      syncEntranceButtons();
    }

    // Defensive retry — Kruskal's on a connected grid always produces a
    // spanning tree, so this shouldn't ever loop, but we verify anyway.
    let attempt = 0;
    while (true) {
      attempt++;
      carveOneMaze(loopFactor);
      const unreachable = unreachableEntrances();
      if (unreachable.length === 0) break;
      if (attempt >= 10) {
        setStatus(
          `Failed to connect every entrance to the center after ${attempt} attempts ` +
          `(${unreachable.join(", ")} unreachable). This shouldn't happen — please report.`,
          "err"
        );
        break;
      }
    }

    showingSolution = true;
    render();
    return activeSides();
  }

  function carveOneMaze(loopFactor) {
    initWalls();
    openCenterChamber();

    const uf = makeUF();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) uf.add(cellId(r, c));
    }

    const edges = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (c + 1 < SIZE) edges.push([r, c, r, c + 1]);
        if (r + 1 < SIZE) edges.push([r, c, r + 1, c]);
      }
    }
    shuffle(edges);

    const skipped = [];
    for (const [r1, c1, r2, c2] of edges) {
      const a = cellId(r1, c1), b = cellId(r2, c2);
      if (a === b) continue;
      if (uf.find(a) !== uf.find(b)) {
        openPassage(r1, c1, r2, c2);
        uf.union(a, b);
      } else {
        skipped.push([r1, c1, r2, c2]);
      }
    }

    if (loopFactor > 0 && skipped.length > 0) {
      shuffle(skipped);
      const n = Math.min(skipped.length, Math.floor(skipped.length * loopFactor));
      for (let i = 0; i < n; i++) {
        const [r1, c1, r2, c2] = skipped[i];
        openPassage(r1, c1, r2, c2);
      }
    }

    applyEntrances();
  }

  function unreachableEntrances() {
    const bad = [];
    for (const side of activeSides()) {
      if (!bfsFromEntrance(side)) bad.push(side);
    }
    return bad;
  }

  // --- Solution overlay ----------------------------------------------------

  function bfsFromEntrance(side) {
    const start = ENTRANCES[side];
    const visited = new Array(SIZE * SIZE).fill(false);
    const parent = new Array(SIZE * SIZE).fill(-1);
    const queue = [];
    const startIdx = start.r * SIZE + start.c;
    visited[startIdx] = true;
    queue.push(startIdx);
    let goal = -1;
    while (queue.length) {
      const idx = queue.shift();
      const r = Math.floor(idx / SIZE);
      const c = idx % SIZE;
      if (isCenter(r, c)) { goal = idx; break; }
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        if (!isPassageOpen(r, c, nr, nc)) continue;
        const nIdx = nr * SIZE + nc;
        if (visited[nIdx]) continue;
        visited[nIdx] = true;
        parent[nIdx] = idx;
        queue.push(nIdx);
      }
    }
    if (goal === -1) return null;
    const path = [];
    let cur = goal;
    while (cur !== -1) {
      const r = Math.floor(cur / SIZE);
      const c = cur % SIZE;
      path.push([r, c]);
      cur = parent[cur];
    }
    return path.reverse();
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

    // Cell backgrounds: center chamber gets a single highlighted rect; others get plain.
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (isCenter(r, c)) continue;
        svg.appendChild(el("rect", {
          x: MARGIN + c * CELL,
          y: MARGIN + r * CELL,
          width: CELL,
          height: CELL,
          class: "cell-bg",
        }));
      }
    }
    svg.appendChild(el("rect", {
      x: MARGIN + CENTER_MIN * CELL,
      y: MARGIN + CENTER_MIN * CELL,
      width: 3 * CELL,
      height: 3 * CELL,
      class: "cell-center",
    }));

    // Walls
    for (let r = 0; r <= SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!hWalls[r][c]) continue;
        svg.appendChild(el("line", {
          x1: MARGIN + c * CELL,
          y1: MARGIN + r * CELL,
          x2: MARGIN + (c + 1) * CELL,
          y2: MARGIN + r * CELL,
          class: "wall",
        }));
      }
    }
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c <= SIZE; c++) {
        if (!vWalls[r][c]) continue;
        svg.appendChild(el("line", {
          x1: MARGIN + c * CELL,
          y1: MARGIN + r * CELL,
          x2: MARGIN + c * CELL,
          y2: MARGIN + (r + 1) * CELL,
          class: "wall",
        }));
      }
    }

    // Entrance markers (arrows in the margin pointing inward).
    for (const side of Object.keys(ENTRANCES)) {
      if (!entrancesActive[side]) continue;
      svg.appendChild(makeEntranceMarker(side));
    }

    if (showingSolution) drawSolution();
  }

  function makeEntranceMarker(side) {
    const e = ENTRANCES[side];
    const cx = MARGIN + e.c * CELL + CELL / 2;
    const cy = MARGIN + e.r * CELL + CELL / 2;
    const arrowSize = 8;
    let points;
    if (side === "top") {
      const tipY = MARGIN - 2;
      points = `${cx},${tipY} ${cx - arrowSize},${tipY - arrowSize} ${cx + arrowSize},${tipY - arrowSize}`;
    } else if (side === "bottom") {
      const tipY = SVG_H - MARGIN + 2;
      points = `${cx},${tipY} ${cx - arrowSize},${tipY + arrowSize} ${cx + arrowSize},${tipY + arrowSize}`;
    } else if (side === "left") {
      const tipX = MARGIN - 2;
      points = `${tipX},${cy} ${tipX - arrowSize},${cy - arrowSize} ${tipX - arrowSize},${cy + arrowSize}`;
    } else {
      const tipX = SVG_W - MARGIN + 2;
      points = `${tipX},${cy} ${tipX + arrowSize},${cy - arrowSize} ${tipX + arrowSize},${cy + arrowSize}`;
    }
    return el("polygon", { points, class: "entrance-marker" });
  }

  function drawSolution() {
    for (const side of activeSides()) {
      const path = bfsFromEntrance(side);
      if (!path) continue;
      const pts = path.map(([r, c]) => {
        const { x, y } = cellCenter(r, c);
        return `${x},${y}`;
      }).join(" ");
      svg.appendChild(el("polyline", { points: pts, class: "solution-line" }));
      const last = path[path.length - 1];
      const { x, y } = cellCenter(last[0], last[1]);
      svg.appendChild(el("circle", { cx: x, cy: y, r: 5, class: "solution-dot" }));
    }
  }

  // --- UI wiring -----------------------------------------------------------

  document.getElementById("btn-generate").addEventListener("click", () => {
    const loopFactor = parseFloat(document.getElementById("gen-style").value);
    const sides = generateMaze(loopFactor);
    reportGeneration(sides);
  });

  function reportGeneration(sides) {
    const bad = unreachableEntrances();
    if (bad.length === 0) {
      setStatus(
        `Generated maze. All ${sides.length} entrance${sides.length === 1 ? "" : "s"} ` +
        `(${sides.join(", ")}) reach the center. Solution shown.`,
        "ok"
      );
    } else {
      setStatus(
        `Generated maze, but ${bad.join(", ")} cannot reach the center.`,
        "err"
      );
    }
  }

  document.getElementById("btn-rand-entrances").addEventListener("click", () => {
    randomizeEntrances();
    syncEntranceButtons();
    applyEntrances();
    render();
    setStatus(`Randomized entrances: ${activeSides().join(", ") || "none"}.`);
  });

  document.querySelectorAll(".entrance-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const side = btn.dataset.side;
      entrancesActive[side] = !entrancesActive[side];
      btn.classList.toggle("is-active", entrancesActive[side]);
      applyEntrances();
      render();
      const bad = unreachableEntrances();
      if (bad.length === 0 && activeSides().length > 0) {
        setStatus(
          `Entrance "${side}" ${entrancesActive[side] ? "enabled" : "disabled"}. ` +
          `All ${activeSides().length} entrances reach the center.`,
          "ok"
        );
      } else if (activeSides().length === 0) {
        setStatus(`Entrance "${side}" disabled. No entrances active.`);
      } else {
        setStatus(
          `Entrance "${side}" toggled, but ${bad.join(", ")} cannot reach the center.`,
          "err"
        );
      }
    });
  });

  document.getElementById("btn-solution").addEventListener("click", () => {
    showingSolution = !showingSolution;
    render();
    setStatus(showingSolution ? "Showing shortest paths to center." : "Solution hidden.");
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    jsonArea.value = JSON.stringify(serialize(), null, 2);
    setStatus("Exported maze to JSON.");
  });

  // --- Serialization -------------------------------------------------------

  function serialize() {
    return {
      size: SIZE,
      center: { rMin: CENTER_MIN, rMax: CENTER_MAX, cMin: CENTER_MIN, cMax: CENTER_MAX },
      entrances: { ...entrancesActive },
      hWalls: hWalls.map((row) => row.map((w) => (w ? 1 : 0))),
      vWalls: vWalls.map((row) => row.map((w) => (w ? 1 : 0))),
    };
  }

  // --- Misc ----------------------------------------------------------------

  function setStatus(msg, kind = "") {
    statusEl.textContent = msg;
    statusEl.className = "";
    if (kind === "ok") statusEl.classList.add("is-ok");
    else if (kind === "err") statusEl.classList.add("is-err");
  }

  // --- Init ----------------------------------------------------------------

  randomizeEntrances();
  syncEntranceButtons();
  const initialSides = generateMaze(0.08);
  reportGeneration(initialSides);
})();
