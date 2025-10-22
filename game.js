// ...existing code...
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let player = { x: 50, y: 350, width: 30, height: 30, dy: 0, gravity: 0.5, jumpPower: -10, grounded: true };
let obstacles = [];
let waterDrops = [];
let jerrycans = [];
let score = 0;
let waterCollected = 0;
let gameSpeed = 4;
let gameActive = false;

// added: obstacle spawn tuning variables
let obstacleSpawnInterval = 150;        // initial frames between obstacles (~2.5s at 60fps)
let framesSinceLastObstacle = 0;
const minObstacleSpawnInterval = 60;    // minimum interval (~1s)
const obstacleDifficultyTick = 900;     // every 900 frames (~15s) reduce interval
let framesSinceDifficultyIncrease = 0;
// ...existing code...

function drawPlayer() {
  ctx.fillStyle = 'black';
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function createObstacle() {
  let height = 30;
  obstacles.push({ x: canvas.width, y: canvas.height - height, width: 20, height });
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
    obs.x -= gameSpeed;
    ctx.fillStyle = 'gray';
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    if (obs.x + obs.width < 0) obstacles.splice(i, 1);
  }
}

function updateWaterDrops() {
  for (let i = 0; i < waterDrops.length; i++) {
    let drop = waterDrops[i];
    drop.x -= gameSpeed;
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
    jc.x -= gameSpeed;
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
      jerrycans.splice(i, 1);
      i--;
    }
  }
}

function updatePlayer() {
  player.y += player.dy;
  if (player.y + player.height >= canvas.height) {
    player.y = canvas.height - player.height;
    player.dy = 0;
    player.grounded = true;
  } else {
    player.dy += player.gravity;
  }
}

function checkCollision() {
  for (let obs of obstacles) {
    if (player.x < obs.x + obs.width && player.x + player.width > obs.x && player.y + player.height > obs.y) {
      gameOver();
    }
  }
}

function gameLoop() {
  if (!gameActive) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawPlayer();
  updatePlayer();
  updateObstacles();
  updateWaterDrops();
  updateJerrycans();
  checkCollision();

  score++;

  // obstacle spawn using a frame counter so interval can be adjusted over time
  framesSinceLastObstacle++;
  if (framesSinceLastObstacle >= obstacleSpawnInterval) {
    createObstacle();
    framesSinceLastObstacle = 0;
  }

  // gradually make obstacles spawn more frequently (but never below the min)
  framesSinceDifficultyIncrease++;
  if (framesSinceDifficultyIncrease >= obstacleDifficultyTick) {
    obstacleSpawnInterval = Math.max(minObstacleSpawnInterval, obstacleSpawnInterval - 10);
    framesSinceDifficultyIncrease = 0;
  }

  if (score % 100 === 0) createWaterDrop();
  if (score % 1000 === 0) createJerrycan();

  document.getElementById('scoreBoard').textContent = `Score: ${score} | Water: ${waterCollected}`;
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

  document.getElementById('endScoreText').textContent = `Score: ${score}`;
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
  gameActive = true;
  gameLoop();
}
// ...existing code...