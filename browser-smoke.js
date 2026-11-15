"use strict";

// Lightweight Chrome DevTools Protocol smoke test; no npm packages required.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "slippery-cleaner-"));
const port = 9333;
const chrome = spawn(chromePath, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "http://127.0.0.1:8000/"
], { stdio: "ignore" });

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getTarget() {
  for (let i = 0; i < 50; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
      const page = targets.find(t => t.type === "page" && t.url.includes("127.0.0.1:8000"));
      if (page) return page;
    } catch (_) {}
    await delay(100);
  }
  throw new Error("Chrome DevTools target did not become ready");
}

async function main() {
  const target = await getTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const messageId = ++id; pending.set(messageId, { resolve, reject });
    ws.send(JSON.stringify({ id: messageId, method, params }));
  });
  const evaluate = async expression => {
    const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.text);
    return out.result.value;
  };

  await send("Runtime.enable"); await send("Page.enable");
  await evaluate("new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r, {once:true}))");
  const ready = await evaluate("Boolean(document.querySelector('canvas') && document.getElementById('startBtn'))");
  if (!ready) throw new Error("Game UI did not load");
  await evaluate("document.getElementById('soloBtn').click(); if (!document.getElementById('tutorialBar').classList.contains('hidden')) document.getElementById('skipTutorialBtn').click()");
  await delay(150);
  const started = await evaluate("document.getElementById('homeView').classList.contains('hidden') && document.getElementById('tutorialBar').classList.contains('hidden') && Number(document.getElementById('timeHud').textContent) <= 90");
  if (!started) throw new Error("Start flow failed");

  await send("Input.dispatchKeyEvent", { type: "keyDown", code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 });
  await delay(650);
  await send("Input.dispatchKeyEvent", { type: "keyUp", code: "ArrowRight", key: "ArrowRight", windowsVirtualKeyCode: 39 });
  await send("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyP", key: "p", windowsVirtualKeyCode: 80 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyP", key: "p", windowsVirtualKeyCode: 80 });
  await delay(100);
  const pausedA = await evaluate("({visible:!document.getElementById('pauseOverlay').classList.contains('hidden'),time:document.getElementById('timeHud').textContent})");
  await delay(450);
  const pausedB = await evaluate("document.getElementById('timeHud').textContent");
  if (!pausedA.visible || pausedA.time !== pausedB) throw new Error("Pause did not freeze the timer");
  await evaluate("document.getElementById('resumeBtn').click()");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await delay(120);
  const mobile = await evaluate("({touch:getComputedStyle(document.getElementById('touchControls')).display,canvas:document.getElementById('gameCanvas').getBoundingClientRect().width,body:document.body.scrollWidth})");
  if (mobile.touch !== "grid" || mobile.canvas < 250 || mobile.body > 395) throw new Error("Mobile layout check failed: " + JSON.stringify(mobile));
  if (errors.length) throw new Error("Unhandled page exceptions: " + errors.join(" | "));
  console.log("Browser smoke test passed (load, start, keyboard input, pause freeze, resume, mobile layout, no page exceptions).");
  ws.close();
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => {
  chrome.kill(); await delay(100);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) {}
});
