// ...existing code...
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreBoardEl = document.getElementById('scoreBoard'); // <-- add this line
let player = { x: 50, y: 350, width: 30, height: 30, dy: 0, gravity: 0.5, jumpPower: -10, grounded: true };
let obstacles = [];
let waterDrops = [];
let jerrycans = [];
let aerialObstacles = [];
let score = 0;
let waterCollected = 0;
let gameSpeed = 4;
let gameActive = false;

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
  ctx.fillStyle = 'black';
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function createObstacle() {
  let height = 30;
  obstacles.push({ x: canvas.width, y: canvas.height - height, width: 20, height });
}

// added: create aerial obstacle (placeholder "bird")
function createAerialObstacle() {
  const width = 30;
  const height = 16;

  // compute a y that is reachable by player when jumping
  const groundY = canvas.height - player.height;
  const maxRise = (player.jumpPower * player.jumpPower) / (2 * player.gravity); // v^2/(2g)

  // Spawn somewhere below the player's absolute max rise so the player can hit it.
  // Make the range dynamic and safe (minY < maxY).
  const minY = Math.max(30, Math.floor(groundY - maxRise * 0.9));      // near the top of reachable area
  const maxY = Math.max(minY + 24, groundY - 40);                      // ensure it's not too close to the ceiling and reachable
  let y = Math.random() * (maxY - minY) + minY;

  // spawn a bit ahead of screen with some horizontal variance
  let x = canvas.width + 100 + Math.random() * 160;

  // avoid spawning directly overlapping existing ground obstacles horizontally
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const buffer = 40;
    if (Math.abs(obs.x - x) < obs.width + buffer) {
      x = obs.x + obs.width + 60;
    }
  }

  aerialObstacles.push({ x, y, width, height });
}

// ...existing code...
function createWaterDrop() {
  // compute ground and max rise from jump physics so drops spawn where the player can reach
  const groundY = canvas.height - player.height;
  const maxRise = (player.jumpPower * player.jumpPower) / (2 * player.gravity); // v^2 / (2g)
  const topY = groundY - maxRise;

  // add small buffers so drops aren't exactly at edges
  const minY = Math.max(topY + 5, 50);            // don't spawn too close to top
  const maxY = groundY - 10;                     // don't spawn below the ground

  let y = Math.random() * (maxY - minY) + minY;

  // spawn items slightly ahead so they don't sit exactly where new obstacles spawn
  let x = canvas.width + 80 + Math.random() * 80;

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

  // default near-ground spawn
  let x = canvas.width + 100 + Math.random() * 120;
  let y = canvas.height - height - 10;

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
    ctx.fillStyle = 'gray';
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    if (obs.x + obs.width < 0) obstacles.splice(i, 1);
  }
}

// added: update/draw aerial obstacles and collision
function updateAerialObstacles() {
  for (let i = 0; i < aerialObstacles.length; i++) {
    let a = aerialObstacles[i];
    a.x -= gameSpeed * frameDelta;
    // placeholder bird: small dark-red rectangle (can replace with sprite later)
    ctx.fillStyle = 'maroon';
    ctx.fillRect(a.x, a.y, a.width, a.height);

    if (a.x + a.width < 0) {
      aerialObstacles.splice(i, 1);
      i--;
      continue;
    }

    // collision check with player (rectangle collision)
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
    ctx.fillStyle = 'aqua';
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.radius, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.fillStyle = 'gold'; // yellow placeholder for charity: water jerrycan
    ctx.fillRect(jc.x, jc.y, jc.width, jc.height);

    if (jc.x + jc.width < 0) {
      jerrycans.splice(i, 1);
      i--;
      continue;
    }

    // collision
    if (player.x < jc.x + jc.width && player.x + player.width > jc.x && player.y < jc.y + jc.height && player.y + player.height > jc.y) {
      waterCollected += 128; // 128 ounces = 1 gallon

      // activate score multiplier for a short duration
      activateMultiplier();

      jerrycans.splice(i, 1);
      i--;
    }
  }
}

function updatePlayer() {
  player.y += player.dy * frameDelta;
  if (player.y + player.height >= canvas.height) {
    player.y = canvas.height - player.height;
    player.dy = 0;
    player.grounded = true;
  } else {
    player.dy += player.gravity * frameDelta;
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
    createAerialObstacle();
    framesSinceLastAerial = 0;
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

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && player.grounded) {
    player.dy = player.jumpPower;
    player.grounded = false;
  }
});

function gameOver() {
  gameActive = false;
  document.getElementById('gameCanvas').style.display = 'none';
  document.getElementById('gameOverScreen').style.display = 'flex';

  document.getElementById('endScoreText').textContent = `Score: ${Math.floor(score)}`;
  document.getElementById('finalScoreText').textContent = `You collected ${waterCollected} ounces of water!`;
}

document.getElementById('playButton').onclick = () => {
  document.getElementById('startScreen').style.display = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  startGame();
};

document.getElementById('replayButton').onclick = () => {
  document.getElementById('gameOverScreen').style.display = 'none';
  document.getElementById('gameCanvas').style.display = 'block';
  startGame();
};

function startGame() {
  player.y = 350;
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

  obstacleSpawnInterval = 150;

  lastTimestamp = 0;
  frameDelta = 1;

  gameActive = true;
  requestAnimationFrame(gameLoop);
}
// ...existing code...