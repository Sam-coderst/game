(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CleanerGameCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CONFIG = Object.freeze({
    width: 960,
    height: 600,
    roundSeconds: 90,
    maxLoad: 20,
    baseTrashScore: 10,
    robotRadius: 22,
    maxSpeedEmpty: 330,
    maxSpeedFull: 275,
    accelerationEmpty: 920,
    accelerationFull: 560,
    turnResponseEmpty: 1,
    turnResponseFull: 0.63,
    dragEmpty: 4.4,
    dragFull: 1.75,
    collisionImpactThreshold: 235,
    collisionPenaltyCooldown: 0.72,
    droppedPickupDelay: 0.85,
    trashRadius: 9,
    maxWorldTrash: 42, // 22 ambient items + room for a full dropped load.
    replenishLimit: 22,
    initialTrash: 16,
    duelInitialTrash: 24, // Spawned in mirrored pairs for equal opening routes.
    duelReplenishLimit: 30,
    duelMaxWorldTrash: 70, // Ambient items + two full loads reserved for spills.
    spawnEvery: 0.72,
    maxSpawnAttempts: 35,
    fixedStep: 1 / 120,
    maxFrameDelta: 0.1
  });

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function loadRatio(load) { return clamp(load / CONFIG.maxLoad, 0, 1); }
  function multiplierForLoad(load) {
    if (load >= 16) return 2;
    if (load >= 11) return 1.5;
    if (load >= 6) return 1.2;
    return 1;
  }
  function deliveryScore(load) {
    return Math.round(load * CONFIG.baseTrashScore * multiplierForLoad(load));
  }
  function normalizedInput(x, y) {
    const length = Math.hypot(x, y);
    if (length > 1) return { x: x / length, y: y / length };
    return { x, y };
  }
  function impactDropCount(normalSpeed, load) {
    if (normalSpeed < CONFIG.collisionImpactThreshold || load <= 0) return 0;
    return Math.min(load, normalSpeed > 390 ? 3 : normalSpeed > 300 ? 2 : 1);
  }
  return { CONFIG, clamp, loadRatio, multiplierForLoad, deliveryScore, normalizedInput, impactDropCount };
});
