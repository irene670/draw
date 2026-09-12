import {
  TOTAL_ATTEMPTS,
  TARGET_SECONDS,
  bestAttempt,
  elapsedToCentiseconds,
  formatCentiseconds,
  judgeAttempt,
  resultMessage,
} from "./game-core.js?v=20260817-6";
import { createSoundEngine } from "./sound-engine.js?v=20260817-2";

const effectsPreference = new URLSearchParams(window.location.search).get("effects");
const isLgOrSmartTv = /Web0S|webOS|NetCast|SmartTV|SMART-TV|LG Browser/i.test(navigator.userAgent);
const isLargeTouchscreen = window.matchMedia("(pointer: coarse)").matches
  && Math.max(window.innerWidth, window.innerHeight) >= 800;
const hasLimitedHardware = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const useLiteEffects = effectsPreference === "lite"
  || (effectsPreference !== "full" && (isLgOrSmartTv || (isLargeTouchscreen && hasLimitedHardware)));

document.documentElement.dataset.effects = useLiteEffects ? "lite" : "full";

const elements = {
  shell: document.querySelector("#gameShell"),
  roundLabel: document.querySelector("#roundLabel"),
  timerWrap: document.querySelector("#timerWrap"),
  timerValue: document.querySelector("#timerValue"),
  timerGlowValue: document.querySelector("#timerGlowValue"),
  headline: document.querySelector("#headline"),
  instruction: document.querySelector("#instruction"),
  attemptDots: document.querySelector("#attemptDots"),
  attemptResults: document.querySelector("#attemptResults"),
  gameButton: document.querySelector("#gameButton"),
  gameButtonLabel: document.querySelector("#gameButtonLabel"),
  gameButtonHint: document.querySelector("#gameButtonHint"),
  energyBarFill: document.querySelector("#energyBarFill"),
  energyLabel: document.querySelector("#energyLabel"),
  resultCard: document.querySelector("#resultCard"),
  resultKicker: document.querySelector("#resultKicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  soundButton: document.querySelector("#soundButton"),
  simulateWinButton: document.querySelector("#simulateWinButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  liveStatus: document.querySelector("#liveStatus"),
  leafBurst: document.querySelector("#leafBurst"),
};

const sounds = createSoundEngine({ lite: useLiteEffects });

const acceptedKeys = new Set(["Space", "Enter", "NumpadEnter", "Numpad0"]);

const game = {
  phase: "idle",
  attempts: [],
  startedAt: 0,
  displayedCentiseconds: 0,
  animationFrame: 0,
  pointerId: null,
  keyboardActive: false,
  revealToken: 0,
  lastTimerPaintAt: 0,
  lastVisualPaintAt: 0,
  energyStage: "",
};

function setPhase(phase, seedState = phase === "charging" ? "charging" : "idle") {
  game.phase = phase;
  elements.shell.dataset.phase = phase;
  elements.shell.dataset.seedState = seedState;
}

function setCharge(value) {
  const charge = Math.max(0, Math.min(1, value));
  elements.shell.style.setProperty("--charge", charge.toFixed(3));
  const activeEnergy = game.phase === "charging" ? charge / TOTAL_ATTEMPTS : 0;
  const forestEnergy = Math.min(1, (game.attempts.length / TOTAL_ATTEMPTS) + activeEnergy);
  elements.shell.style.setProperty("--forest-energy", forestEnergy.toFixed(3));
  elements.shell.style.setProperty("--energy-progress", forestEnergy.toFixed(3));
}

function setTimer(centiseconds, { announce = true } = {}) {
  game.displayedCentiseconds = centiseconds;
  const value = formatCentiseconds(centiseconds);
  if (elements.timerValue.textContent !== value) elements.timerValue.textContent = value;
  if (!useLiteEffects && elements.timerGlowValue.textContent !== value) elements.timerGlowValue.textContent = value;
  if (announce) elements.timerWrap.setAttribute("aria-label", `目前時間 ${value} 秒`);
}

function setEnergyLabel(message, stage) {
  if (game.energyStage === stage) return;
  game.energyStage = stage;
  elements.energyLabel.textContent = message;
}

function announce(message) {
  elements.liveStatus.textContent = "";
  window.setTimeout(() => {
    elements.liveStatus.textContent = message;
  }, 30);
}

function setButton(label, hint, ariaLabel, { disabled = false } = {}) {
  elements.gameButtonLabel.textContent = label;
  elements.gameButtonHint.textContent = hint;
  elements.gameButton.setAttribute("aria-label", ariaLabel);
  elements.gameButton.disabled = disabled;
}

function updateAttemptUI() {
  elements.attemptDots.replaceChildren();
  for (let index = 0; index < TOTAL_ATTEMPTS; index += 1) {
    const dot = document.createElement("span");
    const attempt = game.attempts[index];
    dot.className = "attempt-dot";
    if (attempt) dot.classList.add(attempt.isWinner ? "is-winner" : "is-used");
    dot.textContent = String(index + 1);
    dot.setAttribute("aria-hidden", "true");
    elements.attemptDots.append(dot);
  }

  const remaining = TOTAL_ATTEMPTS - game.attempts.length;
  elements.attemptDots.setAttribute("aria-label", `剩餘 ${remaining} 次機會`);
  elements.shell.dataset.energy = String(Math.min(TOTAL_ATTEMPTS, game.attempts.length));

  elements.attemptResults.replaceChildren();
  game.attempts.forEach((attempt, index) => {
    const pill = document.createElement("span");
    pill.className = `result-pill${attempt.isWinner ? " is-winner" : ""}`;
    pill.textContent = `${index + 1}｜${formatCentiseconds(attempt.centiseconds)}`;
    elements.attemptResults.append(pill);
  });
}

function showResultCard(kicker, title, body) {
  elements.resultKicker.textContent = kicker;
  elements.resultTitle.textContent = title;
  elements.resultBody.textContent = body;
  elements.resultCard.setAttribute("aria-hidden", "false");
}

function hideResultCard() {
  elements.resultCard.setAttribute("aria-hidden", "true");
}

function tick(now = performance.now()) {
  if (game.phase !== "charging") return;
  const elapsed = Math.max(0, now - game.startedAt);
  const centiseconds = elapsedToCentiseconds(elapsed);
  const charge = Math.min(1, elapsed / 7300);
  const nearTarget = elapsed >= 6500 && elapsed <= 7800;
  const timerInterval = useLiteEffects && !nearTarget ? 50 : 0;
  if (!timerInterval || now - game.lastTimerPaintAt >= timerInterval) {
    setTimer(centiseconds, { announce: false });
    game.lastTimerPaintAt = now;
  }
  if (!useLiteEffects || now - game.lastVisualPaintAt >= 100) {
    setCharge(charge);
    game.lastVisualPaintAt = now;
  }

  if (centiseconds < 500) {
    setEnergyLabel("惜山林能量正在流進種子", "flowing");
  } else if (centiseconds < 700) {
    setEnergyLabel("離 7.30 越來越近了", "brightening");
  } else if (centiseconds <= 735) {
    setEnergyLabel("7.30 惜山林，準備放開", "target");
  } else {
    setEnergyLabel("已經超過 7.30，現在放開看看結果", "full");
  }

  game.animationFrame = window.requestAnimationFrame(tick);
}

function beginHold({ pointerId = null, keyboard = false } = {}) {
  if (!["idle", "result"].includes(game.phase) || game.attempts.length >= TOTAL_ATTEMPTS) return;
  hideResultCard();
  game.pointerId = pointerId;
  game.keyboardActive = keyboard;
  sounds.startCharge();
  game.startedAt = performance.now();
  game.lastTimerPaintAt = 0;
  game.lastVisualPaintAt = 0;
  game.energyStage = "";
  setPhase("charging", "charging");
  setCharge(0);
  setTimer(0, { announce: false });
  elements.roundLabel.textContent = `第 ${game.attempts.length + 1} 次惜山林挑戰`;
  elements.headline.innerHTML = "為森林蓄能<br />朝 7.30 前進";
  elements.instruction.textContent = `看到 ${TARGET_SECONDS} 就放開，惜山林，剛剛好`;
  setButton("惜山林蓄能中", `${TARGET_SECONDS} 秒時放開`, `正在進行惜山林挑戰，${TARGET_SECONDS} 秒時放開`);
  announce(`第 ${game.attempts.length + 1} 次惜山林挑戰開始，${TARGET_SECONDS} 秒時放開`);
  game.animationFrame = window.requestAnimationFrame(tick);
}

async function finishHold() {
  if (game.phase !== "charging") return;
  game.phase = "stopping";
  window.cancelAnimationFrame(game.animationFrame);
  const result = judgeAttempt(game.displayedCentiseconds);
  elements.shell.dataset.lockedValue = formatCentiseconds(result.centiseconds);
  game.attempts.push(result);
  game.pointerId = null;
  game.keyboardActive = false;
  setCharge(1);
  updateAttemptUI();
  setPhase("revealing", "opening");
  setButton("時間已鎖定", "森林正在回應", "時間已鎖定，森林正在回應", { disabled: true });
  elements.energyLabel.textContent = "你的惜山林能量正在送進森林";
  sounds.release();
  launchLeaves(result.isWinner ? (useLiteEffects ? 22 : 42) : (useLiteEffects ? 5 : 9));
  if (navigator.vibrate) navigator.vibrate(result.isWinner ? [50, 30, 90] : 35);

  const token = ++game.revealToken;
  await new Promise((resolve) => window.setTimeout(resolve, useLiteEffects ? 520 : 760));
  if (token !== game.revealToken) return;
  result.isWinner ? showVictory(result) : showMiss(result);
}

function showMiss(result) {
  const finished = game.attempts.length >= TOTAL_ATTEMPTS;
  const difference = formatCentiseconds(result.distance);
  setPhase(finished ? "finished" : "result", "idle");
  setCharge(0);
  sounds.miss(result.direction);

  elements.roundLabel.textContent = finished ? "三次惜山林挑戰完成" : `第 ${game.attempts.length} 次惜山林心意已留下`;
  elements.headline.innerHTML = finished ? "謝謝你<br />為山林停下這幾秒" : "沒停在 7.30<br />心意一樣留在森林";
  elements.instruction.textContent = finished
    ? "謝謝你，願意為山林停下這幾秒"
    : `還有 ${TOTAL_ATTEMPTS - game.attempts.length} 次機會，再試一次 7.30`;

  if (finished) {
    const best = bestAttempt(game.attempts);
    showResultCard(
      "三次惜山林挑戰完成",
      `最接近 7.30：${formatCentiseconds(best.centiseconds)} 秒`,
      "雖然沒有停在 7.30，謝謝你願意為山林停下這幾秒。",
    );
    setButton("下一位玩家", "點一下重新開始", "迎接下一位玩家並重新開始");
    elements.energyLabel.textContent = "森林收到了你的惜山林心意";
    announce(`三次惜山林挑戰完成，最接近 7.30 的成績是 ${formatCentiseconds(best.centiseconds)} 秒`);
  } else {
    showResultCard(
      result.direction === "early" ? "早了一點" : "晚了一點",
      result.direction === "early" ? `離 7.30 還差 ${difference} 秒` : `超過 7.30 ${difference} 秒`,
      "這次沒停在 7.30，惜山林的心意一樣算數。",
    );
    setButton("按住再試一次", `還有 ${TOTAL_ATTEMPTS - game.attempts.length} 次`, "按住森林種子開始下一次計時，放開停止");
    elements.energyLabel.textContent = `已留下 ${game.attempts.length} 份惜山林心意`;
    announce(`${resultMessage(result)}，惜山林心意已留下，還有 ${TOTAL_ATTEMPTS - game.attempts.length} 次機會`);
  }
}

function showVictory(result, { preview = false } = {}) {
  setPhase("winner", "tree");
  elements.shell.dataset.energy = String(TOTAL_ATTEMPTS);
  elements.shell.style.setProperty("--charge", "1");
  elements.shell.style.setProperty("--forest-energy", "1");
  elements.shell.style.setProperty("--energy-progress", "1");
  elements.roundLabel.textContent = preview ? "中獎畫面預覽" : "7.30 命中・惜山林成功";
  elements.headline.innerHTML = "剛剛好 7.30<br />一起惜山林！";
  elements.instruction.textContent = preview ? "這是工作人員的成功畫面預覽" : "請向工作人員出示這個畫面領獎";
  showResultCard(
    preview ? "成功畫面預覽" : `${TARGET_SECONDS} 惜山林`,
    preview ? "MORI 歡呼登場" : "恭喜成為山林守護者",
    `你把時間停在 ${TARGET_SECONDS}，也把惜山林的心意送進森林。`,
  );
  setButton("下一位玩家", "點一下重新開始", "迎接下一位玩家並重新開始");
  elements.energyLabel.textContent = `${TARGET_SECONDS} 惜山林，能量完全盛開`;
  setTimer(result.centiseconds);
  sounds.victory();
  launchLeaves(useLiteEffects ? 26 : 54);
  announce(preview ? "正在預覽成功畫面" : `恭喜命中 ${TARGET_SECONDS}，惜山林成功，成為山林守護者`);
}

function launchLeaves(count) {
  elements.leafBurst.replaceChildren();
  const colors = ["#557f4b", "#8faa5f", "#d3c966", "#f3d66a", "#fff4a8"];
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const leaf = document.createElement("span");
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
    const distance = 26 + Math.random() * 54;
    leaf.style.setProperty("--x", `${Math.cos(angle) * distance}vw`);
    leaf.style.setProperty("--y", `${Math.sin(angle) * distance}vh`);
    leaf.style.setProperty("--rotation", `${Math.random() * 180 - 90}deg`);
    leaf.style.setProperty("--delay", `${Math.random() * 0.18}s`);
    leaf.style.setProperty("--duration", `${1.1 + Math.random() * 0.9}s`);
    leaf.style.setProperty("--leaf-color", colors[index % colors.length]);
    fragment.append(leaf);
  }
  elements.leafBurst.append(fragment);
}

function resetGame({ withSound = false } = {}) {
  game.revealToken += 1;
  window.cancelAnimationFrame(game.animationFrame);
  game.attempts = [];
  game.pointerId = null;
  game.keyboardActive = false;
  if (withSound) sounds.reset();
  else sounds.stopCharge();
  setPhase("idle", "idle");
  setCharge(0);
  setTimer(0);
  hideResultCard();
  elements.leafBurst.replaceChildren();
  elements.roundLabel.textContent = "第 1 次惜山林機會";
  elements.headline.innerHTML = "按住種子<br />為惜山林蓄積能量";
  elements.instruction.textContent = `看到 ${TARGET_SECONDS} 秒就放開，惜山林，剛剛好`;
  elements.energyLabel.textContent = "森林正等你送進一份惜山林的心意";
  setButton("按住惜山林", `${TARGET_SECONDS} 秒時放開`, `按住種子開始惜山林挑戰，${TARGET_SECONDS} 秒時放開`);
  updateAttemptUI();
  announce("新的 7.30 惜山林挑戰準備好了");
}

function handlePointerDown(event) {
  event.preventDefault();
  if (["winner", "finished"].includes(game.phase)) {
    resetGame({ withSound: true });
    return;
  }
  if (!["idle", "result"].includes(game.phase)) return;
  try {
    elements.gameButton.setPointerCapture(event.pointerId);
  } catch {
    // Window-level pointerup remains available as the fallback on older webOS browsers.
  }
  beginHold({ pointerId: event.pointerId });
}

function handlePointerRelease(event) {
  if (game.phase !== "charging") return;
  if (game.pointerId !== null && event.pointerId !== game.pointerId) return;
  event.preventDefault();
  elements.shell.dataset.releaseSignalValue = elements.timerValue.textContent;
  finishHold();
}

function handleTouchStart(event) {
  if (event.touches.length !== 1) return;
  if (["winner", "finished"].includes(game.phase)) {
    event.preventDefault();
    resetGame({ withSound: true });
    return;
  }
  if (!["idle", "result"].includes(game.phase)) return;
  event.preventDefault();
  beginHold();
}

function handleTouchRelease(event) {
  if (game.phase !== "charging") return;
  event.preventDefault();
  elements.shell.dataset.releaseSignalValue = elements.timerValue.textContent;
  finishHold();
}

function handleKeyDown(event) {
  if (!acceptedKeys.has(event.code)) return;
  event.preventDefault();
  if (event.repeat) return;
  if (["winner", "finished"].includes(game.phase)) {
    resetGame({ withSound: true });
    return;
  }
  beginHold({ keyboard: true });
}

function handleKeyUp(event) {
  if (!acceptedKeys.has(event.code) || !game.keyboardActive) return;
  event.preventDefault();
  finishHold();
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await elements.shell.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  } catch {
    announce("此瀏覽器不支援全螢幕，請使用瀏覽器選單開啟全螢幕");
  }
}

if ("PointerEvent" in window) {
  elements.gameButton.addEventListener("pointerdown", handlePointerDown, { passive: false });
  window.addEventListener("pointerup", handlePointerRelease, { passive: false, capture: true });
  window.addEventListener("pointercancel", handlePointerRelease, { passive: false, capture: true });
} else {
  elements.gameButton.addEventListener("touchstart", handleTouchStart, { passive: false, capture: true });
}
// Some LG webOS versions expose Pointer Events but deliver touchend earlier than pointerup.
// Listen for both release signals; finishHold's phase guard lets the first one win.
window.addEventListener("touchend", handleTouchRelease, { passive: false, capture: true });
window.addEventListener("touchcancel", handleTouchRelease, { passive: false, capture: true });
elements.gameButton.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", () => {
  if (game.phase === "charging") finishHold();
});

elements.simulateWinButton.addEventListener("click", () => {
  if (["charging", "revealing"].includes(game.phase)) return;
  const previewResult = judgeAttempt(730);
  showVictory(previewResult, { preview: true });
});

function syncSoundButton() {
  const enabled = sounds.isEnabled();
  elements.soundButton.setAttribute("aria-pressed", String(enabled));
  elements.soundButton.setAttribute("aria-label", enabled ? "關閉音效" : "開啟音效");
  elements.soundButton.querySelector("span").textContent = enabled ? "音效開" : "音效關";
}

elements.soundButton.addEventListener("click", () => {
  sounds.toggle();
  syncSoundButton();
  announce(sounds.isEnabled() ? "互動音效已開啟" : "互動音效已關閉");
});

elements.fullscreenButton.addEventListener("click", () => {
  sounds.tap();
  toggleFullscreen();
});
document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  elements.fullscreenButton.querySelector("span").textContent = active ? "離開" : "全螢幕";
  elements.fullscreenButton.setAttribute("aria-label", active ? "離開全螢幕" : "進入全螢幕");
});

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") {
    event.preventDefault();
    resetGame({ withSound: true });
  }
});

syncSoundButton();
resetGame();
