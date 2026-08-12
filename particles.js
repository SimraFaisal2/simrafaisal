/* ============================================================================
 * 3D Particle Portrait — simrafaisal.me
 * ----------------------------------------------------------------------------
 * Converts a portrait photo into a holographic point-cloud rendered with
 * Three.js (WebGL). The photo is sampled on a hidden <canvas>, every pixel's
 * brightness decides where a particle goes and how far it sits in 3D space,
 * and the whole cloud flows in gentle scan rows that react to the cursor.
 *
 * HOW TO USE A DIFFERENT PHOTO:
 *   Drop any portrait photo over `photo.png` (same folder as this file) and
 *   reload. No code changes needed — the sampling resolution is driven by the
 *   photo itself. If your photo is very large, the extractor downscales it
 *   automatically.
 *
 * TUNING:
 *   Edit the PORTRAIT_CONFIG object below — density, particle size, animation
 *   speed, depth, mouse behavior, and colors are all parameters.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * CONFIG — edit these to restyle the effect.
 * ---------------------------------------------------------------------------
 * image          : source photo (swap this file to change the portrait)
 * density        : sampling step in source-pixels. LOWER = more particles.
 *                  e.g. 2 → every 2nd pixel sampled (denser), 4 → every 4th.
 * particleSize   : dot diameter — 1 ≈ 5 CSS pixels (0.95 ≈ a crisp dot).
 * opacity        : overall alpha of the cloud (0..1).
 * autoCrop       : crop to the head & shoulders before sampling. On by
 *                  default — profile pictures usually have the face small in
 *                  the frame, and cropping is what makes it recognisable.
 * depthScale     : how strongly brightness maps to 3D depth (0 = flat).
 * speed          : multiplier for every animation (1 = normal).
 * waveAmp        : amplitude of the flowing row-wave (world units).
 * bgTolerance    : color-distance from the average background color below
 *                  which a pixel is treated as background and skipped.
 * edgeFade       : how strongly particles near the silhouette dissolve (0..1).
 * rotateAmount   : radians of rotation toward the cursor (higher = more tilt).
 * repelRadius    : world-unit radius of the mouse "push-away" zone.
 * repelStrength  : how far particles are pushed inside that zone.
 * colorNear      : particle color for bright (near) pixels.
 * colorFar       : particle color for dark (distant) pixels.
 * ------------------------------------------------------------------------- */
const PORTRAIT_CONFIG = {
  image: "photo.png",
  density: 2.0,
  particleSize: 0.95,
  opacity: 1.0,
  depthScale: 1.3,
  autoCrop: true,
  speed: 1,
  waveAmp: 0.05,
  bgTolerance: 22,
  edgeFade: 0.85,
  rotateAmount: 0.4,
  repelRadius: 0.5,
  repelStrength: 0.2,
  colorNear: new THREE.Color("#dffaff"),
  colorFar: new THREE.Color("#0d3b66")
};

/* ---------------------------------------------------------------------------
 * ROUND SOFT PARTICLE SPRITE
 * A tiny radial-gradient canvas texture. Every particle samples its center,
 * so dots render as soft glowing discs instead of hard squares.
 * ------------------------------------------------------------------------- */
function makeParticleTexture() {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

/* ===========================================================================
 * ParticlePortrait
 * ===========================================================================
 * One instance = one mounted particle scene. Clean up with .destroy().
 */
class ParticlePortrait {
  constructor(container, config = {}) {
    this.container = container;
    this.cfg = Object.assign({}, PORTRAIT_CONFIG, config);
    this.rafId = null;
    this.clock = new THREE.Clock();
    this.mouse = { x: 0, y: 0, inside: false };      // NDC, -1..1
    this.mouseWorldLocal = new THREE.Vector3(0, 0, 0); // cursor on portrait plane
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._boundAnim = this._anim.bind(this);
  }

  /** Public entry point: loads the photo, then builds the scene. */
  init() {
    if (typeof THREE === "undefined") return this._fallback("WebGL library unavailable");
    this._buildScene();
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        this._extractAndBuild(img);
      } catch (e) {
        console.error("Particle portrait init failed:", e);
        this._fallback("failed to initialise scan");
        return;
      }
      this._attach();
      this._fit();
      this.rafId = requestAnimationFrame(this._boundAnim);
    };
    img.onerror = () => this._fallback("could not load photo.png");
    img.src = this.cfg.image;
  }

  /* ------------------------------------------------------------------------
   * STEP 1 — SCENE SETUP (camera, renderer, shader material)
   * ---------------------------------------------------------------------- */
  _buildScene() {
    const { container } = this;

    // Camera looks down -z at the origin where the portrait is built.
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 0, 14);

    // Transparent canvas so the page's navy background shows through.
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      throw new Error("WebGL unavailable");
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = "portrait-canvas";
    container.appendChild(this.renderer.domElement);

    // Everything (particles + rotation) lives in this group so we can rotate
    // the whole cloud toward the cursor and scale it to fit any screen.
    this.group = new THREE.Group();
    this.scene = new THREE.Scene();
    this.scene.add(this.group);

    // Uniforms shared with the GPU — see the shaders below.
    this.uTime = { value: 0 };
    this.uWaveAmp = { value: this.cfg.waveAmp };
    this.uWaveSpeed = { value: 2.2 * this.cfg.speed };
    this.uMouse = { value: new THREE.Vector3() };
    this.uRepelR = { value: this.cfg.repelRadius };
    this.uRepelStrength = { value: this.cfg.repelStrength };
    this.uPointScale = { value: 300 };
    this.uTexture = { value: makeParticleTexture() };

    // ShaderMaterial is used (instead of PointsMaterial) because we need
    // PER-PARTICLE size and alpha — that's what makes the silhouette dissolve
    // and the cloud read as a hologram rather than a flat sticker.
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uTime,
        uWaveAmp: this.uWaveAmp,
        uWaveSpeed: this.uWaveSpeed,
        uMouse: this.uMouse,
        uRepelR: this.uRepelR,
        uRepelStrength: this.uRepelStrength,
        uPointScale: this.uPointScale,
        uTexture: this.uTexture
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3  aColor;
        attribute float aAlpha;
        attribute float aSize;

        uniform float uTime;
        uniform float uWaveAmp;
        uniform float uWaveSpeed;
        uniform vec3  uMouse;
        uniform float uRepelR;
        uniform float uRepelStrength;
        uniform float uPointScale;

        varying vec3  vColor;
        varying float vAlpha;

        void main() {
          vec3 p = position;

          /* ANIMATION — flowing scan rows:
             every particle drifts up/down on a sine wave whose phase depends
             on its row (p.y), so consecutive rows ripple like a scanning beam. */
          p.y += sin(uTime * uWaveSpeed + p.y * 1.35) * uWaveAmp;

          /* subtle "breathing" along the depth axis so the cloud feels alive */
          p.z += sin(uTime * 0.55 + p.x * 0.8 + p.y * 0.9) * 0.045;

          /* MOUSE — particles near the cursor gently move away */
          vec2  d     = p.xy - uMouse.xy;
          float dist  = length(d);
          float infl  = 1.0 - smoothstep(0.0, uRepelR, dist);
          p.xy += normalize(d + vec2(1e-5)) * infl * uRepelStrength;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);

          /* Point size is attenuated by perspective (size attenuation) —
             distant particles naturally render smaller, reinforcing depth. */
          gl_PointSize = aSize * uPointScale / -mv.z;
          gl_Position  = projectionMatrix * mv;

          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;

        varying vec3  vColor;
        varying float vAlpha;

        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          float a  = tex.a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `
    });
  }

  /* ------------------------------------------------------------------------
   * STEP 2 — IMAGE → PARTICLE EXTRACTION
   * ------------------------------------------------------------------------
   * How the photo becomes a point cloud:
   *   1. Draw the photo into an offscreen <canvas> at a workable resolution.
   *   2. Average the border pixels to learn the background colour, then walk
   *      every N-th pixel of the grid (N = config.density).
   *   3. Skip pixels that match the background (those are empty space).
   *   4. For every kept pixel, create one particle whose properties are
   *      derived from the pixel:
   *        x,y  → the pixel's grid position, centered so the face sits at origin
   *        z    → DEPTH from brightness: bright pixels (highlights, nose,
   *               cheekbones, hair shine) float toward the camera; dark pixels
   *               (shadows, pupils) recede. This is what makes it look 3D.
   *        alpha→ edge dissolve: pixels close to the background colour fade,
   *               so the silhouette crumbles into individual particles.
   *        color→ lerp between two cyan tones by brightness.
   *   Result: tens of thousands of { x, y, z, size, alpha, color } records,
   *   which are then uploaded to the GPU as one BufferGeometry in STEP 3.
   * ---------------------------------------------------------------------- */
  _extractAndBuild(img) {
    const cfg = this.cfg;

    // Sampling canvas — work at a fairly high resolution so facial features
    // (eyes, nose, lips) keep enough sample points to stay recognisable.
    const workWidth = 640;
    const scale = workWidth / img.width;
    const c = document.createElement("canvas");
    c.width = workWidth;
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);

    // --- background colour = DOMINANT border colour ------------------------
    // Averaging the border is fragile: a strand of hair or a dark collar
    // touching the edge skews the mean. Instead we quantise every border
    // pixel and take the most frequent colour — for a portrait photo that is
    // almost always the backdrop, even on a gradient or with edge contact.
    const hist = new Map();
    const seed = (x, y) => {
      const i = (y * width + x) * 4;
      const key = (data[i] >> 4) + "," + (data[i + 1] >> 4) + "," + (data[i + 2] >> 4);
      hist.set(key, (hist.get(key) || 0) + 1);
    };
    for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
    for (let y = 0; y < height; y++) { seed(0, y); seed(width - 1, y); }
    let bestKey = null, bestCount = -1;
    for (const [key, count] of hist) {
      if (count > bestCount) { bestCount = count; bestKey = key; }
    }
    const bgParts = bestKey.split(",").map((v) => Number(v) * 16 + 8); // bin centre
    const bgr = bgParts[0], bgg = bgParts[1], bgb = bgParts[2];

    /* --- AUTO-CROP to the head & shoulders --------------------------------
       In a typical profile picture the face is only a small fraction of the
       frame, which makes it vanish once sampled. We find the most feature-
       dense horizontal band (highest per-row brightness variance — that is
       the face/hairline) and crop to the head plus a little shoulder room.
       The head then fills the particle field and features become readable. */
    if (cfg.autoCrop) {
      const rowVar = [];
      for (let y = 0; y < height; y++) {
        let s = 0, s2 = 0, n = 0;
        for (let x = 0; x < width; x += 2) {
          const i = (y * width + x) * 4;
          const v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          s += v; s2 += v * v; n++;
        }
        const m = s / n;
        rowVar.push(s2 / n - m * m);
      }
      const maxV = Math.max.apply(null, rowVar);
      if (maxV > 6) {
        // Head top = first feature-dense row (the hairline against the
        // backdrop). Head bottom = where feature density collapses below the
        // face (the chin/neck) — the clearest boundary on any headshot.
        const top = rowVar.findIndex((r) => r > maxV * 0.15);
        let bot = height - 1;
        for (let y = top + 1; y < rowVar.length; y++) {
          if (rowVar[y] < maxV * 0.12) { bot = y; break; }
        }
        const headH = bot - top;
        if (top >= 0 && headH > height * 0.15) {
          /* ---- FACE-CENTER-ANCHORED CROP --------------------------------
             Earlier attempts anchored on a fixed skin-tone window or on the
             brightest column near a guessed eye row. Both drift on a photo
             like this one: hair touches the frame edges, lighting is
             asymmetric, and the forehead highlights pull the "brightest
             column" left of the true nose bridge. The result was a crop
             whose centre sat ~10px left of the face, so the face rendered
             visibly off to the right.

             This version finds the FACE CENTRE in a small pipeline that is
             robust to all of that:

               1. HAIRLINE — scanning top-down, the first row where the
                  widest run of non-hair (bright) columns is wide. Everything
                  below this row is face, not hair.
               2. EYE ROW — below the hairline, the row whose pupil regions
                  (columns just left and right of the rough face centre) are
                  darkest. The eyes are the darkest features on the face;
                  restricting the search below the hairline keeps the dark
                  hair from winning.
               3. FACE CENTRE X — the widest run of bright columns AT the
                  eye row, centred. At the eye row the face span is widest
                  and, crucially, the forehead no longer biases the run;
                  its centre sits on the face's true vertical axis.

             A square frame of ~1.35 × head height is centred on that point.
             The face then fills the container edge-to-edge, dead-centre. */

          const s0 = top + Math.round(headH * 0.20);
          const s1 = top + Math.round(headH * 0.65);
          const scanLo = Math.round(width * 0.10);
          const scanHi = Math.round(width * 0.90);

          // Widest run of bright (non-hair) columns in one row whose centre
          // sits in the central 50% of the image. Requiring a central centre
          // is what keeps the side-background runs (which are bright too)
          // from being mistaken for the face when scanning the hair region.
          const widestRun = (y, thr) => {
            let best = null;
            let start = -1;
            for (let x = scanLo; x < scanHi; x++) {
              const i = (y * width + x) * 4;
              const v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
              if (v > thr) {
                if (start < 0) start = x;
              } else if (start >= 0) {
                if (best === null || x - 1 - start > best[1] - best[0]) best = [start, x - 1];
                start = -1;
              }
            }
            if (start >= 0) {
              if (best === null || scanHi - 1 - start > best[1] - best[0]) best = [start, scanHi - 1];
            }
            if (!best) return null;
            const c = (best[0] + best[1]) / 2;
            return (c > width * 0.25 && c < width * 0.75) ? best : null;
          };

          // 1) HAIRLINE: first row (top-down) whose central face run is wide.
          let hairline = s0;
          for (let y = s0; y < s1; y++) {
            const r = widestRun(y, 90);
            if (r && r[1] - r[0] > 40) { hairline = y; break; }
          }

          // 2) Rough centre from a row just below the hairline.
          const midRow = Math.min(s1 - 1, hairline + Math.round((s1 - hairline) * 0.30));
          let roughC = Math.round(width * 0.5);
          {
            const r = widestRun(midRow, 90);
            if (r) roughC = Math.round((r[0] + r[1]) / 2);
          }

          // 3) EYE ROW: darkest pupil regions below the hairline (eyes are
          // the darkest features on the face; the hairline guard keeps the
          // uniformly-dark hair from winning the search).
          let eyeRow = s1 - 1;
          {
            const pc = roughC;
            let best = Infinity;
            const searchLo = Math.min(s1 - 5, hairline + 10);
            for (let y = searchLo; y < s1; y++) {
              let acc = 0, n = 0;
              for (let dx = -60; dx <= -38; dx += 2) {
                const x = pc + dx;
                if (x >= 0 && x < width) { const i = (y * width + x) * 4; acc += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++; }
              }
              for (let dx = 38; dx <= 60; dx += 2) {
                const x = pc + dx;
                if (x >= 0 && x < width) { const i = (y * width + x) * 4; acc += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++; }
              }
              const v = acc / Math.max(1, n);
              if (v < best) { best = v; eyeRow = y; }
            }
          }

          // 4) FACE CENTRE X: centre of the widest central run at the eye
          // row. At the eye row the face span is widest and the forehead's
          // bright highlights no longer pull the centre sideways, so its
          // centre sits on the face's true vertical axis.
          let faceCX = Math.round(width * 0.5);
          {
            const r = widestRun(eyeRow, 90);
            if (r) {
              faceCX = Math.round((r[0] + r[1]) / 2);
            } else {
              // eye-row run was too thin — fall back to the median centre
              // over a window around the eye row.
              const cs = [];
              for (let y = Math.max(s0, eyeRow - 8); y < Math.min(s1, eyeRow + 9); y++) {
                const rr = widestRun(y, 90);
                if (rr && rr[1] - rr[0] > 10) cs.push((rr[0] + rr[1]) / 2);
              }
              if (cs.length) {
                cs.sort((a, b) => a - b);
                faceCX = Math.round(cs[Math.floor(cs.length / 2)]);
              }
            }
          }

          // FACE CENTRE Y: eye row + ~22% of the face height (eyes sit
          // slightly above the vertical middle of the face).
          const faceH = headH * 0.47;   // face ≈ 47% of the head+shoulders
          const faceCY = Math.round(eyeRow + faceH * 0.22);

          // Square frame centred on the face centre.
          const S = Math.round(headH * 1.35);
          let cx0 = Math.max(0, Math.min(width - S, faceCX - Math.floor(S / 2)));
          let cy0 = Math.max(0, Math.min(height - S, faceCY - Math.floor(S / 2)));
          const cw = S, ch = S;

          const c2 = document.createElement("canvas");
          c2.width = Math.max(1, cw);
          c2.height = Math.max(1, ch);
          const c2c = c2.getContext("2d", { willReadFrequently: true });
          c2c.drawImage(c, cx0, cy0, cw, ch, 0, 0, cw, ch);
          const d2 = c2c.getImageData(0, 0, cw, ch);
          data = d2.data;
          width = cw;
          height = ch;
        }
      }
    }

    /* --- sharpen the working pixels ----------------------------------------
       A tiny 4-neighbour unsharp mask on the cropped frame. The source
       avatar is soft/greyscale, and this crispens the eyes, brows, nose and
       mouth edges so the point cloud renders them clearly. */
    if (data instanceof Uint8ClampedArray) {
      const out = new Uint8ClampedArray(data);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const v = data[i + c];
            const avg =
              (data[i - 4 + c] + data[i + 4 + c] +
               data[i - width * 4 + c] + data[i + width * 4 + c]) / 4;
            out[i + c] = v + 0.6 * (v - avg);
          }
        }
      }
      data = out;
    }

    this._imgAspect = width / height; // used by _fit() for responsive sizing

    /* Shape the hero container to the cropped portrait so the cloud fills it
       edge-to-edge instead of floating small inside a square. */
    this.container.style.aspectRatio = String(
      THREE.MathUtils.clamp(this._imgAspect, 0.8, 1.35).toFixed(2)
    );

    // --- world mapping -----------------------------------------------------
    // The portrait spans 10 world units wide, centered on (0,0), so the
    // camera at z=14 frames it comfortably.
    const WORLD_W = 10;
    const WORLD_H = WORLD_W * (height / width);
    const mobile = window.innerWidth < 768;
    // Cap the sample count (~50k) so slow phones stay smooth.
    const step = Math.max(
      cfg.density * (mobile ? 1.4 : 1),
      Math.sqrt((width * height) / 50000)
    );
    const range = cfg.bgTolerance * 3;              // colour-distance for fade

    /* --- brightness + edge maps -------------------------------------------
       A per-pixel brightness array is precomputed once; the edge map (local
       neighbour contrast) is what makes the eyes, nose, lips and hairline
       stand out — feature boundaries get brighter, larger particles. */
    const bright = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        bright[y * width + x] =
          0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
    }

    const positions = [];
    const colors = [];
    const alphas = [];
    const sizes = [];
    const colNear = cfg.colorNear;
    const colFar = cfg.colorFar;

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        // Typed arrays need INTEGER indices — a fractional index reads
        // undefined and turns every downstream value into NaN.
        const ix = x | 0;
        const iy = y | 0;
        const i = (iy * width + ix) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];

        // Colour distance from the detected background → is this pixel part
        // of the subject, or empty backdrop?
        const diff = Math.abs(r - bgr) + Math.abs(g - bgg) + Math.abs(b - bgb);
        if (diff < cfg.bgTolerance) continue;

        const raw = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const brightness = raw / 255;
        // Contrast curve — pushes highlights & shadows apart so the face reads.
        const t = THREE.MathUtils.clamp((brightness - 0.5) * 1.35 + 0.5, 0, 1);

        // Edge strength: how different this pixel is from its neighbours.
        const bi = iy * width + ix;
        const nb = (idx) => (idx >= 0 && idx < bright.length ? bright[idx] : raw);
        const l = nb(bi - 1), rg = nb(bi + 1), u = nb(bi - width), dn = nb(bi + width);
        const edge = Math.abs(raw - (l + rg + u + dn) / 4) / 255;
        const edgeN = THREE.MathUtils.clamp(edge / 0.22, 0, 1);

        // Grid position → world position (centered, y flipped for screen up).
        positions.push(
          (x / width - 0.5) * WORLD_W,
          (0.5 - y / height) * WORLD_H,
          (t - 0.5) * 2 * cfg.depthScale             // ← the 3D depth
        );

        // Colour: lerp far→near by (contrast-boosted) brightness.
        colors.push(
          colFar.r + (colNear.r - colFar.r) * t,
          colFar.g + (colNear.g - colFar.g) * t,
          colFar.b + (colNear.b - colFar.b) * t
        );

        // Alpha: silhouette dissolve + feature-edge emphasis.
        const edgeFade = THREE.MathUtils.clamp(diff / range, 0.05, 1);
        alphas.push(THREE.MathUtils.clamp(
          cfg.opacity * (0.35 + 0.65 * edgeFade) * (0.8 + 0.2 * t) + edgeN * 0.2,
          0, 1
        ));

        // Size: features and highlights read slightly larger.
        sizes.push(cfg.particleSize * (0.75 + 0.35 * t + 0.55 * edgeN));
      }
    }

    if (positions.length === 0) throw new Error("no particles extracted");

    /* ----------------------------------------------------------------------
     * STEP 3 — UPLOAD TO GPU (one BufferGeometry, one draw call)
     * ----------------------------------------------------------------------
     * All particles live in a single THREE.Points with one BufferGeometry.
     * This is vastly faster than thousands of DOM elements: the GPU renders
     * the entire cloud in one pass, which is what lets us run 10k+ particles
     * at 60fps even on phones.
     * -------------------------------------------------------------------- */
    this.count = positions.length / 3;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("aColor", new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setAttribute("aAlpha", new THREE.Float32BufferAttribute(alphas, 1));
    this.geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // single centered object — skip per-frame culling
    this.group.add(this.points);

    // Store the source brightness per particle? Not needed after upload —
    // depth is already baked into the position attribute.

    // Hide the "initializing" overlay now that we have real particles.
    const loading = document.getElementById("portraitLoading");
    if (loading) loading.style.display = "none";
    const fallback = document.getElementById("asciiFallback");
    if (fallback) fallback.style.display = "none";
  }

  /* ------------------------------------------------------------------------
   * STEP 4 — MOUSE INTERACTION
   * ------------------------------------------------------------------------
   * - Rotation: the cursor's NDC position is smoothed and converted into a
   *   target rotation; the group lerps toward it every frame, so the portrait
   *   gently tilts to face the cursor. When the cursor leaves, it relaxes.
   * - Displacement: the cursor is unprojected onto the portrait's plane and
   *   stored in uMouse; the vertex shader pushes nearby particles away
   *   (see the smoothstep in the vertex shader).
   * ---------------------------------------------------------------------- */
  _onMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    this.mouse.inside = true;
  }

  _onMouseLeave() {
    this.mouse.inside = false;
  }

  _unprojectMouseLocal() {
    // Ray from the camera through the cursor, intersect the z=0 plane, then
    // convert into the group's (scaled/rotated) local space.
    const ndc = new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = -this.camera.position.z / dir.z;
    const world = this.camera.position.clone().add(dir.multiplyScalar(t));
    this.group.worldToLocal(world);
    this.mouseWorldLocal.copy(world);
  }

  /* ------------------------------------------------------------------------
   * STEP 5 — ANIMATION LOOP (requestAnimationFrame)
   * ------------------------------------------------------------------------
   * Every frame:
   *   1. advance the clock → uniform time drives the shader waves
   *   2. smooth the rotation toward the cursor (plus a tiny idle sway)
   *   3. update the mouse world position for the shader's repel effect
   *   4. re-render
   * ---------------------------------------------------------------------- */
  _anim() {
    const t = this.clock.getElapsedTime() * this.cfg.speed;

    this.uTime.value = t;

    // --- rotation toward cursor ------------------------------------------
    const targetY = this.mouse.inside ? this.mouse.x * this.cfg.rotateAmount : 0;
    const targetX = this.mouse.inside ? this.mouse.y * this.cfg.rotateAmount * 0.6 : 0;
    this.group.rotation.y += (targetY - this.group.rotation.y) * 0.05;
    this.group.rotation.x += (targetX - this.group.rotation.x) * 0.05;
    // idle sway so it never feels frozen even without a mouse
    this.group.rotation.y += Math.sin(t * 0.12) * 0.008;

    // --- mouse displacement for the shader --------------------------------
    // Only push particles when the cursor is genuinely over the portrait.
    // Otherwise park the repel point far outside the cloud (dist >> radius
    // → smoothstep = 0), so the face stays untouched on load instead of
    // showing a void in the middle before the user even moves the mouse.
    if (this.mouse.inside) {
      this._unprojectMouseLocal();
      this.uMouse.value.copy(this.mouseWorldLocal);
    } else {
      this.uMouse.value.set(1e5, 1e5, 0);
    }

    // --- constant CSS-pixel dot size across every screen ---------------------
    // gl_PointSize = aSize * uPointScale / -mv.z  (device pixels). The group's
    // scale cancels against -mv.z, so multiplying by it keeps the dot size
    // fixed even when the portrait is refitted to a different container.
    this.uPointScale.value = 70 * (this.renderer.getPixelRatio() || 1) * this.group.scale.x;

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this._boundAnim);
  }

  /* ------------------------------------------------------------------------
   * RESPONSIVE — refit the portrait to its container, recompute camera aspect
   * ---------------------------------------------------------------------- */
  _fit() {
    const { container } = this;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;

    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Portrait world size (see STEP 2 constants).
    const imgAspect = this._imgAspect || 1;
    const PORTRAIT_W = 10;
    const PORTRAIT_H = 10 / imgAspect;

    // How much world is visible at the portrait plane with the current aspect.
    const vH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.position.z;
    const vW = vH * this.camera.aspect;

    // Uniform scale so the portrait fills ~88% of the smaller axis — this is
    // what keeps it comfortably inside the hero on every screen size.
    const s = Math.min(vW / PORTRAIT_W, vH / PORTRAIT_H);
    this.group.scale.setScalar(Math.max(s, 0.001));
  }

  _onResize() {
    if (this.points) this._fit();
  }

  /* ------------------------------------------------------------------------
   * WIRING + CLEANUP
   * ---------------------------------------------------------------------- */
  _attach() {
    window.addEventListener("resize", this._onResize);
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.container);
    }
    this.container.addEventListener("mousemove", this._onMouseMove);
    this.container.addEventListener("mouseleave", this._onMouseLeave);
    // touch: track the latest touch as the "cursor" too
    this.container.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        if (t) this._onMouseMove({ clientX: t.clientX, clientY: t.clientY });
      },
      { passive: true }
    );
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this._onResize);
    if (this._ro) this._ro.disconnect();
    this.container.removeEventListener("mousemove", this._onMouseMove);
    this.container.removeEventListener("mouseleave", this._onMouseLeave);
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.material && this.material.uniforms.uTexture.value) {
      this.material.uniforms.uTexture.value.dispose();
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
  }

  /* Graceful degradation: keep the ASCII card visible if WebGL is missing. */
  _fallback(reason) {
    console.warn("Particle portrait fallback:", reason);
    const loading = document.getElementById("portraitLoading");
    const fallback = document.getElementById("asciiFallback");
    if (loading) loading.style.display = "none";
    if (fallback) fallback.style.display = "block";
  }
}

/* Auto-boot: create the portrait when the DOM is ready. */
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("portraitContainer");
  if (container) {
    window.portrait = new ParticlePortrait(container, PORTRAIT_CONFIG);
    window.portrait.init();
  }
});
