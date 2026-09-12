import { spawn } from "node:child_process";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const debuggingPort = 9343;
const profilePath = "/tmp/forest-touch-release-profile";
const pageUrl = "http://127.0.0.1:8888/?effects=lite&qa=touch-release-v10";
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profilePath}`,
  "--window-size=1080,1920", "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function run() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${debuggingPort}/json/version`)).ok) break;
    } catch {
      // Chrome is still starting.
    }
    await delay(250);
  }
  const tabs = await fetch(`http://127.0.0.1:${debuggingPort}/json`).then((response) => response.json());
  const target = tabs.find((tab) => tab.type === "page");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
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
    const response = await send("Runtime.evaluate", { expression, returnByValue: true });
    return response.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await send("Page.navigate", { url: pageUrl });
  await delay(1400);
  const point = await evaluate(`(() => {
    const rect = document.querySelector('#gameButton').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);

  await send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
  });
  await delay(1500);
  const valueBeforeRelease = await evaluate("document.querySelector('#timerValue').textContent");
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const valueAtSignal = await evaluate("document.querySelector('#gameShell').dataset.releaseSignalValue");
  const lockedValue = await evaluate("document.querySelector('#gameShell').dataset.lockedValue");
  const valueAtRelease = await evaluate("document.querySelector('#timerValue').textContent");
  await delay(300);
  const valueAfter300ms = await evaluate("document.querySelector('#timerValue').textContent");
  const phase = await evaluate("document.querySelector('#gameShell').dataset.phase");
  const result = {
    valueBeforeRelease,
    valueAtSignal,
    lockedValue,
    valueAtRelease,
    valueAfter300ms,
    unchanged: valueAtSignal === lockedValue
      && lockedValue === valueAtRelease
      && valueAtRelease === valueAfter300ms,
    phase,
    runtimeErrors,
  };
  console.log(JSON.stringify(result, null, 2));
  socket.close();
  if (!result.unchanged || phase === "charging" || runtimeErrors.length) process.exitCode = 1;
}

try {
  await run();
} finally {
  chrome.kill("SIGTERM");
}
