let canvas;
let ctx;
let scoreBoardEl;
// add: consistent sky/ground colors pulled from CSS and a background draw helper
const _rootStyle = getComputedStyle(document.documentElement);
const skyColor = (_rootStyle.getPropertyValue('--brand-bg') || '#77a8bb').trim();
const groundColor = '#1a1a1a'; // brand dark for ground (replace #111/#000)
const groundHeight = 80; // adjust if your game draws ground at a different height

// add difficulty state (default normal)
let currentDifficulty = 'normal';

// apply difficulty tuning (call at start of game)
function applyDifficultySettings(mode) {
  currentDifficulty = mode || 'normal';

  if (mode === 'normal') {
    gameSpeed = 4;
    obstacleSpawnInterval = 150;
    aerialSpawnInterval = 600;
    // keep default water/jerrycan frequencies
  } else if (mode === 'hard') {
    gameSpeed = 5;                  // faster
    obstacleSpawnInterval = 120;    // more frequent obstacles
    aerialSpawnInterval = 450;      // more frequent birds
  } else if (mode === 'extreme') {
    gameSpeed = 6.25;               // much faster
    obstacleSpawnInterval = 90;     // very frequent obstacles
    aerialSpawnInterval = 360;      // frequent birds
  } else {
      // fallback safe defaults
    gameSpeed = 4;
    obstacleSpawnInterval = 150;
    aerialSpawnInterval = 600;
  }
  // reset frame counters so the first spawns follow the chosen pacing
  framesSinceLastObstacle = 0;
  framesSinceLastAerial = 0;
  framesSinceDifficultyIncrease = 0;
}

const sounds = {};
function preloadSounds(map, cb) {
  const keys = Object.keys(map);
  if (keys.length === 0) { if (cb) cb(); return; }
  let loaded = 0;
  keys.forEach(k => {
    sounds[k] = new Audio();
    sounds[k].src = map[k];
    // try to consider it loaded when playable through or on error
    sounds[k].oncanplaythrough = () => { if (++loaded === keys.length && cb) cb(); };
    sounds[k].onerror = () => { if (++loaded === keys.length && cb) cb(); };
  });
}

function drawBackground() {
  // sky
  ctx.fillStyle = skyColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ground (bottom strip where obstacles/player run)
  ctx.fillStyle = groundColor;
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);
}

let player = {
  x: 50, y: 350, width: 30, height: 30,
  dy: 0, gravity: 0.5, jumpPower: -10,
  grounded: true,
  maxJumps: 2,   // allow double-jump
  jumps: 0       // jumps used since last grounded
};
let obstacles = [];
let waterDrops = [];
let jerrycans = [];
let aerialObstacles = [];
let score = 0;
let waterCollected = 0;
let gameSpeed = 4;
let gameActive = false;

// added: simple image loader
const images = {};
function preloadImages(map, cb) {
  const keys = Object.keys(map);
  if (keys.length === 0) { if (cb) cb(); return; }
  let loaded = 0;
  keys.forEach(k => {
    images[k] = new Image();
    images[k].__failed = false;
    images[k].onload = () => { images[k].__failed = false; if (++loaded === keys.length && cb) cb(); };
    images[k].onerror = () => { images[k].__failed = true; console.warn('Image failed to load:', map[k]); if (++loaded === keys.length && cb) cb(); };
    images[k].src = map[k];
  });
}

// start preloading the jerrycan image (adjust path/name if needed)
preloadImages({
  jerrycan: 'assets/images/jerrycannnnnnnnnnnn.png',
  rock: 'assets/sprites/rock.png', /* added: single-cropped rock image for obstacles */
  run: 'assets/sprites/run.png',   /* added: player running sheet */
  jump: 'assets/sprites/jump.png',  /* added: player jumping sheet */
  bird: 'assets/sprites/flying-creature-cycle.png', /* added: flying creature sheet (will be flipped) */
  waterDrop: 'assets/sprites/onedrop.png' /* added: single water drop image */
}, () => {
  console.log('images preloaded');
    // init player animations once images are available
   initPlayerAnimations();
   initBirdSprite();
});

// --- PLAYER SPRITE / ANIMATION (replace black square with run/jump sheets) ---
const playerSprite = {
  runImg: null,
  jumpImg: null,
  frameW: 0,
  frameH: 0,
  runFrames: 0,
  jumpFrames: 0,
  animSpeed: 0.25,   // tweak: higher = faster animation
  frameIndex: 0,
  currentAnim: 'run' // 'run' or 'jump'
};

function detectFramesFromSheet(img) {
  if (!img || !img.width || !img.height) return { frameH: 32, frames: [{ sx: 0, sw: 32 }] };

  // Try transparency-based detection in a hidden canvas
  try {
    const oc = document.createElement('canvas');
    oc.width = img.width;
    oc.height = img.height;
    const octx = oc.getContext('2d');
    octx.drawImage(img, 0, 0);
    const data = octx.getImageData(0, 0, oc.width, oc.height).data;
    const cols = oc.width;
    const rows = oc.height;
    const alphaThreshold = 10; // treat <= this as transparent

    const isTransparent = new Array(cols).fill(true);
    for (let x = 0; x < cols; x++) {
      let maxA = 0;
      for (let y = 0; y < rows; y++) {
        const a = data[(y * cols + x) * 4 + 3];
        if (a > maxA) {
          maxA = a;
          if (maxA > alphaThreshold) break;
        }
      }
      isTransparent[x] = maxA <= alphaThreshold;
    }

    // build non-transparent segments: contiguous columns where isTransparent is false
    const segments = [];
    let x = 0;
    while (x < cols) {
      if (!isTransparent[x]) {
        const start = x;
        while (x < cols && !isTransparent[x]) x++;
        const sw = x - start;
        segments.push({ sx: start, sw });
      } else {
        x++;
      }
    }

    // If we found multiple segments, assume they are frames and return them
    if (segments.length >= 2) {
      return { frameH: rows, frames: segments };
    }
  } catch (err) {
    console.warn('Transparent-frame detection failed, falling back to divisor method', err);
  }

  // Fallback: find a divisor-based frame width similar to previous approach,
  // but return exact frame rects (no bleed).
  const iw = img.width;
  const ih = img.height;
  for (let count = Math.min(20, Math.floor(iw / 8)); count >= 2; count--) {
    if (iw % count === 0) {
      const fw = iw / count;
      if (Math.abs(fw - ih) <= ih * 0.6 || fw >= 16) {
        const frames = [];
        for (let i = 0; i < count; i++) frames.push({ sx: Math.round(i * fw), sw: Math.round(fw) });
        return { frameH: ih, frames };
      }
    }
  }

  // Last resort: single full-width frame
  return { frameH: ih, frames: [{ sx: 0, sw: iw }] };
}

function initPlayerAnimations() {
  // set run image/frame data
  if (images.run && !images.run.__failed) {
    playerSprite.runImg = images.run;
    const d = detectFramesFromSheet(images.run);
    playerSprite.frameH = d.frameH;
    playerSprite.runFramesData = d.frames;
    playerSprite.runFrames = d.frames.length;
    // If no frameW set yet, use first frame width
    if (!playerSprite.frameW && d.frames.length) playerSprite.frameW = d.frames[0].sw;
  }

  // set jump image/frame data
  if (images.jump && !images.jump.__failed) {
    playerSprite.jumpImg = images.jump;
    const d = detectFramesFromSheet(images.jump);
    playerSprite.frameH = playerSprite.frameH || d.frameH;
    playerSprite.jumpFramesData = d.frames;
    playerSprite.jumpFrames = d.frames.length;
    if (!playerSprite.frameW && d.frames.length) playerSprite.frameW = d.frames[0].sw;
  }

  // size the player to match sprite frames if possible
  if (playerSprite.frameW && playerSprite.frameH) {
    player.width = playerSprite.frameW;
    player.height = playerSprite.frameH;
    if (typeof canvas !== 'undefined' && canvas && canvas.height) {
      player.y = canvas.height - player.height;
    }
  }

  playerSprite.frameIndex = 0;
  playerSprite.currentAnim = player.grounded ? 'run' : 'jump';
}

// Replace drawSheetFrame to use frame rect data (no sampling across frames)
function drawSheetFrame(img, framesData, frameIndex, frameH, dx, dy, dw, dh) {
  if (!img || img.__failed || !img.complete || !img.naturalWidth) {
    ctx.fillStyle = 'black';
    ctx.fillRect(dx, dy, dw, dh);
    return;
  }

  const framesAcross = framesData.length || Math.max(1, Math.floor(img.width / (framesData[0]?.sw || dw)));
  const fi = Math.floor(frameIndex) % framesAcross;
  const frame = framesData[fi] || framesData[0];

  const sx = Math.round(frame.sx);
  const sy = 0;
  const sw = Math.round(frame.sw);
  const sh = Math.round(frameH);

  // clamp to image bounds
  const safeSx = Math.min(Math.max(0, sx), Math.max(0, img.width - sw));
  ctx.drawImage(img, safeSx, sy, sw, sh, dx, dy, dw, dh);
}

// --- BIRD (aerial) sprite: flip sheet to face left and draw frames ---
const birdSprite = {
  img: null,
  framesData: null,
  frames: 0,
  frameH: 0,
  frameIndex: 0,
  animSpeed: 0.18, // wing flap speed
  flippedCanvas: null,
  failed: false
};

function initBirdSprite() {
  if (!images.bird || images.bird.__failed) {
    birdSprite.failed = true;
    return;
  }
  const img = images.bird;
  birdSprite.img = img;

  // detect frames (uses existing detectFramesFromSheet)
  const d = detectFramesFromSheet(img);
  birdSprite.framesData = d.frames;
  birdSprite.frames = d.frames.length;
  birdSprite.frameH = d.frameH || img.height;

  // create an offscreen canvas and draw the sheet flipped horizontally
  try {
    const oc = document.createElement('canvas');
    oc.width = img.width;
    oc.height = img.height;
    const octx = oc.getContext('2d');

    octx.save();
    octx.translate(oc.width, 0);
    octx.scale(-1, 1);
    octx.drawImage(img, 0, 0);
    octx.restore();

    birdSprite.flippedCanvas = oc;
  } catch (err) {
    console.warn('Could not create flipped bird canvas:', err);
    birdSprite.failed = true;
  }
}

// draw a single bird frame using the flipped sheet
function drawBirdFrame(bird, dx, dy, dw, dh) {
  if (!bird || bird.failed || !bird.flippedCanvas || !bird.framesData || bird.framesData.length === 0) {
    ctx.fillStyle = 'maroon';
    ctx.fillRect(dx, dy, dw, dh);
    return;
  }

  bird.frameIndex += bird.animSpeed * frameDelta;
  const fi = Math.floor(bird.frameIndex) % bird.frames;
  const frame = bird.framesData[fi] || bird.framesData[0];

  const sx = Math.round(frame.sx);
  const sy = 0;
  const sw = Math.round(frame.sw);
  const sh = Math.round(bird.frameH);

  // clamp to source bounds
  const safeSx = Math.min(Math.max(0, sx), Math.max(0, bird.flippedCanvas.width - sw));
  ctx.drawImage(bird.flippedCanvas, safeSx, sy, sw, sh, dx, dy, dw, dh);
}

// helper: compute visible (non-transparent) rect for an Image and cache result on the image
function analyzeImageVisibleBounds(img) {
  if (!img || !img.complete || img.__failed) return null;
  if (img.__bounds) return img.__bounds;

  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const oc = document.createElement('canvas');
    oc.width = w;
    oc.height = h;
    const octx = oc.getContext('2d');
    octx.drawImage(img, 0, 0);
    const data = octx.getImageData(0, 0, w, h).data;

    let top = 0;
    let bottom = h - 1;
    let left = 0;
    let right = w - 1;
    const alphaThreshold = 10;

    // find top
    let found = false;
    for (let y = 0; y < h && !found; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > alphaThreshold) { top = y; found = true; break; }
      }
    }
    // find bottom
    found = false;
    for (let y = h - 1; y >= 0 && !found; y--) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > alphaThreshold) { bottom = y; found = true; break; }
      }
    }
    // find left
    found = false;
    for (let x = 0; x < w && !found; x++) {
      for (let y = 0; y < h; y++) {
        if (data[(y * w + x) * 4 + 3] > alphaThreshold) { left = x; found = true; break; }
      }
    }
    // find right
    found = false;
    for (let x = w - 1; x >= 0 && !found; x--) {
      for (let y = 0; y < h; y++) {
        if (data[(y * w + x) * 4 + 3] > alphaThreshold) { right = x; found = true; break; }
      }
    }

    const bounds = {
      sx: left,
      sy: top,
      sw: Math.max(1, right - left + 1),
      sh: Math.max(1, bottom - top + 1),
      iw: w,
      ih: h
    };
    img.__bounds = bounds;
    return bounds;
  } catch (e) {
    console.warn('analyzeImageVisibleBounds failed', e);
    return null;
  }
}



preloadSounds({
  jump: 'assets/sounds/jump.wav',
  power_up: 'assets/sounds/power_up.wav',
}, () => console.log('sounds preloaded'));

document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    if (player.jumps < player.maxJumps) {
      player.dy = player.jumpPower;
      player.jumps += 1;
      player.grounded = false;
      try {
        if (sounds.jump) {
          sounds.jump.currentTime = 0;
          sounds.jump.play().catch(()=>{/* autoplay blocked */});
        }
      } catch (err) {/* ignore */}
    }
    e.preventDefault();
  }
});

// add touch support for mobile: tap to jump / double-tap-in-air for double jump
let lastTouchTime = 0;
document.addEventListener('touchstart', (ev) => {
  const now = Date.now();
  // basic debounce to avoid accidental multi-fire
  if (now - lastTouchTime < 50) return;
  lastTouchTime = now;

  if (player.jumps < player.maxJumps) {
    player.dy = player.jumpPower;
    player.jumps += 1;
    player.grounded = false;
  }
  ev.preventDefault();
}, { passive: false });


// time / frame-delta helpers (added)
let lastTimestamp = 0;
let frameDelta = 1; // multiplier for per-frame updates (1 == 60FPS)
// ...existing code...

// added: multiplier state
let scoreMultiplier = 1;
let multiplierActive = false;
const multiplierValue = 2;
const multiplierDuration = 5000; // ms
let multiplierExpires = 0;

// added: helper to enable multiplier visual/state
function activateMultiplier() {
  multiplierActive = true;
  scoreMultiplier = multiplierValue;
  multiplierExpires = Date.now() + multiplierDuration;
  scoreBoardEl.classList.add('multiplier');
}

// added: helper to disable multiplier
function deactivateMultiplier() {
  multiplierActive = false;
  scoreMultiplier = 1;
  scoreBoardEl.classList.remove('multiplier');
}

// added: obstacle spawn tuning variables
let obstacleSpawnInterval = 150;        // initial frames between obstacles (~2.5s at 60fps)
let framesSinceLastObstacle = 0;
const minObstacleSpawnInterval = 60;    // minimum interval (~1s)
const obstacleDifficultyTick = 900;     // every 900 frames (~15s) reduce interval
let framesSinceDifficultyIncrease = 0;
// ...existing code...

// ...existing code...
// add aerial spawn vars (place here)
let aerialSpawnInterval = 600;          // frames between aerial spawns (~10s at 60fps)
let framesSinceLastAerial = 0;
// ...existing code...

function drawPlayer() {
  const anim = player.grounded ? 'run' : 'jump';
  if (anim !== playerSprite.currentAnim) {
    playerSprite.currentAnim = anim;
    playerSprite.frameIndex = 0;
  }

  const img = anim === 'run' ? playerSprite.runImg : playerSprite.jumpImg;
  const framesData = anim === 'run' ? playerSprite.runFramesData : playerSprite.jumpFramesData;
  const frames = framesData ? framesData.length : 0;
  const fh = playerSprite.frameH || player.height;

  if (!img || frames <= 1 || !framesData) {
    ctx.fillStyle = 'black';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    return;
  }

  playerSprite.frameIndex += playerSprite.animSpeed * frameDelta;
  const dw = player.width;
  const dh = player.height;
  drawSheetFrame(img, framesData, playerSprite.frameIndex, fh, player.x, player.y, dw, dh);
}

function createObstacle() {
  // default visual width we'd like obstacles to appear at
  const desiredWidth = 48;

  // if we have a rock image, compute visible bounds and size the obstacle to the visible content
  if (images.rock && !images.rock.__failed && images.rock.complete && images.rock.naturalWidth) {
    const b = analyzeImageVisibleBounds(images.rock);
    if (b) {
      const scale = desiredWidth / b.sw;
      const width = Math.round(b.sw * scale);
      const height = Math.round(b.sh * scale);
      const y = canvas.height - groundHeight - height; // align visible bottom to ground
      const spawnX = canvas.width + 120 + Math.random() * 120;
      obstacles.push({
        x: spawnX,
        y,
        width,
        height,
        // store source rect so we draw only the visible portion (avoids padding)
        sx: b.sx,
        sy: b.sy,
        sw: b.sw,
        sh: b.sh
      });
      return;
    }
  }

  // fallback when no image bounds: box obstacle
  const width = 48;
  const height = 32;
  const y = canvas.height - groundHeight - height; // place on top of visible ground
  const spawnX = canvas.width + 120 + Math.random() * 120;
  obstacles.push({ x: spawnX, y, width, height });
}

// tune: minimum frames after an obstacle before an aerial can spawn
const MIN_FRAMES_AFTER_OBSTACLE_FOR_AERIAL = 140; // ~2.3s at 60fps, tweak as needed


// added: create aerial obstacle (placeholder "bird")
function createAerialObstacle() {
  const width = 30;
  const height = 16;

  const groundY = canvas.height - groundHeight - player.height;
  const maxRise = (player.jumpPower * player.jumpPower) / (2 * player.gravity);

  const minY = Math.max(30, Math.floor(groundY - maxRise * 0.9));
  const maxY = Math.max(minY + 24, groundY - 40);

  const baseX = canvas.width + 100;
  const MAX_OFFSCREEN = canvas.width + 800;
  const MIN_GAP = 260; // larger safety gap

  // start spawnX to the right of screen
  let spawnX = baseX + Math.random() * 160;

  // if there is at least one obstacle, force spawnX to be to the right of the latest obstacle + gap
  if (obstacles.length > 0) {
    const lastObs = obstacles[obstacles.length - 1];
    spawnX = Math.max(spawnX, lastObs.x + lastObs.width + MIN_GAP);
  }

  // extra safety: ensure spawnX is to the right of all obstacles (use max requirement)
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    spawnX = Math.max(spawnX, obs.x + obs.width + MIN_GAP);
  }
  // choose y and clamp
  let y = Math.random() * (maxY - minY) + minY;
  spawnX = Math.min(spawnX, MAX_OFFSCREEN);
  y = Math.min(Math.max(y, minY), maxY);

  aerialObstacles.push({ x: spawnX, y, width, height });
}

// ...existing code...
function createWaterDrop() {
  // compute top-of-ground and max rise from jump physics so drops spawn where the player can reach
  const groundY = canvas.height - groundHeight - player.height;
  const maxRise = (player.jumpPower * player.jumpPower) / (2 * player.gravity); // v^2 / (2g)
  const topY = groundY - maxRise;

  // add small buffers so drops aren't exactly at edges
  const minY = Math.max(topY + 5, 50);            // don't spawn too close to top
  const maxY = groundY - 10;                     // don't spawn below the ground

  let y = Math.random() * (maxY - minY) + minY;

  // spawn items slightly ahead so they don't sit exactly where new obstacles spawn
  let x = canvas.width + 120 + Math.random() * 120;

  // if any existing obstacle would overlap this x, push the item further right until clear
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const buffer = 10;
    if (Math.abs(obs.x - x) < obs.width + buffer) {
      x = obs.x + obs.width + 40;
    }
  }

  // ensure the drop isn't exactly sitting on top of an obstacle at that x; if it would, move it slightly up
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (x >= obs.x && x <= obs.x + obs.width) {
      // move drop above the obstacle top (but not too high)
      y = Math.min(y, obs.y - 12);
      y = Math.max(y, 40);
    }
  }

  waterDrops.push({ x, y, radius: 8 });
}

function createJerrycan() {
    const width = 20;
    const height = 28;

  // default near-ground spawn (on visible ground)
  let x = canvas.width + 100 + Math.random() * 120;
  let y = canvas.height - groundHeight - height - 10;

  // avoid spawning directly where obstacles are; push right if overlapping
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const buffer = 20;
    if (Math.abs(obs.x - x) < obs.width + buffer) {
      x = obs.x + obs.width + 60;
    }
  }


  // if spawn x would still land on an obstacle horizontally, try to place the jerrycan slightly above the obstacle top
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (x >= obs.x && x <= obs.x + obs.width) {
      y = Math.max(30, obs.y - height - 6); // ensure not too high
    }
  }


  jerrycans.push({ x, y, width, height });
}

function updateObstacles() {
  for (let i = 0; i < obstacles.length; i++) {
    let obs = obstacles[i];
    obs.x -= gameSpeed * frameDelta;

    // draw rock using source rect if present (aligns visible bottom to ground)
    if (images.rock && !images.rock.__failed && images.rock.complete && images.rock.naturalWidth && obs.sx !== undefined) {
      try {
        ctx.drawImage(images.rock, obs.sx, obs.sy, obs.sw, obs.sh, obs.x, obs.y, obs.width, obs.height);
      } catch (err) {
        console.error('drawImage failed for rock (with src rect), falling back to rect:', err);
        ctx.fillStyle = 'gray';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        images.rock.__failed = true;
      }
    } else if (images.rock && !images.rock.__failed && images.rock.complete && images.rock.naturalWidth) {
      // no src rect available — draw the full image scaled to obstacle box
      try {
        ctx.drawImage(images.rock, obs.x, obs.y, obs.width, obs.height);
      } catch (err) {
        console.error('drawImage failed for rock, falling back to rect:', err);
        ctx.fillStyle = 'gray';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        images.rock.__failed = true;
      }
    } else {
      ctx.fillStyle = 'gray';
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    }

    if (obs.x + obs.width < 0) {
      obstacles.splice(i, 1);
      i--;
    }
  }
}

// added: update/draw aerial obstacles and collision
function updateAerialObstacles() {
  for (let i = 0; i < aerialObstacles.length; i++) {
    let a = aerialObstacles[i];
    a.x -= gameSpeed * frameDelta;

    // check overlaps with ground obstacles; try to fix by nudging up or shifting right
    const buffer = 6;
    for (let j = 0; j < obstacles.length; j++) {
      const obs = obstacles[j];
      const horizOverlap = (a.x < obs.x + obs.width) && (a.x + a.width > obs.x);
      if (horizOverlap) {
        const desiredY = obs.y - a.height - buffer;
        // if we can move bird above obstacle without exceeding minY, do it
        const groundY = canvas.height - groundHeight - player.height;
        const maxRise = (player.jumpPower * player.jumpPower) / (2 * player.gravity);
        const minY = Math.max(30, Math.floor(groundY - maxRise * 0.9));
        if (desiredY >= minY) {
          a.y = Math.min(a.y, desiredY);
        } else {
          // can't move up; shift bird right to avoid overlap
          a.x = obs.x + obs.width + Math.max(120, Math.round(player.width * 2));
        }
      }
    }

    // draw bird sprite (flipped to face left) if available
    const drawW = a.width;
    const drawH = a.height;
    drawBirdFrame(birdSprite, a.x, a.y, drawW, drawH);


    if (a.x + a.width < 0) {
      aerialObstacles.splice(i, 1);
      i--;
      continue;
    }

    // collision check
    if (player.x < a.x + a.width && player.x + player.width > a.x &&
        player.y < a.y + a.height && player.y + player.height > a.y) {
      gameOver();
      return;
    }
  }
}

function updateWaterDrops() {
  for (let i = 0; i < waterDrops.length; i++) {
    let drop = waterDrops[i];
    drop.x -= gameSpeed * frameDelta;

    // draw single-drop image if available, otherwise fallback to circle
    if (images.waterDrop && !images.waterDrop.__failed && images.waterDrop.complete && images.waterDrop.naturalWidth) {
      const dw = drop.radius * 2;
      const dh = drop.radius * 2;
      // draw centered on drop.x, drop.y
      try {
        ctx.drawImage(images.waterDrop, drop.x - drop.radius, drop.y - drop.radius, dw, dh);
      } catch (err) {
        // fallback to circle on any draw failure
        ctx.fillStyle = 'aqua';
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
        ctx.fill();
        images.waterDrop.__failed = true;
      }
    } else {
      ctx.fillStyle = 'aqua';
      ctx.beginPath();
      ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
      ctx.fill();
    }  

    if (drop.x < 0) {
      waterDrops.splice(i, 1);
      i--;
      continue;
    }

    // collision (droplet -> 8 ounces)
    if (drop.x < player.x + player.width && drop.x + drop.radius > player.x && drop.y > player.y && drop.y < player.y + player.height) {
      waterCollected += 8; // 8 ounces per droplet
      waterDrops.splice(i, 1);
      i--;
    }
  }
}

function updateJerrycans() {
  for (let i = 0; i < jerrycans.length; i++) {
    let jc = jerrycans[i];
    jc.x -= gameSpeed * frameDelta;


    // draw jerrycan image if loaded, otherwise fallback to placeholder
    if (images.jerrycan && images.jerrycan.complete) {
      ctx.drawImage(images.jerrycan, jc.x, jc.y, jc.width, jc.height);
    } else {
      ctx.fillStyle = 'gold'; // yellow placeholder for charity: water jerrycan
      ctx.fillRect(jc.x, jc.y, jc.width, jc.height);
    }

    if (jc.x + jc.width < 0) {
      jerrycans.splice(i, 1);
      i--;
      continue;
    }

    // collision
    if (player.x < jc.x + jc.width && player.x + player.width > jc.x && player.y < jc.y + jc.height && player.y + player.height > jc.y) {
      waterCollected += 128; // 128 ounces = 1 gallon

      // play power-up sound (safe try/catch to handle autoplay restrictions)
      try {
        if (sounds.power_up) {
          sounds.power_up.currentTime = 0;
          sounds.power_up.play().catch(()=>{});
        }
      } catch (err) { /* ignore audio errors */ }

      // activate score multiplier for a short duration
      activateMultiplier();

      jerrycans.splice(i, 1);
      i--;
    }
  }
}

function updatePlayer() {
  player.y += player.dy * frameDelta;
   const groundY = canvas.height - groundHeight; // top of visible ground
   if (player.y + player.height >= groundY) {
     player.y = groundY - player.height;
    player.dy = 0;
    player.grounded = true;
    player.jumps = 0; // reset jump count on landing
  } else {
    player.dy += player.gravity * frameDelta;
    player.grounded = false;
  }
}



function checkCollision() {
  for (let obs of obstacles) {
    if (player.x < obs.x + obs.width && player.x + player.width > obs.x && player.y + player.height > obs.y) {
      gameOver();
    }
  }
}

function gameLoop(timestamp) {
  if (!gameActive) return;

  // compute frame delta relative to 60FPS baseline
  if (!timestamp) timestamp = performance.now();
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = timestamp - lastTimestamp;
  frameDelta = dt / (1000 / 60); // 1.0 == one 60fps frame
  // clamp to avoid huge jumps after tab switching
  frameDelta = Math.min(Math.max(frameDelta, 0.5), 4);
  lastTimestamp = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw sky + visible ground first so obstacles/player render on top
  if (typeof drawBackground === 'function') drawBackground();


  drawPlayer();
  updatePlayer();
  updateObstacles();
  updateWaterDrops();
  updateJerrycans();
  updateAerialObstacles();
  checkCollision();

  // expire multiplier when time is up
  if (multiplierActive && Date.now() > multiplierExpires) {
    deactivateMultiplier();
  }  

  score += scoreMultiplier * frameDelta;

  // obstacle spawn using a frame counter so interval can be adjusted over time
  framesSinceLastObstacle += frameDelta;
  if (framesSinceLastObstacle >= obstacleSpawnInterval) {
    createObstacle();
    framesSinceLastObstacle = 0;
  }

  // aerial spawn (less frequent than boulders, more frequent than jerrycans)
  framesSinceLastAerial += frameDelta;
   if (framesSinceLastAerial >= aerialSpawnInterval) {
     // allow spawn if enough frames passed since last obstacle OR
     // if the most recent obstacle has moved far enough left from the right edge
     const lastObs = obstacles.length ? obstacles[obstacles.length - 1] : null;
     const SAFE_AHEAD = 220; // pixels of horizontal free space on right to allow safe aerial spawn
     const lastObsCleared = !lastObs || (lastObs.x + lastObs.width) < (canvas.width - SAFE_AHEAD);
     if (framesSinceLastObstacle > MIN_FRAMES_AFTER_OBSTACLE_FOR_AERIAL || lastObsCleared) {
       createAerialObstacle();
       framesSinceLastAerial = 0;
     }
   }

  // gradually make obstacles spawn more frequently (but never below the min)
  framesSinceDifficultyIncrease += frameDelta;
  if (framesSinceDifficultyIncrease >= obstacleDifficultyTick) {
    obstacleSpawnInterval = Math.max(minObstacleSpawnInterval, obstacleSpawnInterval - 10);
    framesSinceDifficultyIncrease = 0;
  }

  // water and jerrycan spawns unchanged (use score as a rough timer; keep mod behavior)
  if (Math.floor(score) % 100 === 0) createWaterDrop();
  if (Math.floor(score) % 1000 === 0) createJerrycan();

  scoreBoardEl.textContent = `Score: ${Math.floor(score)} | Water: ${waterCollected} oz`;
  requestAnimationFrame(gameLoop);
}


function gameOver() {
  gameActive = false;
  const gameCanvasEl = document.getElementById('gameCanvas');
  const gameOverEl = document.getElementById('gameOverScreen');

  if (gameCanvasEl) gameCanvasEl.style.display = 'none';
  if (gameOverEl) gameOverEl.style.display = 'flex';

  const endScoreEl = document.getElementById('endScoreText');
  const finalScoreEl = document.getElementById('finalScoreText');

  if (endScoreEl) endScoreEl.textContent = `Score: ${Math.floor(score)}`;
  if (finalScoreEl) finalScoreEl.textContent = `You collected ${waterCollected} ounces of water!`;
}

// update startGame to accept mode param and call applyDifficultySettings
function startGame(mode) {
  // apply difficulty settings first (mode optional)
  applyDifficultySettings(mode || currentDifficulty);

  // position player on top of visible ground
  player.x = 50;
  player.y = (canvas && canvas.height ? canvas.height : 400) - groundHeight - player.height;
  player.jumps = 0;
  player.grounded = true;

  score = 0;
  waterCollected = 0;
  obstacles = [];
  waterDrops = [];
  jerrycans = [];
  aerialObstacles = [];

  framesSinceLastObstacle = 0;
  framesSinceLastAerial = 0;
  framesSinceDifficultyIncrease = 0;

  multiplierActive = false;
  scoreMultiplier = 1;
  multiplierExpires = 0;

  lastTimestamp = 0;
  frameDelta = 1;

  gameActive = true;
  requestAnimationFrame(gameLoop);
}

// wire start / replay / difficulty buttons after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // assign canvas/ctx and scoreboard now DOM is available
  canvas = document.getElementById('game');
  if (!canvas) {
    console.error('Canvas #game not found in DOM.');
    return;
  }
  ctx = canvas.getContext('2d');
  scoreBoardEl = document.getElementById('scoreBoard') || document.createElement('div');


  const playBtn = document.getElementById('playButton');
  const diffBox = document.getElementById('difficultySelector');
  const btnNormal = document.getElementById('btnNormal');
  const btnHard = document.getElementById('btnHard');
  const btnExtreme = document.getElementById('btnExtreme');

  // toggle difficulty selector when Play clicked
  if (playBtn && diffBox) {
    playBtn.addEventListener('click', () => {
      diffBox.style.display = (diffBox.style.display === 'block') ? 'none' : 'block';
    });
  }

  // helper to hide start screen, show game canvas and start with mode
  function startWithMode(mode) {
    const ss = document.getElementById('startScreen');
    const gc = document.getElementById('gameCanvas');
    if (ss) ss.style.display = 'none';
    if (gc) gc.style.display = 'block';
    if (typeof startGame === 'function') startGame(mode);
  }

  if (btnNormal)  btnNormal.addEventListener('click', () => startWithMode('normal'));
  if (btnHard)    btnHard.addEventListener('click', () => startWithMode('hard'));
  if (btnExtreme) btnExtreme.addEventListener('click', () => startWithMode('extreme'));

  // wire replay/play fallbacks that were previously top-level
  const playButtonFallback = document.getElementById('playButton');
  if (playButtonFallback && !btnNormal && !btnHard && !btnExtreme) {
    // if no difficulty UI exists, start normal directly
    playButtonFallback.addEventListener('click', () => {
      startWithMode('normal');
    });
  }
  const replayBtn = document.getElementById('replayButton');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      document.getElementById('gameOverScreen').style.display = 'none';
      document.getElementById('gameCanvas').style.display = 'block';
      startGame(currentDifficulty);
    });
  }

  // now that canvas exists, initialize any sprite sizing that relied on it
  if (images.run || images.jump) {
    try { initPlayerAnimations(); } catch (e) { /* ignore if images not ready */ }
  }
  if (images.bird) {
    try { initBirdSprite(); } catch (e) { /* ignore if images not ready */ }
  }
});


// ...existing code...