// ...existing code...
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let player = { x: 50, y: 350, width: 30, height: 30, dy: 0, gravity: 0.5, jumpPower: -10, grounded: true };
let obstacles = [];
let waterDrops = [];
let score = 0;
let waterCollected = 0;
let gameSpeed = 4;
let gameActive = false;

function drawPlayer() {
  ctx.fillStyle = 'black';
  ctx.fillRect(player.x, player.y, player.width, player.height);
}

function createObstacle() {
  let height = 30;
  obstacles.push({ x: canvas.width, y: canvas.height - height, width: 20, height });
}

function createWaterDrop() {
  let y = Math.random() * 200 + 150;
  waterDrops.push({ x: canvas.width, y, radius: 8 });
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

    if (drop.x < 0) waterDrops.splice(i, 1);
    if (drop.x < player.x + player.width && drop.x + drop.radius > player.x && drop.y > player.y && drop.y < player.y + player.height) {
      waterCollected++;
      waterDrops.splice(i, 1);
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
  checkCollision();

  score++;
  if (score % 150 === 0) createObstacle();
  if (score % 100 === 0) createWaterDrop();

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
  document.getElementById('finalScoreText').textContent = `You collected ${waterCollected} water!`;
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
  gameActive = true;
  gameLoop();
}
// ...existing code...