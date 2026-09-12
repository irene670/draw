import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const debuggingPort = 9337;
const profilePath = "/tmp/forest-energy-cdp-profile";
const pageUrl = "http://127.0.0.1:8888/?effects=lite&qa=portrait-cdp";

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profilePath}`,
  "--window-size=1080,1920",
  "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(250);
  }
  throw new Error("Chrome DevTools endpoint did not start");
}

async function run() {
  await waitForDebugger();
  const tabs = await fetch(`http://127.0.0.1:${debuggingPort}/json`).then((response) => response.json());
  const pageTarget = tabs.find((tab) => tab.type === "page");
  if (!pageTarget) throw new Error("Chrome page target was not found");
  const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const runtimeErrors = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(message.params.exceptionDetails.text);
    }
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1080,
    height: 1920,
    deviceScaleFactor: 1,
    mobile: false,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  });
  await send("Page.navigate", { url: pageUrl });
  await delay(1600);

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return result.result.value;
  }

  async function screenshot(path) {
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path, Buffer.from(shot.data, "base64"));
  }

  const soundToggle = await evaluate(`(() => {
    const button = document.querySelector('#soundButton');
    const before = button.getAttribute('aria-pressed');
    button.click();
    const toggled = button.getAttribute('aria-pressed');
    button.click();
    const restored = button.getAttribute('aria-pressed');
    return { before, toggled, restored, working: before !== toggled && before === restored };
  })()`);

  async function pressFor(milliseconds) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1 });
    await delay(milliseconds);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1 });
    await delay(1100);
  }

  const button = await evaluate(`(() => {
    const rect = document.querySelector('#gameButton').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
  })()`);

  await screenshot("/tmp/forest-energy-qa-idle.png");
  const idleTreeStyle = await evaluate(`(() => {
    const style = getComputedStyle(document.querySelector('.timer-tree'));
    return { opacity: style.opacity, transform: style.transform };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1 });
  await delay(2100);
  await screenshot("/tmp/forest-energy-qa-charging.png");
  const chargingTreeStyle = await evaluate(`(() => {
    const treeStyle = getComputedStyle(document.querySelector('.timer-tree'));
    const glowStyle = getComputedStyle(document.querySelector('#timerGlowValue'));
    return { opacity: treeStyle.opacity, transform: treeStyle.transform, numberGlowOpacity: glowStyle.opacity };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1 });
  const timerAtRelease = await evaluate("document.querySelector('#timerValue').textContent");
  await delay(240);
  const timerAfterRelease = await evaluate("document.querySelector('#timerValue').textContent");
  const releaseFreeze = {
    timerAtRelease,
    timerAfterRelease,
    unchanged: timerAtRelease === timerAfterRelease,
  };
  const treeGrowth = {
    idle: idleTreeStyle,
    charging: chargingTreeStyle,
    changed: idleTreeStyle.opacity !== chargingTreeStyle.opacity && idleTreeStyle.transform !== chargingTreeStyle.transform,
  };
  await delay(1010);
  await screenshot("/tmp/forest-energy-qa-result.png");

  await pressFor(420);
  await pressFor(520);
  const finishedState = await evaluate(`(() => ({
    phase: document.querySelector('#gameShell').dataset.phase,
    energy: document.querySelector('#gameShell').dataset.energy,
    attempts: [...document.querySelectorAll('.result-pill')].map((item) => item.textContent),
    buttonLabel: document.querySelector('#gameButtonLabel').textContent,
  }))()`);
  await screenshot("/tmp/forest-energy-qa-finished.png");

  await evaluate("document.querySelector('#simulateWinButton').click()");
  await delay(1300);
  await screenshot("/tmp/forest-energy-qa-winner.png");

  const metrics = await evaluate(`(() => ({
    viewport: [innerWidth, innerHeight],
    phase: document.querySelector('#gameShell').dataset.phase,
    seedState: document.querySelector('#gameShell').dataset.seedState,
    timer: document.querySelector('#timerValue').textContent,
    buttonLabel: document.querySelector('#gameButtonLabel').textContent,
    buttonSize: [Math.round(document.querySelector('#gameButton').offsetWidth), Math.round(document.querySelector('#gameButton').offsetHeight)],
    overflowX: document.documentElement.scrollWidth - innerWidth,
    overflowY: document.documentElement.scrollHeight - innerHeight,
    backgroundLoaded: getComputedStyle(document.querySelector('.forest-backdrop')).backgroundImage.includes('forest-energy-portrait-v2.webp'),
    timerTreeLoaded: document.querySelector('.timer-tree img').naturalWidth > 0,
    timerGlowReady: getComputedStyle(document.querySelector('#timerGlowValue')).display === 'none'
      || document.querySelector('#timerGlowValue').textContent === document.querySelector('#timerValue').textContent,
    soundControlReady: document.querySelector('#soundButton').getAttribute('aria-pressed') !== null,
    chargeAssetLoaded: document.querySelector('.seed-charge').naturalWidth > 0,
    moriAssetLoaded: document.querySelector('.mori-celebrate').naturalWidth > 0,
  }))()`);

  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  metrics.reducedMotionDuration = await evaluate("getComputedStyle(document.querySelector('.seed-state')).transitionDuration");

  console.log(JSON.stringify({ metrics, soundToggle, releaseFreeze, treeGrowth, finishedState, runtimeErrors }, null, 2));
  socket.close();
}

try {
  await run();
} finally {
  chrome.kill("SIGTERM");
}
