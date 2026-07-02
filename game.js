/**
 * AR Active Math Adventure - Core JavaScript Game Engine
 */

// --- Global Variables & Constants ---
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Offscreen canvas for fast motion detection
const motionCanvas = document.createElement('canvas');
motionCanvas.width = 160;
motionCanvas.height = 120;
const motionCtx = motionCanvas.getContext('2d');

// Sound synthesis context
let audioCtx = null;

// Game State variables
let gameState = 'menu'; // menu, calibrating, playing, gameover
let gameDifficulty = 'easy'; // easy, medium, hard
let score = 0;
let streak = 0;
let maxStreak = 0;
let correctCount = 0;
let timeLeft = 60;
let gameTimerInterval = null;
let sensitivity = 70; // 1-100 scale (default 70)

// Camera video dimensions once loaded
let videoWidth = 640;
let videoHeight = 480;

// Motion detection frame storage
let prevFrameData = null;

// Game entities
let bubbles = [];
let particles = [];
let motionParticles = []; // Feedback sparks for hand movement

// MediaPipe Hands tracking state
let handsDetector = null;
let handX = null;
let handY = null;
let isHandTrackingActive = false;
let isProcessingHand = false;


// Math puzzle info
let currentQuestion = {
  numA: 0,
  numB: 0,
  answer: 0,
  options: []
};

// Calibration progress
let calibrationProgress = 0; // 0 to 100
const calibrationTarget = { x: 0.5, y: 0.5, radius: 60 }; // Normalized screen coordinates (center)

// Colors palette for bubbles
const bubbleColors = [
  'rgba(255, 107, 139, 0.7)',  // Pink
  'rgba(78, 205, 196, 0.7)',   // Mint
  'rgba(255, 190, 11, 0.7)',   // Yellow
  'rgba(162, 210, 255, 0.7)',  // Soft Blue
  'rgba(255, 122, 0, 0.7)',    // Orange
  'rgba(189, 178, 255, 0.7)'   // Lavender
];

// --- Initialization & Setup ---

// Resize canvas to cover container
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Screen Navigation
function showScreen(screenId) {
  // Deactivate all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  // Activate selected
  const activeScreen = document.getElementById(screenId);
  if (activeScreen) {
    activeScreen.classList.add('active');
  }
}

// Initial Navigation Hookup
document.addEventListener('DOMContentLoaded', () => {
  // Difficulty selection clicks
  const diffButtons = document.querySelectorAll('.diff-btn');
  diffButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      diffButtons.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      gameDifficulty = target.dataset.difficulty;
      playPopSound();
    });
  });

  // Start Button click
  document.getElementById('btnStartGame').addEventListener('click', () => {
    initAudio();
    playPopSound();
    gameState = 'calibrating';
    showScreen('screenCalibration');
    startCamera();
  });

  // Calibration Slider change
  const slider = document.getElementById('sliderSensitivity');
  const valDisplay = document.getElementById('valSensitivity');
  slider.addEventListener('input', (e) => {
    sensitivity = parseInt(e.target.value);
    valDisplay.textContent = sensitivity;
  });

  // Calibration Done / Skip button
  const btnCalDone = document.getElementById('btnCalibrationDone');
  btnCalDone.addEventListener('click', () => {
    playFanfare();
    startGameplay();
  });

  // Play Again buttons
  document.getElementById('btnPlayAgain').addEventListener('click', () => {
    playPopSound();
    startGameplay();
  });

  document.getElementById('btnMainMenu').addEventListener('click', () => {
    playPopSound();
    gameState = 'menu';
    showScreen('screenMenu');
  });

  // Canvas Interactions (Mouse / Touch fallbacks)
  canvas.addEventListener('mousedown', (e) => {
    handleCanvasInteraction(e.clientX, e.clientY, false);
  });
  
  canvas.addEventListener('mousemove', (e) => {
    handleCanvasInteraction(e.clientX, e.clientY, true);
  });
  
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) {
      handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
    }
  });
  
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      handleCanvasInteraction(e.touches[0].clientX, e.touches[0].clientY, true);
    }
  });

  // MediaPipe Hands detection initialization
  if (typeof Hands !== 'undefined') {
    try {
      handsDetector = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      handsDetector.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });
      handsDetector.onResults(onHandResults);
      isHandTrackingActive = true;
      console.log('MediaPipe Hands initialized successfully.');
    } catch (e) {
      console.error('Error initializing MediaPipe Hands:', e);
      isHandTrackingActive = false;
    }
  } else {
    console.log('MediaPipe Hands not found. Using pixel differencing motion detection.');
    isHandTrackingActive = false;
  }
});


// Handle mouse/touch events on canvas as a fallback interaction
function handleCanvasInteraction(clientX, clientY, isMouseMove = false) {
  if (gameState !== 'playing' && gameState !== 'calibrating') return;
  
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  
  if (gameState === 'calibrating') {
    const cX = calibrationTarget.x * canvas.width;
    const cY = calibrationTarget.y * canvas.height;
    const dist = Math.hypot(x - cX, y - cY);
    
    if (dist <= calibrationTarget.radius) {
      if (isMouseMove) {
        // Hovering fills progress slowly
        calibrationProgress = Math.min(100, calibrationProgress + 3);
      } else {
        // Clicking fills progress instantly
        calibrationProgress = 100;
      }
      
      const btnDone = document.getElementById('btnCalibrationDone');
      const statusDiv = document.getElementById('calibrationStatus');
      
      if (calibrationProgress >= 100) {
        playCorrectSound();
        statusDiv.innerHTML = '🎉 เซ็นเซอร์พร้อมทำงานแล้ว! <br>กดปุ่มด้านล่างเพื่อเริ่มเล่นได้เลย';
      }
    }
  } else if (gameState === 'playing') {
    let hovered = false;
    
    // Check if we hit any floating bubbles
    bubbles.forEach(bubble => {
      const dist = Math.hypot(x - bubble.x, y - bubble.y);
      if (dist <= bubble.radius) {
        hovered = true;
        triggerPopEffect(bubble, bubble.isCorrect);
      }
    });
    
    // Update cursor styling dynamically
    if (isMouseMove) {
      canvas.style.cursor = hovered ? 'pointer' : 'default';
    }
  }
}

// MediaPipe Hand detection results callback
function onHandResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const hand = results.multiHandLandmarks[0];
    
    // Landmark 8 is the index finger tip, which acts as the cursor.
    const point = hand[8];
    
    // Map to canvas mirrored coordinates
    const targetX = (1 - point.x) * canvas.width;
    const targetY = point.y * canvas.height;
    
    // Apply LERP (Linear Interpolation) to smooth coordinate updates
    if (handX === null || handY === null) {
      handX = targetX;
      handY = targetY;
    } else {
      handX = handX * 0.5 + targetX * 0.5;
      handY = handY * 0.5 + targetY * 0.5;
    }
    
    // Add visual sparkles at finger tip coordinates during play
    if (gameState === 'playing' && Math.random() < 0.25) {
      motionParticles.push(new MotionFeedbackParticle(handX, handY));
    }
  } else {
    // Reset if hand goes off camera view
    handX = null;
    handY = null;
  }
}

// Check hand positioning during calibration
function evaluateHandCalibration() {
  if (handX === null || handY === null) {
    // Decays slowly when no hand detected
    calibrationProgress = Math.max(0, calibrationProgress - 0.4);
    return;
  }
  
  const cX = calibrationTarget.x * canvas.width;
  const cY = calibrationTarget.y * canvas.height;
  const dist = Math.hypot(handX - cX, handY - cY);
  
  if (dist <= calibrationTarget.radius) {
    calibrationProgress = Math.min(100, calibrationProgress + 1.8);
  } else {
    calibrationProgress = Math.max(0, calibrationProgress - 0.4);
  }
  
  const btnDone = document.getElementById('btnCalibrationDone');
  const statusDiv = document.getElementById('calibrationStatus');
  
  if (calibrationProgress >= 100) {
    if (btnDone.disabled) {
      btnDone.disabled = false;
      playCorrectSound();
      statusDiv.innerHTML = '🎉 เซ็นเซอร์พร้อมทำงานแล้ว! <br>กดปุ่มด้านล่างเพื่อเริ่มเล่นได้เลย';
    }
  }
}

// Check hand interaction with bubbles in gameplay
function evaluateHandGameplay() {
  if (handX === null || handY === null) return;
  
  bubbles.forEach(bubble => {
    if (bubble.y < 0 || bubble.y > canvas.height) return;
    
    const dist = Math.hypot(handX - bubble.x, handY - bubble.y);
    if (dist <= bubble.radius) {
      triggerPopEffect(bubble, bubble.isCorrect);
    }
  });
}

// Start Web Camera Feed
async function startCamera() {
  const statusDiv = document.getElementById('calibrationStatus');
  statusDiv.textContent = '🎥 กำลังเข้าถึงกล้องเว็บแคม...';
  
  if (window.gameLoopRunning) return;
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('Webcam not supported or insecure HTTP context');
    statusDiv.innerHTML = '⚠️ เบราว์เซอร์หรือการเชื่อมต่อไม่รองรับกล้อง <br>คุณสามารถกดปุ่ม "ข้ามขั้นตอน / เริ่มเล่นเลย" ด้านล่าง <br>เพื่อเล่นเกมและใช้เมาส์/ทัชสกรีนควบคุมแทนได้ครับ!';
    
    window.gameLoopRunning = true;
    requestAnimationFrame(gameLoop);
    return;
  }
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user' // Selfie camera preferred
      },
      audio: false
    });
    
    webcam.srcObject = stream;
    
    // Listen for metadata to loaded to get size
    webcam.onloadedmetadata = () => {
      videoWidth = webcam.videoWidth;
      videoHeight = webcam.videoHeight;
      statusDiv.innerHTML = '✨ กล้องเชื่อมต่อสำเร็จ! <br>กรุณาโบกมือในวงกลมเพื่อปรับจูน หรือกดปุ่มด้านล่างเพื่อข้าม';
      
      window.gameLoopRunning = true;
      requestAnimationFrame(gameLoop);
    };
  } catch (err) {
    console.error('Camera Access Error: ', err);
    statusDiv.innerHTML = '⚠️ ไม่สามารถเปิดกล้องได้ (หรือปฏิเสธสิทธิ์เข้าถึง) <br>คุณสามารถกดปุ่ม "ข้ามขั้นตอน / เริ่มเล่นเลย" ด้านล่าง <br>เพื่อเล่นเกมและใช้เมาส์/ทัชสกรีนควบคุมแทนได้ครับ!';
    
    window.gameLoopRunning = true;
    requestAnimationFrame(gameLoop);
  }
}

// --- Audio Synthesizer (Web Audio API) ---

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Helper to play a clean synth note
function playNote(freq, startTime, duration) {
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startTime);
  
  // Custom envelope to sound warm and cute
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playPopSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(250, now);
  osc.frequency.exponentialRampToValueAtTime(1000, now + 0.07);
  
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.linearRampToValueAtTime(0.001, now + 0.07);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(now);
  osc.stop(now + 0.07);
}

function playCorrectSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  
  // Bright arpeggio chime
  playNote(523.25, now, 0.12);        // C5
  playNote(659.25, now + 0.08, 0.12); // E5
  playNote(783.99, now + 0.16, 0.12); // G5
  playNote(1046.50, now + 0.24, 0.3); // C6
}

function playWrongSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.linearRampToValueAtTime(90, now + 0.25);
  
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(now);
  osc.stop(now + 0.25);
}

function playFanfare() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  
  playNote(392.00, now, 0.1);         // G4
  playNote(392.00, now + 0.1, 0.1);   // G4
  playNote(392.00, now + 0.2, 0.1);   // G4
  playNote(523.25, now + 0.3, 0.4);   // C5
}

// --- Gameplay Mechanics ---

function startGameplay() {
  gameState = 'playing';
  score = 0;
  streak = 0;
  maxStreak = 0;
  correctCount = 0;
  timeLeft = 60;
  
  // Update HUD labels
  document.getElementById('hudScore').textContent = '0';
  document.getElementById('hudStreak').textContent = '0';
  document.getElementById('hudTimer').textContent = '60s';
  document.getElementById('streakNotification').classList.remove('show');
  
  bubbles = [];
  particles = [];
  motionParticles = [];
  
  generateQuestion();
  showScreen('screenHUD');
  
  // Audio indicator for mobile browsers requiring click/interaction
  const audioWarn = document.getElementById('audioWarning');
  audioWarn.style.display = 'block';
  setTimeout(() => {
    audioWarn.style.display = 'none';
  }, 2000);
  
  // Start countdown timer
  if (gameTimerInterval) clearInterval(gameTimerInterval);
  gameTimerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById('hudTimer').textContent = timeLeft + 's';
    
    // Warning sound when time is short
    if (timeLeft <= 5 && timeLeft > 0) {
      playNote(440, audioCtx.currentTime, 0.05);
    }
    
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function generateQuestion() {
  let range = 10;
  if (gameDifficulty === 'medium') range = 20;
  if (gameDifficulty === 'hard') range = 50;
  
  // Ensure we don't end up with 0 + X for toddler-friendly vibes
  const minVal = 1;
  const maxVal = range - 1;
  
  const sum = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
  const numA = Math.floor(Math.random() * (sum - 1)) + 1;
  const numB = sum - numA;
  const answer = sum;
  
  // Generate incorrect options
  let opt1 = answer;
  let opt2 = answer;
  
  // Try to generate unique alternatives close to the answer
  while (opt1 === answer || opt1 <= 0) {
    const delta = Math.floor(Math.random() * 7) - 3; // -3 to +3
    opt1 = answer + (delta === 0 ? 1 : delta);
  }
  while (opt2 === answer || opt2 === opt1 || opt2 <= 0) {
    const delta = Math.floor(Math.random() * 7) - 3;
    opt2 = answer + (delta === 0 ? -1 : delta);
  }
  
  // Shuffle option values
  const options = [answer, opt1, opt2].sort(() => Math.random() - 0.5);
  
  currentQuestion = { numA, numB, answer, options };
  
  // Update HTML elements
  document.getElementById('numA').textContent = numA;
  document.getElementById('numB').textContent = numB;
  
  // Clear old bubbles and spawn new ones
  spawnAnswerBubbles(options);
}

function spawnAnswerBubbles(options) {
  bubbles = [];
  
  // Determine spawning speed based on difficulty
  let baseSpeed = 1.2;
  if (gameDifficulty === 'medium') baseSpeed = 1.8;
  if (gameDifficulty === 'hard') baseSpeed = 2.4;
  
  // Divide screen width into 3 columns for equal distribution
  const colWidth = canvas.width / 3;
  
  options.forEach((val, idx) => {
    const x = colWidth * idx + colWidth / 2 + (Math.random() * 40 - 20);
    // Start slightly below the canvas view
    const y = canvas.height + 60 + (Math.random() * 30);
    
    // Bubble float physics: subtle horizontal sway
    const vx = Math.random() * 0.6 - 0.3;
    const vy = -(baseSpeed + Math.random() * 0.5);
    
    const isCorrect = (val === currentQuestion.answer);
    
    // Pick unique color
    const color = bubbleColors[idx % bubbleColors.length];
    
    bubbles.push(new Bubble(val, isCorrect, x, y, 55, vx, vy, color));
  });
}

function triggerPopEffect(bubble, correct) {
  playPopSound();
  
  // Create beautiful debris particles
  for (let i = 0; i < 20; i++) {
    particles.push(new Particle(
      bubble.x, 
      bubble.y, 
      bubble.color,
      Math.random() * 8 + 2
    ));
  }
  
  if (correct) {
    playCorrectSound();
    score += 10 + (streak * 2);
    streak++;
    correctCount++;
    if (streak > maxStreak) maxStreak = streak;
    
    // Show streak alert
    const streakNotice = document.getElementById('streakNotification');
    if (streak >= 3) {
      streakNotice.textContent = `คอมโบสตรีค x${streak}! 🔥`;
      streakNotice.classList.add('show');
    }
    
    document.getElementById('hudScore').textContent = score;
    document.getElementById('hudStreak').textContent = streak;
    
    // Small timeout before next question so the kid can see the popping particle effect
    bubbles = []; // Clear other bubbles instantly so they don't pop them by mistake
    setTimeout(() => {
      streakNotice.classList.remove('show');
      generateQuestion();
    }, 700);
  } else {
    playWrongSound();
    streak = 0;
    document.getElementById('hudStreak').textContent = '0';
    document.getElementById('streakNotification').classList.remove('show');
    
    // Flash screen red temporarily
    canvas.classList.add('flash-wrong');
    setTimeout(() => canvas.classList.remove('flash-wrong'), 300);
    
    // Regenerate to keep game active and moving
    bubbles = [];
    setTimeout(() => {
      generateQuestion();
    }, 700);
  }
}

function endGame() {
  gameState = 'gameover';
  if (gameTimerInterval) clearInterval(gameTimerInterval);
  
  // Check High Scores in local storage
  const hsKey = `ar_math_highscore_${gameDifficulty}`;
  let oldHighScore = localStorage.getItem(hsKey);
  if (!oldHighScore) oldHighScore = 0;
  else oldHighScore = parseInt(oldHighScore);
  
  if (score > oldHighScore) {
    localStorage.setItem(hsKey, score);
    document.getElementById('resultHighScore').textContent = score + ' (คะแนนใหม่! 🎉)';
  } else {
    document.getElementById('resultHighScore').textContent = oldHighScore;
  }
  
  // Render results
  document.getElementById('resultScore').textContent = score;
  document.getElementById('resultCorrect').textContent = correctCount + ' ข้อ';
  document.getElementById('resultMaxStreak').textContent = maxStreak;
  
  // Star calculations (max 3 stars)
  let stars = 1;
  const starElements = document.querySelectorAll('.star-rating');
  starElements.forEach(el => el.classList.remove('active'));
  
  // Easy threshold: 50+, 100+
  // Medium threshold: 60+, 120+
  // Hard threshold: 40+, 80+
  let thresh2 = 70;
  let thresh3 = 130;
  if (gameDifficulty === 'medium') { thresh2 = 90; thresh3 = 160; }
  if (gameDifficulty === 'hard') { thresh2 = 60; thresh3 = 110; }
  
  if (score >= thresh3) stars = 3;
  else if (score >= thresh2) stars = 2;
  
  for (let i = 0; i < stars; i++) {
    setTimeout(() => {
      starElements[i].classList.add('active');
      playNote(440 + i * 110, audioCtx.currentTime, 0.15);
    }, 300 + (i * 250));
  }
  
  playFanfare();
  showScreen('screenGameOver');
}

// --- Entities Classes ---

class Bubble {
  constructor(value, isCorrect, x, y, radius, vx, vy, color) {
    this.value = value;
    this.isCorrect = isCorrect;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    
    // Physics & Animations
    this.pulseTime = Math.random() * Math.PI * 2;
    this.swaySpeed = 0.02 + Math.random() * 0.02;
    this.swayAmount = 0.5 + Math.random() * 0.5;
  }
  
  update() {
    // Float upwards
    this.y += this.vy;
    
    // Horizontal sway
    this.pulseTime += this.swaySpeed;
    this.x += Math.sin(this.pulseTime) * this.swayAmount;
    
    // Wall collisions (bounce)
    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx = -this.vx;
    }
    if (this.x + this.radius > canvas.width) {
      this.x = canvas.width - this.radius;
      this.vx = -this.vx;
    }
    
    // If it floats off the top, wrap/regenerate
    if (this.y + this.radius < -10) {
      this.y = canvas.height + this.radius + 20;
      this.x = Math.random() * (canvas.width - this.radius * 2) + this.radius;
    }
  }
  
  draw() {
    ctx.save();
    
    // Soft outer bubble glow
    const shadowGrad = ctx.createRadialGradient(this.x, this.y, this.radius * 0.8, this.x, this.y, this.radius);
    shadowGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
    shadowGrad.addColorStop(1, this.color.replace('0.7', '0.25'));
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw bubble sphere gradient
    const grad = ctx.createRadialGradient(
      this.x - this.radius * 0.3, 
      this.y - this.radius * 0.3, 
      this.radius * 0.1, 
      this.x, 
      this.y, 
      this.radius
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.3, this.color);
    grad.addColorStop(0.9, this.color.replace('0.7', '0.85'));
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Glass highlight reflection reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(
      this.x - this.radius * 0.35, 
      this.y - this.radius * 0.35, 
      this.radius * 0.25, 
      this.radius * 0.15, 
      -Math.PI / 4, 
      0, 
      Math.PI * 2
    );
    ctx.fill();
    
    // Text drawing (centered)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 4;
    ctx.font = `bold ${this.radius * 0.75}px ${varStyleValue('--font-hud')}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Apply drop shadow effect via stroke + fill
    ctx.strokeText(this.value, this.x, this.y);
    ctx.fillText(this.value, this.x, this.y);
    
    ctx.restore();
  }
}

// Sparkle Particle after bubble pops
class Particle {
  constructor(x, y, color, size) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size;
    
    // Random direction explosion
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 6 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    this.alpha = 1.0;
    this.decay = 0.02 + Math.random() * 0.03;
    this.gravity = 0.12;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.alpha -= this.decay;
  }
  
  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Feedback visual spark on motion tracking
class MotionFeedbackParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = Math.random() * 2 - 1;
    this.vy = Math.random() * 2 - 1;
    this.alpha = 0.8;
    this.size = Math.random() * 4 + 2;
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= 0.04;
  }
  
  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    // Glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f5d4';
    ctx.fillStyle = '#00f5d4';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Fetch computed custom property value from stylesheet
function varStyleValue(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// --- Motion Detection Logic ---

function processMotionDetection() {
  if (!webcam.videoWidth) {
    // Clear canvas with a nice sky/space gradient when camera is inactive
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  
  // Calculate crop details for centering video (CSS cover style)
  const screenRatio = canvas.width / canvas.height;
  const videoRatio = videoWidth / videoHeight;
  let sx, sy, sWidth, sHeight;
  
  if (screenRatio > videoRatio) {
    sWidth = videoWidth;
    sHeight = videoWidth / screenRatio;
    sx = 0;
    sy = (videoHeight - sHeight) / 2;
  } else {
    sWidth = videoHeight * screenRatio;
    sHeight = videoHeight;
    sx = (videoWidth - sWidth) / 2;
    sy = 0;
  }
  
  // Draw mirrored video onto the main rendering Canvas
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  // Add a slight brightness boost filter for poor-light rooms
  ctx.filter = "brightness(1.08) contrast(1.02)";
  ctx.drawImage(webcam, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  
  // Send frame to MediaPipe Hands if active, bypassing legacy pixel calculations
  if (isHandTrackingActive && handsDetector && webcam.readyState >= 2) {
    if (!isProcessingHand) {
      isProcessingHand = true;
      handsDetector.send({ image: webcam })
        .then(() => {
          isProcessingHand = false;
        })
        .catch(e => {
          console.error("MediaPipe Hands send error:", e);
          isProcessingHand = false;
        });
    }
    return;
  }
  
  // Legacy pixel differencing motion detection
  // Draw mirrored video onto the hidden motionCanvas
  motionCtx.save();
  motionCtx.translate(motionCanvas.width, 0);
  motionCtx.scale(-1, 1);
  motionCtx.drawImage(webcam, sx, sy, sWidth, sHeight, 0, 0, motionCanvas.width, motionCanvas.height);
  motionCtx.restore();
  
  // Get image pixel data from motion canvas
  const currFrame = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
  const currData = currFrame.data;
  
  // Store pixel coordinate scale mappings
  const scaleX = canvas.width / motionCanvas.width;
  const scaleY = canvas.height / motionCanvas.height;
  
  // Grid tracking matrix to evaluate region motion speeds
  const motionGrid = new Uint8Array(motionCanvas.width * motionCanvas.height);
  
  if (prevFrameData) {
    // Dynamic Pixel Difference Algorithm
    // Adjust threshold based on sensitivity slider
    // High sensitivity = lower numerical threshold
    const diffThreshold = Math.max(12, 45 - (sensitivity * 0.35)); 
    
    // Compare current frame vs previous frame
    for (let y = 0; y < motionCanvas.height; y++) {
      for (let x = 0; x < motionCanvas.width; x++) {
        const idx = (y * motionCanvas.width + x) * 4;
        
        const rDiff = Math.abs(currData[idx] - prevFrameData[idx]);
        const gDiff = Math.abs(currData[idx+1] - prevFrameData[idx+1]);
        const bDiff = Math.abs(currData[idx+2] - prevFrameData[idx+2]);
        const avgDiff = (rDiff + gDiff + bDiff) / 3;
        
        if (avgDiff > diffThreshold) {
          motionGrid[y * motionCanvas.width + x] = 1;
          
          // Draw motion sparks overlay in gameplay with 8% probability (performance control)
          if (gameState === 'playing' && Math.random() < 0.08) {
            // Map small-canvas pixel coordinate back to actual canvas size
            const pixelX = x * scaleX;
            const pixelY = y * scaleY;
            motionParticles.push(new MotionFeedbackParticle(pixelX, pixelY));
          }
        }
      }
    }
    
    // Evaluate motion on active states
    if (gameState === 'calibrating') {
      evaluateCalibrationMotion(motionGrid);
    } else if (gameState === 'playing') {
      evaluateGameplayMotion(motionGrid, scaleX, scaleY);
    }
  }
  
  // Store current frame for next comparison
  prevFrameData = currData;
}

// Calibrate detector motion check
function evaluateCalibrationMotion(motionGrid) {
  // Target position on motion canvas
  const targetX = Math.floor(calibrationTarget.x * motionCanvas.width);
  const targetY = Math.floor(calibrationTarget.y * motionCanvas.height);
  const targetRadius = Math.floor(calibrationTarget.radius * (motionCanvas.height / canvas.height));
  
  let motionPixels = 0;
  let totalPixels = 0;
  
  // Loop pixels inside bounding box of circular target area
  for (let y = targetY - targetRadius; y <= targetY + targetRadius; y++) {
    if (y < 0 || y >= motionCanvas.height) continue;
    
    for (let x = targetX - targetRadius; x <= targetX + targetRadius; x++) {
      if (x < 0 || x >= motionCanvas.width) continue;
      
      // Calculate distance to verify inside circle boundary
      const dist = Math.hypot(x - targetX, y - targetY);
      if (dist <= targetRadius) {
        totalPixels++;
        if (motionGrid[y * motionCanvas.width + x] === 1) {
          motionPixels++;
        }
      }
    }
  }
  
  // Calculate relative activity percentage
  const activityRatio = motionPixels / (totalPixels || 1);
  
  // Fill calibration rate based on activity ratio
  if (activityRatio > 0.06) {
    calibrationProgress = Math.min(100, calibrationProgress + 1.5);
  } else {
    // Decays slowly when no active movements
    calibrationProgress = Math.max(0, calibrationProgress - 0.4);
  }
  
  // Unlock button when calibration full
  const btnDone = document.getElementById('btnCalibrationDone');
  const statusDiv = document.getElementById('calibrationStatus');
  
  if (calibrationProgress >= 100) {
    if (btnDone.disabled) {
      btnDone.disabled = false;
      playCorrectSound();
      statusDiv.innerHTML = '🎉 เซ็นเซอร์พร้อมทำงานแล้ว! <br>กดปุ่มด้านล่างเพื่อเริ่มเล่นได้เลย';
    }
  }
}

// Bubble popping detection logic
function evaluateGameplayMotion(motionGrid, scaleX, scaleY) {
  bubbles.forEach(bubble => {
    // Skip checking if bubble is floating offscreen
    if (bubble.y < 0 || bubble.y > canvas.height) return;
    
    // Map bubble properties to motion canvas coordinates
    const bX = Math.floor(bubble.x / scaleX);
    const bY = Math.floor(bubble.y / scaleY);
    const bRadius = Math.floor(bubble.radius / Math.max(scaleX, scaleY));
    
    let motionCount = 0;
    let totalRegionPixels = 0;
    
    // Check bounding circle region
    for (let y = bY - bRadius; y <= bY + bRadius; y++) {
      if (y < 0 || y >= motionCanvas.height) continue;
      
      for (let x = bX - bRadius; x <= bX + bRadius; x++) {
        if (x < 0 || x >= motionCanvas.width) continue;
        
        const dist = Math.hypot(x - bX, y - bY);
        if (dist <= bRadius) {
          totalRegionPixels++;
          if (motionGrid[y * motionCanvas.width + x] === 1) {
            motionCount++;
          }
        }
      }
    }
    
    // Compute motion density ratio inside the bubble
    const motionDensity = motionCount / (totalRegionPixels || 1);
    
    // Trigger activation pop threshold (tuned with sensitivity slider)
    // Scale slider (10 to 100) -> Higher sensitivity requires LOWER motion density to pop
    const triggerDensity = Math.max(0.02, 0.15 - (sensitivity * 0.0013));
    
    if (motionDensity > triggerDensity) {
      triggerPopEffect(bubble, bubble.isCorrect);
    }
  });
}

// --- Drawing Helpers ---

function drawCalibrationUI() {
  const cX = calibrationTarget.x * canvas.width;
  const cY = calibrationTarget.y * canvas.height;
  const cRadius = calibrationTarget.radius;
  
  // Pulse animation for target outline
  const pulseScale = 1 + Math.sin(Date.now() * 0.005) * 0.05;
  const animRadius = cRadius * pulseScale;
  
  // Draw outer calibration dash target
  ctx.save();
  ctx.strokeStyle = '#ffbe0b';
  ctx.lineWidth = 5;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.arc(cX, cY, animRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  
  // Progress Ring overlay fill
  ctx.save();
  ctx.strokeStyle = '#00f5d4';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Start drawing at top (-Math.PI / 2)
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2) * (calibrationProgress / 100);
  ctx.arc(cX, cY, cRadius - 10, startAngle, endAngle);
  ctx.stroke();
  ctx.restore();
  
  // Inner core glow circle
  ctx.save();
  ctx.fillStyle = calibrationProgress >= 100 ? 'rgba(0, 245, 212, 0.3)' : 'rgba(255, 190, 11, 0.15)';
  ctx.beginPath();
  ctx.arc(cX, cY, cRadius - 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  // Interactive Helper Label text
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  ctx.font = `bold 1.1rem ${varStyleValue('--font-kids')}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  if (calibrationProgress < 100) {
    ctx.fillText('โบกมือตรงนี้! 🖐️', cX, cY);
    ctx.font = `0.85rem ${varStyleValue('--font-kids')}`;
    ctx.fillStyle = '#ffbe0b';
    ctx.fillText(`${Math.floor(calibrationProgress)}%`, cX, cY + 22);
  } else {
    ctx.fillStyle = '#00f5d4';
    ctx.fillText('พร้อมแล้ว! ✅', cX, cY);
  }
  ctx.restore();
}

// --- Main Game Loop ---

function gameLoop() {
  // 1. Process webcam inputs and calculate motion maps (and trigger MediaPipe frame processing if active)
  processMotionDetection();
  
  // Evaluate hand tracking positions if available
  if (isHandTrackingActive) {
    if (gameState === 'calibrating') {
      evaluateHandCalibration();
    } else if (gameState === 'playing') {
      evaluateHandGameplay();
    }
  }
  
  // 2. Render State specific scenes
  if (gameState === 'calibrating') {
    drawCalibrationUI();
    
    // Draw target marker for hand tracking in calibration
    if (isHandTrackingActive && handX !== null && handY !== null) {
      ctx.save();
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(handX, handY, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#00f5d4';
      ctx.beginPath();
      ctx.arc(handX, handY, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.font = '1.8rem sans-serif';
      ctx.fillText('🖐️', handX + 15, handY + 15);
      ctx.restore();
    }
  }
  
  if (gameState === 'playing') {
    // Update and draw floating answer bubbles
    bubbles.forEach(bubble => {
      bubble.update();
      bubble.draw();
    });
    
    // Update and draw explosion particles
    particles.forEach((p, idx) => {
      p.update();
      p.draw();
      if (p.alpha <= 0) particles.splice(idx, 1);
    });
    
    // Update and draw motion sparks particles
    motionParticles.forEach((p, idx) => {
      p.update();
      p.draw();
      if (p.alpha <= 0) motionParticles.splice(idx, 1);
    });
    
    // Draw Hand Cursor if tracked
    if (isHandTrackingActive && handX !== null && handY !== null) {
      ctx.save();
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(handX, handY, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#00f5d4';
      ctx.beginPath();
      ctx.arc(handX, handY, 5, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.font = '2rem sans-serif';
      ctx.fillText('🖐️', handX + 15, handY + 15);
      ctx.restore();
    }
  }
  
  // Loop continuously at screen frame rate
  requestAnimationFrame(gameLoop);
}
