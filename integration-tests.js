"use strict";
// Executes the real game logic with a small DOM stand-in, not a browser/playability test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Core = require("./core.js");
const Profile = require("./profile.js");
const listeners = {}, elements = new Map();
const htmlIds = new Set([...fs.readFileSync("index.html","utf8").matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
function element() {
  const classes = new Set();
  return { textContent: "", value:"", children:[], append(...items){this.children.push(...items);}, replaceChildren(...items){this.children=items;}, style: {}, parentElement: {style:{}}, dataset: {},
    classList: {add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s),
      toggle(s,on){if(on)classes.add(s);else classes.delete(s);}},
    addEventListener(type,fn){(this.events[type] ||= []).push(fn);}, events:{},
    setAttribute(){}, setPointerCapture(){},
    getBoundingClientRect:()=>({width:960,height:600}), querySelectorAll:()=>buttons };
}
const buttons = ["up","down","left","right"].map(dir=>{const e=element();e.dataset.dir=dir;return e;});
const get = id=>{assert.ok(htmlIds.has(id),"missing HTML element: "+id);if(!elements.has(id))elements.set(id,element());return elements.get(id);};
get("gameCanvas").getContext=()=>new Proxy({}, {get:()=>()=>{}});
let portrait = false, clock = 0;
const sandbox = { CleanerGameCore:Core, CleanerProfile:Profile, document:{getElementById:get,createElement:element,hidden:false,
  addEventListener:(type,fn)=>{listeners[type]=fn;}},
  performance:{now:()=>clock}, URLSearchParams, location:{search:""},
  localStorage:{getItem(){throw Error("storage denied");},setItem(){throw Error("storage denied");}},
  requestAnimationFrame(){}, devicePixelRatio:2,matchMedia:()=>({matches:portrait}),
  addEventListener:(type,fn)=>{listeners[type]=fn;}, console };
sandbox.window=sandbox;
let source=fs.readFileSync("game.js","utf8");
// Test-only exposure: production contains no mutable debug API.
source=source.replace(/\}\)\(\);\s*$/, `window.testGame={robot,robot2,pointerDirs,room,recycle,profile,
 get furniture(){return furniture;},get players(){return players;},get pets(){return pets;},updatePets,canShiftFurniture,
 requestGame,startTutorial,leaveTutorial,updateTutorial,prepareGame,endGame,goHome,showLeaderboard,chooseScene,
 startGame,pauseGame,resumeGame,update,checkRecycle,collectTrash,moveAndCollide,
 validTrashSpot,spawnTrash,dropTrash,resizeCanvas,getInput,render,frame,
 snapshot:()=>({state,timeLeft,score:robot.score,trash,particles,floaters,trails,mode,training,guideStep}),
 setTime:v=>{timeLeft=v;}};})();`);
vm.runInNewContext(source,sandbox,{filename:"game.js"});
const g=sandbox.testGame, C=Core.CONFIG;
const tick = n=>{for(let i=0;i<n;i++)g.update(C.fixedStep);};
const key=(type,code)=>listeners[type]({code,preventDefault(){},repeat:false});
const reset=()=>{g.startGame();g.snapshot().trash.length=0;};

reset();
g.snapshot().trash.push({x:g.robot.x,y:g.robot.y,lock:0,color:"red"});
g.collectTrash();assert.equal(g.robot.load,1);
g.robot.load=20;g.snapshot().trash.push({x:g.robot.x,y:g.robot.y,lock:0});
g.collectTrash();assert.equal(g.robot.load,20);assert.equal(g.snapshot().trash.length,1);
g.robot.x=100;g.robot.y=500;g.checkRecycle();g.checkRecycle();
assert.equal(g.snapshot().score,400);assert.equal(g.robot.load,0);

reset();key("keydown","ArrowRight");key("keydown","KeyD");key("keyup","KeyD");
assert.equal(g.getInput().x,1);key("keyup","ArrowRight");assert.equal(g.getInput().x,0);
key("keydown","ArrowRight");g.pauseGame();const frozen=g.snapshot().timeLeft;
tick(240);assert.equal(g.snapshot().timeLeft,frozen);assert.equal(g.getInput().x,0);
g.resumeGame();tick(120);assert.ok(Math.abs(g.snapshot().timeLeft-(frozen-1))<1e-8);
listeners.blur();assert.equal(g.snapshot().state,"paused");
g.resumeGame();sandbox.document.hidden=true;listeners.visibilitychange();
assert.equal(g.snapshot().state,"paused");sandbox.document.hidden=false;

function coast(load) {reset();g.robot.load=load;g.robot.x=450;g.robot.y=290;g.robot.vx=200;tick(30);return g.robot.vx;}
assert.ok(coast(20)>coast(0)*1.5,"full load coasts more");
reset();g.robot.load=20;g.robot.x=450;g.robot.y=290;g.robot.vx=250;
key("keydown","ArrowLeft");tick(90);assert.ok(g.robot.vx<0,"full load reverses within 0.75s");
reset();g.robot.load=20;g.robot.x=450;g.robot.y=290;g.robot.vx=150;
key("keydown","ArrowUp");tick(30);assert.ok(g.robot.vy<-60,"full load can turn");

function hit(speed) {reset();g.robot.load=10;g.robot.x=300;g.robot.y=202+C.robotRadius+1;
 g.robot.vy=-speed;g.moveAndCollide(1/120);return g.robot.load;}
assert.equal(hit(150),10);assert.equal(hit(310),8);
const dropped=g.snapshot().trash;assert.equal(dropped.length,2);
assert.ok(dropped.every(t=>t.lock>0&&g.validTrashSpot(t.x,t.y,22)));
g.robot.vy=-310;g.moveAndCollide(1/120);assert.equal(g.robot.load,8,"cooldown prevents repeat penalty");
reset();g.robot.x=450;g.robot.y=290;
for(let i=0;i<C.replenishLimit;i++)g.spawnTrash(true);
const beforeDrop=g.snapshot().trash.length;const count=g.dropTrash(3,1,0);
assert.equal(count,3);assert.equal(g.snapshot().trash.length,beforeDrop+3);
assert.ok(g.snapshot().trash.length<=C.maxWorldTrash);

// Every sampled spawn must be clear; check the map's robot-safe cells are connected.
reset();for(let i=0;i<100;i++){g.spawnTrash(true);assert.ok(g.snapshot().trash.every(t=>g.validTrashSpot(t.x,t.y,28)));g.snapshot().trash.length=0;}
const cells=new Set(), step=10;
for(let y=40;y<=560;y+=step)for(let x=40;x<=920;x+=step){
 const clear=g.furniture.every(f=>Math.hypot(x-Core.clamp(x,f.x,f.x+f.w),y-Core.clamp(y,f.y,f.y+f.h))>=C.robotRadius);
 if(clear)cells.add(x+","+y);
}
const visited=new Set(),queue=["150,290"];
for(let i=0;i<queue.length;i++){const k=queue[i];if(visited.has(k)||!cells.has(k))continue;visited.add(k);
 const [x,y]=k.split(",").map(Number);queue.push(`${x+step},${y}`,`${x-step},${y}`,`${x},${y+step}`,`${x},${y-step}`);}
assert.equal(visited.size,cells.size,"sampled walkable map is connected");

reset();g.robot.load=20;g.robot.x=100;g.robot.y=500;g.setTime(.001);tick(1);
assert.equal(g.snapshot().state,"result");assert.equal(g.snapshot().score,0);tick(120);
assert.equal(g.snapshot().score,0);assert.equal(g.snapshot().timeLeft,0);
for(let i=0;i<5;i++){g.startGame();assert.equal(g.robot.load,0);assert.equal(g.snapshot().timeLeft,90);
 assert.equal(g.snapshot().score,0);assert.equal(g.snapshot().particles.length,0);assert.equal(g.snapshot().floaters.length,0);}
assert.equal(get("startBtn").events.click.length,1,"restart does not register more listeners");

const right=buttons[3];right.events.pointerdown[0]({preventDefault(){},pointerId:1});
assert.equal(g.getInput().x,1);right.events.pointercancel[0]({pointerId:1});assert.equal(g.getInput().x,0);
portrait=true;g.resizeCanvas();assert.equal(g.snapshot().state,"paused");g.resumeGame();
key("keydown","ArrowRight");assert.equal(g.getInput().y,-1);assert.equal(g.getInput().x,0);
g.render();g.pauseGame();clock+=60000;g.frame(clock);assert.equal(g.snapshot().timeLeft,90);
// First-play onboarding is interactive, untimed and never records practice scores.
portrait=false;g.resizeCanvas();g.goHome();g.requestGame("solo");
assert.equal(g.snapshot().state,"tutorial");assert.equal(g.snapshot().guideStep,0);
const rankedBefore=g.profile.entries("solo").length;tick(300);assert.equal(g.snapshot().timeLeft,90);
g.robot.x=255;g.robot.y=292;g.updateTutorial();assert.equal(g.snapshot().guideStep,1);
assert.equal(g.snapshot().trash.length,3);
for(const t of [...g.snapshot().trash]){g.robot.x=t.x;g.robot.y=t.y;g.collectTrash();}
g.updateTutorial();assert.equal(g.snapshot().guideStep,2);assert.equal(g.robot.load,16);
g.robot.x=118;g.robot.y=500;g.checkRecycle();g.updateTutorial();
assert.equal(g.snapshot().state,"tutorial-done");assert.equal(g.profile.entries("solo").length,rankedBefore);
assert.equal(g.profile.tutorialSeen(),true);g.leaveTutorial();assert.equal(g.snapshot().state,"playing");
assert.equal(g.robot.load,0);assert.equal(g.robot.score,0);assert.equal(g.snapshot().timeLeft,90);
g.goHome();g.requestGame("solo");assert.equal(g.snapshot().state,"playing","onboarding only auto-runs once");
g.goHome();g.startTutorial();g.pauseGame();g.resumeGame();assert.equal(g.snapshot().state,"tutorial");
g.leaveTutorial();assert.equal(g.snapshot().state,"playing");

// Real versus flows: ready, two separate controls, symmetric opening, own stations and winner.
g.goHome();get("p1Name").value="Alice";get("p2Name").value="Bob";g.requestGame("duel");
assert.equal(g.snapshot().state,"ready");tick(120);assert.equal(g.snapshot().timeLeft,90);
g.startGame();assert.equal(g.players.length,2);assert.equal(g.robot.name,"Alice");assert.equal(g.robot2.name,"Bob");
assert.ok(g.snapshot().trash.length>0);assert.equal(g.snapshot().trash.length%2,0);
for(let i=0;i<g.snapshot().trash.length;i+=2){const a=g.snapshot().trash[i],b=g.snapshot().trash[i+1];assert.equal(a.x+b.x,C.width);assert.equal(a.y,b.y);}
key("keydown","KeyD");key("keydown","ArrowLeft");assert.equal(g.getInput(g.robot).x,1);assert.equal(g.getInput(g.robot2).x,-1);
key("keyup","KeyD");assert.equal(g.getInput(g.robot).x,0);assert.equal(g.getInput(g.robot2).x,-1);
g.pauseGame();assert.equal(g.getInput(g.robot2).x,0);g.resumeGame();
// Overlap and ties do not duplicate a pickup or always favour P1.
g.snapshot().trash.length=0;g.robot.x=g.robot2.x=480;g.robot.y=g.robot2.y=290;
g.snapshot().trash.push({id:101,x:480,y:290,lock:0,color:"red"},{id:102,x:480,y:290,lock:0,color:"red"});
g.collectTrash();assert.equal(g.robot.load,1);assert.equal(g.robot2.load,1);assert.equal(g.snapshot().trash.length,0);
g.robot.load=20;g.robot2.load=20;
g.robot.x=842;g.robot.y=500;g.robot2.x=118;g.robot2.y=500;g.checkRecycle(g.robot);g.checkRecycle(g.robot2);
assert.equal(g.robot.score,0);assert.equal(g.robot2.score,0);assert.equal(g.robot.load,20);
g.robot.x=118;g.robot2.x=842;g.checkRecycle(g.robot);g.checkRecycle(g.robot2);g.checkRecycle(g.robot2);
assert.equal(g.robot.score,400);assert.equal(g.robot2.score,400);
g.robot2.score=500;const duelBefore=g.profile.entries("duel").length;g.setTime(.001);tick(1);
assert.equal(g.snapshot().state,"result");assert.equal(get("finalScore").textContent,"P2 wins!");
assert.equal(g.profile.entries("duel").length,duelBefore+1);g.endGame();assert.equal(g.profile.entries("duel").length,duelBefore+1);
g.showLeaderboard("duel");assert.equal(get("boardRows").children.length,g.profile.entries("duel").length);
g.prepareGame("duel");g.startGame();assert.equal(g.robot.score,0);assert.equal(g.robot2.score,0);
g.setTime(.001);tick(1);assert.equal(get("finalScore").textContent,"It's a draw!");
g.prepareGame("duel");g.startGame();const rounds=g.profile.entries("duel").length;g.goHome();assert.equal(g.profile.entries("duel").length,rounds,"aborted game is not ranked");
g.requestGame("solo");assert.equal(g.players.length,1);assert.equal(g.robot2.score,0);
// Nickname typing must not move players or consume W/A/S/D in the home form.
g.goHome();listeners.keydown({code:"KeyW",target:{tagName:"INPUT"},preventDefault(){throw Error("nickname input intercepted");}});
g.prepareGame("duel");g.startGame();key("keydown","KeyD");key("keydown","ArrowLeft");tick(30);
assert.ok(g.robot.x>155 && g.robot2.x<805,"both robots move independently in the same update");
g.pauseGame();g.resumeGame();
// Exercise an entire simulated versus round, including replenishment and both physics loops.
for(let frame=0;frame<10801 && g.snapshot().state==="playing";frame++){
  if(frame%240===0){
    ["KeyD","KeyS","KeyA","KeyW","ArrowLeft","ArrowDown","ArrowRight","ArrowUp"].forEach(c=>key("keyup",c));
    const segment=Math.floor(frame/240)%4;
    key("keydown",["KeyD","KeyS","KeyA","KeyW"][segment]);
    key("keydown",["ArrowLeft","ArrowDown","ArrowRight","ArrowUp"][segment]);
  }
  tick(1);
  for(const r of g.players){assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));assert.ok(r.load>=0&&r.load<=20);}
  assert.ok(g.snapshot().trash.length<=C.duelMaxWorldTrash);
}
assert.equal(g.snapshot().state,"result");assert.equal(g.snapshot().timeLeft,0);
for(const scene of ["living","bedroom","kitchen"]){
 for(const mode of ["solo","duel"]){
  g.chooseScene(scene);g.prepareGame(mode);g.startGame();
  assert.ok(g.snapshot().trash.length>0);
  assert.ok(g.snapshot().trash.every(t=>g.validTrashSpot(t.x,t.y,28)));
  const open=new Set(),seen=new Set(),q=["150,290"];
  for(let y=40;y<=560;y+=10)for(let x=40;x<=920;x+=10){
   if(g.furniture.every(f=>Math.hypot(x-Core.clamp(x,f.x,f.x+f.w),y-Core.clamp(y,f.y,f.y+f.h))>=C.robotRadius))open.add(x+","+y);
  }
  for(let i=0;i<q.length;i++){const k=q[i];if(seen.has(k)||!open.has(k))continue;seen.add(k);const [x,y]=k.split(",").map(Number);q.push(`${x+10},${y}`,`${x-10},${y}`,`${x},${y+10}`,`${x},${y-10}`);}
  assert.equal(seen.size,open.size,scene+" / "+mode+" has connected walkable space");
  assert.ok(seen.has("150,290")&&seen.has("800,290"),"both spawns are accessible");
  g.render();tick(120);assert.ok(g.snapshot().trash.length<=(mode==="duel"?C.duelMaxWorldTrash:C.maxWorldTrash));
 }
}
// Pet behavior uses the same fixed-step simulation and stops with the round.
g.chooseScene("living");g.prepareGame("solo");g.snapshot().trash.length=0;
assert.equal(g.pets.length,2);
const sofa=g.furniture[0],originalX=sofa.x;
Object.assign(g.pets[0],{x:sofa.x-20,y:sofa.y+sofa.h/2,action:"push",target:sofa,clock:4,angle:0});
for(let i=0;i<240;i++)g.updatePets(C.fixedStep);
assert.ok(sofa.x>originalX+5,"pet physically shifts furniture");
assert.ok(Math.abs(sofa.x-sofa.homeX)<=32,"furniture stays in its movement envelope");
assert.equal(g.canShiftFurniture(sofa,sofa.homeX+40,sofa.y),false);
g.robot.x=sofa.x-25;g.robot.y=sofa.y+40;
assert.equal(g.canShiftFurniture(sofa,sofa.x-1,sofa.y),false,"cannot crush a robot");
g.startGame();assert.equal(g.furniture[0].x,originalX,"rematch restores furniture");
g.snapshot().trash.length=0;
Object.assign(g.robot,{x:450,y:290,load:10,vx:0,vy:0});
Object.assign(g.pets[0],{x:420,y:290,action:"dash",clock:1,angle:0,cooldown:0});
g.updatePets(C.fixedStep);
assert.equal(g.robot.load,9,"cat drops one recoverable item");
assert.equal(g.snapshot().trash.length,1);assert.ok(g.robot.vx>0,"pet nudges robot");
g.updatePets(C.fixedStep);assert.equal(g.robot.load,9,"no repeated contact penalty");
Object.assign(g.robot,{x:700,y:290,load:10,hitCooldown:0});
Object.assign(g.pets[1],{x:670,y:290,action:"dash",clock:1,angle:0,cooldown:0});
g.updatePets(C.fixedStep);assert.equal(g.robot.load,8,"dog drops at most two items");
Object.assign(g.robot,{x:100,y:500,load:10,hitCooldown:0});
Object.assign(g.pets[1],{x:90,y:500,cooldown:0});
g.updatePets(C.fixedStep);assert.equal(g.robot.load,10,"station protects deliveries from pets");
Object.assign(g.pets[0],{action:"warning",clock:.5,cooldown:0});
const warningX=g.pets[0].x;g.updatePets(.1);assert.equal(g.pets[0].x,warningX,"warning holds before pounce");
g.pauseGame();const frozenPets=JSON.stringify(g.pets);tick(120);assert.equal(JSON.stringify(g.pets),frozenPets);
g.startTutorial();assert.equal(g.pets.length,0,"tutorial remains pet-free");
for(const scene of ["living","bedroom","kitchen"]){
  g.chooseScene(scene);g.prepareGame("solo");tick(9000);
  for(const f of g.furniture){assert.ok(Math.abs(f.x-f.homeX)<=32.001 && Math.abs(f.y-f.homeY)<=32.001);}
  assert.ok(g.pets.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  g.render();
}
console.log("Pet checks passed: furniture movement/reset, protected space, recoverable drops, contact cooldown, warning, pause, tutorial, and long simulation in all rooms.");
console.log("All three scenes passed spawn, connected-space and rendering-code checks in solo and versus modes.");
console.log("New flow checks passed: home, first-play/skip/replay tutorial, no practice ranking, separate versus controls, symmetric spawn, contested pickups, own stations, winner/tie, single end record, rematch/mode switch, aborted round, leaderboard DOM.");
console.log("Integration checks passed: pickup/cap, delivery, keyboard aliases, pause/blur/hidden, load handling, collision/drop safety, connected map, expiry, restart, denied storage, touch cancel, portrait inputs.");
