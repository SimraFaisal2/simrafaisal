// ============================================================
// GAME MODE — page-overlay arcade (Gazi-style, own take)
// ------------------------------------------------------------
// The floating "game mode" button drops a tiny rocket onto the
// page itself — a transparent full-screen canvas over the live
// site. Drive with arrow keys / WASD (or drag on touch), collect
// glowing "neuron" cells that respawn forever, and chase your
// best score. Esc or the toggle exits. Every 12 cells = level up
// and the rocket shifts from violet toward cyan.
// ============================================================
(function () {
  const toggle = document.getElementById("gameModeToggle");
  if (!toggle) return;

  const KEY = "gm-best";
  const ACCENT = "167, 139, 250";
  const CYAN = "34, 211, 238";

  let best = Number(localStorage.getItem(KEY) || 0);
  let active = false;
  let canvas = null;
  let ctx = null;
  let rafId = 0;
  let last = 0;

  let score = 0;
  let level = 1;
  let collected = 0;
  let player = null;
  let cells = [];
  let parts = [];
  let keys = {};
  let pointer = null;
  let hud = null;

  // ---- helpers ----
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function buildOverlay() {
    canvas = document.createElement("canvas");
    canvas.id = "gameModeCanvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * DPR;
    canvas.height = window.innerHeight * DPR;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function buildHUD() {
    hud = document.createElement("div");
    hud.className = "game-mode-hud";
    hud.innerHTML =
      '<span>score <b id="gmScore">0</b></span>' +
      '<span>best <b id="gmBest">' + best + "</b></span>" +
      '<span>level <b id="gmLevel">1</b></span>' +
      '<span class="gm-hint">esc to exit</span>';
    document.body.appendChild(hud);
  }

  function updateHUD() {
    if (!hud) return;
    const s = hud.querySelector("#gmScore");
    const b = hud.querySelector("#gmBest");
    const l = hud.querySelector("#gmLevel");
    if (s) s.textContent = score;
    if (b) b.textContent = best;
    if (l) l.textContent = level;
  }

  function spawnCell(avoidPlayer) {
    let x, y, tries = 0;
    do {
      x = rand(30, window.innerWidth - 30);
      y = rand(80, window.innerHeight - 60);
      tries++;
    } while (
      avoidPlayer && player &&
      (x - player.x) ** 2 + (y - player.y) ** 2 < 80 * 80 &&
      tries < 20
    );
    cells.push({ x, y, r: 7, phase: rand(0, Math.PI * 2), spin: rand(0, Math.PI * 2) });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, 190);
      parts.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(2, 5),
        life: 1,
        color
      });
    }
  }

  function start() {
    if (active) return;
    active = true;
    toggle.setAttribute("aria-pressed", "true");
    toggle.classList.add("on");
    toggle.innerHTML = '<span class="game-toggle-dot"></span>exit game mode';

    if (!canvas) buildOverlay();
    if (!hud) buildHUD();
    hud.style.display = "flex";

    score = 0;
    level = 1;
    collected = 0;
    parts = [];
    keys = {};
    pointer = null;
    player = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, r: 11, trail: [] };
    cells = [];
    for (let i = 0; i < 10; i++) spawnCell(true);
    updateHUD();
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(rafId);
    if (canvas) canvas.remove();
    if (hud) hud.style.display = "none";
    canvas = null;
    ctx = null;
    hud = null;
    cells = [];
    parts = [];
    player = null;
    toggle.classList.remove("on");
    toggle.setAttribute("aria-pressed", "false");
    toggle.innerHTML = '<span class="game-toggle-dot"></span>game mode';
  }

  function saveBest() {
    if (score > best) {
      best = score;
      try { localStorage.setItem(KEY, String(best)); } catch (e) { /* private mode */ }
    }
  }

  // ---- input ----
  const MOVE = {
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1]
  };

  window.addEventListener("keydown", (e) => {
    // Don't hijack typing in the chat box or other fields.
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.code === "Escape" && active) {
      e.preventDefault();
      stop();
      return;
    }
    if (e.code === "KeyG" && !active) {
      start();
      return;
    }
    if (active && MOVE[e.code]) {
      keys[e.code] = true;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  window.addEventListener("pointerdown", (e) => {
    if (!active) return;
    const r = { x: e.clientX, y: e.clientY };
    pointer = r;
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    if (active && e.buttons === 1) pointer = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", () => { pointer = null; });

  toggle.addEventListener("click", () => {
    if (active) stop(); else start();
  });

  // ---- update ----
  function update(dt) {
    const p = player;
    const W = window.innerWidth;
    const H = window.innerHeight;

    let ax = 0, ay = 0;
    for (const k in keys) {
      const d = MOVE[k];
      if (keys[k] && d) { ax += d[0]; ay += d[1]; }
    }
    if (ax || ay) {
      const m = Math.hypot(ax, ay) || 1;
      ax /= m; ay /= m;
      p.vx += ax * 1600 * dt;
      p.vy += ay * 1600 * dt;
    } else if (pointer) {
      p.vx += clamp((pointer.x - p.x) * 16, -700, 700) * dt;
      p.vy += clamp((pointer.y - p.y) * 16, -700, 700) * dt;
    }
    p.vx *= Math.pow(0.0004, dt);
    p.vy *= Math.pow(0.0004, dt);
    const sp = Math.hypot(p.vx, p.vy);
    const max = 340 + level * 12;
    if (sp > max) { p.vx = p.vx / sp * max; p.vy = p.vy / sp * max; }
    p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);

    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 14) p.trail.shift();

    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if ((p.x - c.x) ** 2 + (p.y - c.y) ** 2 < (p.r + c.r + 4) ** 2) {
        cells.splice(i, 1);
        score += 10;
        collected++;
        burst(c.x, c.y, CYAN, 12);
        spawnCell(true);
        if (collected % 12 === 0) {
          level++;
          burst(p.x, p.y, ACCENT, 22);
        }
        saveBest();
        updateHUD();
      }
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const pt = parts[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.02, dt);
      pt.vy *= Math.pow(0.02, dt);
      pt.life -= dt * 1.6;
      if (pt.life <= 0) parts.splice(i, 1);
    }
  }

  // ---- draw ----
  function draw(t) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);

    // Soft vignette so the rocket reads against bright page content.
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, "rgba(2, 12, 27, 0)");
    vg.addColorStop(1, "rgba(2, 12, 27, 0.28)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Burst particles.
    for (const pt of parts) {
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = `rgba(${pt.color}, ${0.9 * Math.max(0, pt.life)})`;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Neuron cells: glowing core + two orbiting synapse dots.
    const tsec = t / 1000;
    for (const c of cells) {
      const pulse = 0.6 + 0.4 * Math.sin(tsec * 4 + c.phase);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r * 3.2);
      g.addColorStop(0, `rgba(${CYAN}, ${0.9 * pulse})`);
      g.addColorStop(0.5, `rgba(${CYAN}, 0.22)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      // synapse dots orbit the core
      for (let k = 0; k < 2; k++) {
        const a = tsec * 2.4 + c.spin + k * Math.PI;
        ctx.fillStyle = `rgba(${ACCENT}, ${0.55 * pulse})`;
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * c.r * 2.1, c.y + Math.sin(a) * c.r * 2.1, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player trail.
    for (let i = 0; i < player.trail.length; i++) {
      const tr = player.trail[i];
      const a = (i / player.trail.length) * 0.3;
      ctx.fillStyle = `rgba(${level > 1 ? CYAN : ACCENT}, ${a})`;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rocket ship.
    const p = player;
    const col = level > 1 ? CYAN : ACCENT;
    const ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.shadowColor = `rgba(${col}, 0.9)`;
    ctx.shadowBlur = 16;
    // body
    ctx.fillStyle = `rgb(${col})`;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-9, -8);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // window
    ctx.fillStyle = "#06101f";
    ctx.beginPath();
    ctx.arc(4, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    // flame
    const fl = 6 + Math.sin(tsec * 22) * 2.5;
    ctx.fillStyle = "rgba(34, 211, 238, 0.85)";
    ctx.beginPath();
    ctx.moveTo(-5, -3);
    ctx.lineTo(-5 - fl, 0);
    ctx.lineTo(-5, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Landing hint on first frames of a session.
    if (tsec < 4 && score === 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(232, 241, 255, 0.75)";
      ctx.font = "12px 'JetBrains Mono', monospace";
      ctx.fillText("arrow keys / wasd — or drag — to fly", W / 2, H / 2 - 40);
    }
  }

  function loop(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    update(dt);
    draw(now);
    rafId = requestAnimationFrame(loop);
  }
})();
