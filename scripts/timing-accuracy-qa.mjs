import { spawn } from "node:child_process";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const debuggingPort = 9341;
const profilePath = "/tmp/forest-timing-accuracy-profile";
const pageUrl = "http://127.0.0.1:8888/?effects=lite&qa=timing-v9";
const requestedDurations = [500, 1500, 3000, 7300];

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
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
      const item = pending.get(message.id);
      pending.delete(message.id);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text);
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return response.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: pageUrl });
  await delay(1400);
  const button = await evaluate(`(() => {
    const rect = document.querySelector('#gameButton').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);

  const results = [];
  for (const requestedMs of requestedDurations) {
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1,
    });
    const measuredStart = performance.now();
    await delay(requestedMs);
    const measuredStop = performance.now();
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1,
    });
    const displayed = await evaluate("Number(document.querySelector('#timerValue').textContent) * 1000");
    const measuredMs = measuredStop - measuredStart;
    results.push({
      requestedMs,
      measuredMs: Number(measuredMs.toFixed(1)),
      displayedMs: displayed,
      errorMs: Number((displayed - measuredMs).toFixed(1)),
      pass: Math.abs(displayed - measuredMs) <= 80,
    });
    await delay(650);
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }))");
    await delay(80);
  }

  console.log(JSON.stringify({ results, runtimeErrors, allPassed: results.every((item) => item.pass) }, null, 2));
  socket.close();
  if (runtimeErrors.length || results.some((item) => !item.pass)) process.exitCode = 1;
}

try {
  await run();
} finally {
  chrome.kill("SIGTERM");
}
