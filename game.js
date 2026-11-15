(function () {
  "use strict";
  const Core = window.CleanerGameCore;
  const C = Core.CONFIG;
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const ui = {
    time: document.getElementById("timeHud"), score: document.getElementById("scoreHud"),
    load: document.getElementById("loadHud"), mult: document.getElementById("multHud"),
    start: document.getElementById("startOverlay"), pause: document.getElementById("pauseOverlay"),
    result: document.getElementById("resultOverlay"), pauseReason: document.getElementById("pauseReason"),
    finalScore: document.getElementById("finalScore"), bestScore: document.getElementById("bestScore"),
    undelivered: document.getElementById("undelivered"), pauseBtn: document.getElementById("pauseBtn"),
    muteBtn: document.getElementById("muteBtn"), touch: document.getElementById("touchControls")
  };

  const Platform = {
    gameplayStart() {}, gameplayStop() {}, loadingFinished() {}
  };

  const room = { left: 18, top: 18, right: 942, bottom: 582 };
  const recycle = { x: 54, y: 442, w: 128, h: 116 };
  const soloFurniture = [
    { id: 1, x: 205, y: 122, w: 190, h: 80, type: "sofa", color: "#ff9d82" },
    { id: 2, x: 506, y: 108, w: 104, h: 142, type: "desk", color: "#d79a68" },
    { id: 3, x: 720, y: 118, w: 150, h: 68, type: "shelf", color: "#80b7cd" },
    { id: 4, x: 283, y: 330, w: 118, h: 174, type: "table", color: "#d5ad68" },
    { id: 5, x: 535, y: 386, w: 212, h: 77, type: "sofa", color: "#a69bdd" },
    { id: 6, x: 806, y: 323, w: 72, h: 170, type: "plant", color: "#65bd81" }
  ];

  const duelFurniture = [
    {x:205,y:122,w:190,h:80,type:"sofa",color:"#ff9d82"},
    {x:565,y:122,w:190,h:80,type:"sofa",color:"#80b7cd"},
    {x:283,y:330,w:118,h:174,type:"table",color:"#d5ad68"},
    {x:559,y:330,w:118,h:174,type:"table",color:"#d5ad68"},
    {x:435,y:100,w:90,h:110,type:"plant",color:"#65bd81"}
  ];
  const stations = [recycle, {x:778,y:442,w:128,h:116}];
  let furniture = soloFurniture;
  const roomThemes={living:{name:"Living Room",floor:"#eef2df",line:"#cbd6ba",wall:"#345b49"},bedroom:{name:"Bedroom",floor:"#efe3d5",line:"#d3bfa9",wall:"#705579"},kitchen:{name:"Kitchen",floor:"#e3edf0",line:"#b3ccd2",wall:"#355c74"}};
  const bedroomFurniture=[{x:215,y:95,w:150,h:150,type:"bed",color:"#baa5db"},{x:595,y:95,w:150,h:150,type:"bed",color:"#baa5db"},{x:270,y:370,w:130,h:110,type:"shelf",color:"#bc8a63"},{x:560,y:370,w:130,h:110,type:"shelf",color:"#bc8a63"},{x:437,y:110,w:86,h:74,type:"desk",color:"#ddb47f"}];
  const kitchenFurniture=[{x:205,y:90,w:190,h:95,type:"stove",color:"#99bdc7"},{x:565,y:90,w:190,h:95,type:"stove",color:"#99bdc7"},{x:300,y:345,w:100,h:160,type:"counter",color:"#e6be7b"},{x:560,y:345,w:100,h:160,type:"counter",color:"#e6be7b"},{x:435,y:215,w:90,h:110,type:"counter",color:"#e6be7b"}];
  let selectedScene="living",activeScene="living";
  function chooseScene(scene){
    if(!roomThemes[scene])return;selectedScene=scene;
    ["living","bedroom","kitchen"].forEach((key,i)=>{const b=el(["sceneLiving","sceneBedroom","sceneKitchen"][i]);b.classList.toggle("selected",scene===key);b.setAttribute("aria-pressed",String(scene===key));});
  }
  const profile = window.CleanerProfile.create(function(){return localStorage;});
  const pointerDirs = new Map(), heldCodes = new Set();
  function makeRobot(id) {
    return {id:id,name:"Cleaner "+(id+1),x:155,y:292,vx:0,vy:0,angle:0,
      load:0,score:0,hitCooldown:0,recycleInside:false,color:id?"#7cb8ff":"#70e2ba"};
  }
  const robot = makeRobot(0), robot2 = makeRobot(1);
  let players = [robot], mode = "solo", pendingMode = "solo", state = "home", pausedFrom = "playing";
  let timeLeft = C.roundSeconds, training = false, guideStep = 0, simTime = 0;
  let trash = [], particles = [], floaters = [], trails = [], pets = [];
  let spawnClock = 0, accumulator = 0, lastFrame = performance.now(), nextTrashId = 1;
  let muted = false, audioCtx = null, portrait = false;
  const debug = new URLSearchParams(location.search).has("debug");
  const el = id => document.getElementById(id);
  const hide = (id, yes) => el(id).classList.toggle("hidden", yes);
  const overlays = ["startOverlay","pauseOverlay","resultOverlay","tutorialDoneOverlay"];
  const isRunning = () => state === "playing" || state === "tutorial";
  function hideOverlays(){overlays.forEach(id=>hide(id,true));}
  function stopAudio(){if(audioCtx && audioCtx.state === "running")audioCtx.suspend().catch(function(){});}
  function showView(view) {
    ["homeView","gameView","boardView"].forEach(id=>hide(id,id!==view));
    hide("pauseBtn",view!=="gameView");
    if(view === "gameView")resizeCanvas(true);
  }
  function saveNames(){const names=profile.setNames(el("p1Name").value,el("p2Name").value);robot.name=names[0];robot2.name=names[1];}
  function goHome() {
    Platform.gameplayStop();stopAudio();clearInput();state="home";training=false;hideOverlays();
    showView("homeView");el("homeBest").textContent=profile.best();
  }
  function requestGame(nextMode) {
    pendingMode = nextMode;saveNames();
    if(!profile.tutorialSeen())startTutorial();else prepareGame(nextMode);
  }
  function prepareGame(nextMode) {
    mode=nextMode;training=false;resetGame();state="ready";hideOverlays();
    hide("tutorialBar",true);showView("gameView");
    if(mode==="duel")hide("startOverlay",false);else startGame();
  }
  function initAudio() {
    if (muted) return;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { try { audioCtx = new AC(); } catch (_) { audioCtx = null; } }
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(function () {});
  }
  function tone(freq, duration, type, gain, endFreq) {
    if (muted || !audioCtx || state === "paused") return;
    const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), amp = audioCtx.createGain();
    osc.type = type || "sine"; osc.frequency.setValueAtTime(freq, now);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    amp.gain.setValueAtTime(gain || .05, now); amp.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(amp); amp.connect(audioCtx.destination); osc.start(now); osc.stop(now + duration);
  }

  function resetGame() {
    clearInput();players=mode==="duel"?[robot,robot2]:[robot];
    furniture=mode==="duel"?duelFurniture:soloFurniture;
    activeScene=training?"living":selectedScene;
    if(activeScene==="bedroom")furniture=bedroomFurniture;
    if(activeScene==="kitchen")furniture=kitchenFurniture;
    // Each round owns its furniture; pet mischief never changes the scene templates.
    furniture=furniture.map(f=>({...f,homeX:f.x,homeY:f.y}));
    pets=training?[]:[{kind:"cat",x:115,y:95,angle:0,clock:3,action:"roam",turn:0,cooldown:0},
      {kind:"dog",x:845,y:265,angle:Math.PI,clock:5,action:"roam",turn:1,cooldown:0}];
    [robot,robot2].forEach(function(r){r.x=r.id?805:155;r.y=292;r.vx=0;r.vy=0;r.angle=r.id?Math.PI:0;
      r.load=0;r.score=0;r.hitCooldown=0;r.recycleInside=false;});
    timeLeft=C.roundSeconds;spawnClock=0;accumulator=0;nextTrashId=1;simTime=0;
    trash.length=0;particles.length=0;floaters.length=0;trails.length=0;
    if(!training)for(let i=0;i<(mode==="duel"?C.duelInitialTrash/2:C.initialTrash);i++)spawnTrash(true);
    el("gameView").classList.toggle("duel",mode==="duel");
    el("gameView").classList.toggle("training",training);
    hide("p2Hud",mode!=="duel");hide("touchControls",mode==="duel");
    el("footerTip").textContent=mode==="duel"?"P1 WASD · P2 arrows · Use your own station · P / Esc pauses both":"Arrows / WASD to move · Auto pickup & drop-off · P / Esc to pause";
    updateHud();
  }
  function startGame() {
    training=false;resetGame();state="playing";hideOverlays();hide("tutorialBar",true);showView("gameView");
    initAudio();lastFrame=performance.now();Platform.gameplayStart();tone(440,.1,"sine",.05,720);
  }
  function pauseGame(reason) {
    if(!isRunning())return;
    pausedFrom=state;state="paused";clearInput();ui.pauseReason.textContent=reason||(mode==="duel"?"Both players and the timer are paused.":"Movement and the timer are paused. Continue when you're ready.");
    hide("pauseOverlay",false);Platform.gameplayStop();stopAudio();
  }
  function resumeGame() {
    if(state!=="paused")return;
    state=pausedFrom;clearInput();initAudio();hide("pauseOverlay",true);lastFrame=performance.now();accumulator=0;
    Platform.gameplayStart();
  }
  function endGame() {
    if(state!=="playing")return;
    state="result";clearInput();Platform.gameplayStop();
    const record=profile.record(mode,players.map(r=>({name:r.name,score:r.score})));
    hide("bestLine",mode==="duel");hide("duelResult",mode!=="duel");
    el("resultEyebrow").textContent=mode==="duel"?"RACE COMPLETE":"CLEANING COMPLETE";
    if(mode==="duel"){
      const winner=robot.score===robot2.score?null:robot.score>robot2.score?robot:robot2;
      ui.finalScore.textContent=winner?"P"+(winner.id+1)+" wins!":"It's a draw!";
      el("duelResult").replaceChildren();
      players.forEach(r=>{const card=document.createElement("div");card.className=r.id?"p2-result":"p1-result";
        const name=document.createElement("span"),value=document.createElement("strong");name.textContent="P"+(r.id+1)+" · "+r.name;value.textContent=r.score+" pts";card.append(name,value);el("duelResult").append(card);});
      ui.undelivered.textContent="Undelivered (no points): P1 "+robot.load+" items / P2 "+robot2.load+" items.";
    }else{
      ui.finalScore.textContent=robot.score+" pts";ui.bestScore.textContent=profile.best();
      ui.undelivered.textContent=robot.load?"Remaining: "+robot.load+" undelivered items (no points).":"Every collected item was delivered.";
    }
    el("resultRank").textContent=(record?.rank?"Local "+(mode==="duel"?"versus":"solo")+" rank: #"+record.rank+".":"Outside the local top 10 this time.")+(!profile.available()?" Storage is unavailable. This score lasts only until you leave this page.":"");
    hide("resultOverlay",false);tone(330,.42,"triangle",.07,660);
  }
  function startTutorial() {
    training=true;mode="solo";guideStep=0;resetGame();state="tutorial";hideOverlays();
    hide("tutorialBar",false);showView("gameView");initAudio();lastFrame=performance.now();setGuide();Platform.gameplayStart();
  }
  function setGuide() {
    const titles=["Get moving","Drive over it. Pick it up.","Heavy load. Head home."];
    const texts=["Hold the arrow keys, WASD, or touch arrows to reach the circle. You keep sliding after you let go.", "Collect the 3 highlighted items. No pickup button needed.", "You're carrying 16 items (×2). Steer in the opposite direction to brake, then enter the marked green station."];
    el("tutorialStep").textContent="PRACTICE · "+(guideStep+1)+" / 3 · NO TIMER";
    el("tutorialTitle").textContent=titles[guideStep];el("tutorialText").textContent=texts[guideStep];
  }
  function updateTutorial() {
    if(guideStep===0 && Math.hypot(robot.x-255,robot.y-292)<40){
      guideStep=1;[275,350,425].forEach(x=>trash.push(makeTrash(x,285,0)));setGuide();
    }else if(guideStep===1 && robot.load>=3){
      guideStep=2;robot.load=16;setGuide();
    }else if(guideStep===2 && robot.score>0){
      profile.markTutorial();state="tutorial-done";clearInput();hide("tutorialBar",true);hide("tutorialDoneOverlay",false);Platform.gameplayStop();
    }
  }
  function leaveTutorial(){profile.markTutorial();clearInput();prepareGame(pendingMode);}
  function showLeaderboard(boardMode) {
    state="leaderboard";clearInput();stopAudio();hideOverlays();showView("boardView");
    const entries=profile.entries(boardMode),duel=boardMode==="duel";
    ["solo","duel"].forEach(m=>{el(m+"BoardBtn").classList.toggle("active",m===boardMode);el(m+"BoardBtn").setAttribute("aria-pressed",String(m===boardMode));});
    el("boardDescription").textContent=duel?"Each row is a match, ranked by its highest individual score. Both players' scores are shown.":"Completed solo rounds. A player can appear more than once.";
    el("boardPlayerHeading").textContent=duel?"Winner / Match":"Player";
    hide("boardEmpty",entries.length>0);hide("boardTableWrap",entries.length===0);el("boardRows").replaceChildren();
    entries.forEach((entry,i)=>{
      const tr=document.createElement("tr"),a=entry.players[0],b=entry.players[1];
      const label=duel?(a.score===b.score?"Draw":(a.score>b.score?a.name:b.name)+" wins"):a.name;
      const values=[String(i+1),label,duel?a.score+" : "+b.score:String(a.score),new Date(entry.at).toLocaleDateString("en")];
      values.forEach((value,j)=>{const td=document.createElement("td");td.textContent=value;
        if(duel && j===1){const detail=document.createElement("small");detail.textContent=a.name+" vs "+b.name;td.append(detail);}tr.append(td);});el("boardRows").append(tr);
    });
    el("storageNote").textContent=profile.available()?"Scores are saved in this browser only. Clearing browser data removes them.":"Browser storage is unavailable. Scores last only until you refresh this page.";
  }

  function clearInput() {
    heldCodes.clear();pointerDirs.clear();
    ui.touch.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
  }
  function getInput(r = robot) {
    const wasd=mode!=="duel"||r.id===0, arrows=mode!=="duel"||r.id===1;
    let x=((wasd&&heldCodes.has("KeyD"))||(arrows&&heldCodes.has("ArrowRight"))?1:0)-((wasd&&heldCodes.has("KeyA"))||(arrows&&heldCodes.has("ArrowLeft"))?1:0);
    let y=((wasd&&heldCodes.has("KeyS"))||(arrows&&heldCodes.has("ArrowDown"))?1:0)-((wasd&&heldCodes.has("KeyW"))||(arrows&&heldCodes.has("ArrowUp"))?1:0);
    if(mode!=="duel")pointerDirs.forEach(dir=>{if(dir==="left")x--;else if(dir==="right")x++;else if(dir==="up")y--;else if(dir==="down")y++;});
    x=Core.clamp(x,-1,1);y=Core.clamp(y,-1,1);
    return portrait?Core.normalizedInput(y,-x):Core.normalizedInput(x,y);
  }
  function update(dt) {
    if(!isRunning())return;
    simTime+=dt;
    if(!training){timeLeft-=dt;if(timeLeft<=0){timeLeft=0;updateHud();endGame();return;}}
    for(let i=0;i<players.length;i++)moveRobot(players[i],dt);
    if(!training)updatePets(dt);
    collectTrash();
    for(let i=0;i<players.length;i++)checkRecycle(players[i]);
    if(training)updateTutorial();
    else {
      spawnClock+=dt;
      if(spawnClock>=C.spawnEvery){spawnClock-=C.spawnEvery;if(trash.length+(mode==="duel"?2:1)<=(mode==="duel"?C.duelReplenishLimit:C.replenishLimit))spawnTrash(false);}
    }
    for(let i=trash.length-1;i>=0;i--)if(trash[i].lock>0)trash[i].lock-=dt;
    updateEffects(dt);updateHud();
  }
  function moveRobot(robot,dt) {
    robot.hitCooldown = Math.max(0, robot.hitCooldown - dt);
    const input = getInput(robot), ratio = Core.loadRatio(robot.load);
    const accel = lerp(C.accelerationEmpty, C.accelerationFull, ratio);
    const turn = lerp(C.turnResponseEmpty, C.turnResponseFull, ratio);
    const drag = lerp(C.dragEmpty, C.dragFull, ratio);
    const maxSpeed = lerp(C.maxSpeedEmpty, C.maxSpeedFull, ratio);

    if (input.x || input.y) {
      const speed = Math.hypot(robot.vx, robot.vy);
      const facing = speed > 12 ? (robot.vx * input.x + robot.vy * input.y) / speed : 1;
      const brakingBoost = facing < -0.3 ? 1.42 : 1;
      robot.vx += input.x * accel * turn * brakingBoost * dt;
      robot.vy += input.y * accel * turn * brakingBoost * dt;
    }
    const decay = Math.exp(-drag * dt * (input.x || input.y ? .22 : 1));
    robot.vx *= decay; robot.vy *= decay;
    const speed = Math.hypot(robot.vx, robot.vy);
    if (speed > maxSpeed) { robot.vx *= maxSpeed / speed; robot.vy *= maxSpeed / speed; }
    if (speed > 8) robot.angle = Math.atan2(robot.vy, robot.vx);

    moveAndCollide(dt,robot);
  }

  function canShiftFurniture(f,x,y) {
    const gap=C.robotRadius*2+12;
    if(Math.abs(x-f.homeX)>32 || Math.abs(y-f.homeY)>32)return false;
    if(x<room.left+gap || y<room.top+gap || x+f.w>room.right-gap || y+f.h>room.bottom-gap)return false;
    const overlaps=(a,pad)=>x<a.x+a.w+pad && x+f.w>a.x-pad && y<a.y+a.h+pad && y+f.h>a.y-pad;
    if(furniture.some(other=>other!==f && overlaps(other,gap)))return false;
    if(stations.some(s=>overlaps(s,32)))return false;
    if(players.some(r=>circleRectOverlap(r.x,r.y,C.robotRadius+8,x,y,f.w,f.h)))return false;
    if(trash.some(t=>circleRectOverlap(t.x,t.y,C.robotRadius+C.trashRadius+2,x,y,f.w,f.h)))return false;
    return !pets.some(p=>circleRectOverlap(p.x,p.y,17,x,y,f.w,f.h));
  }
  function updatePets(dt) {
    pets.forEach(p=>{
      p.clock-=dt;p.cooldown=Math.max(0,p.cooldown-dt);
      if(p.clock<=0){
        if(p.action==="warning"){p.action="dash";p.clock=1.1;}
        else if(p.action==="dash" || p.action==="push"){
          p.action="roam";p.clock=3;p.angle+=Math.PI*.7;
        }else{
          p.turn++;
          if(p.turn%2){
            const target=players.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b);
            p.angle=Math.atan2(target.y-p.y,target.x-p.x);p.action="warning";p.clock=1;
            floatText(p.x,p.y-30,p.kind==="cat"?"Pounce!":"Zoomies!","#a55a23");
          }else{
            p.target=furniture.reduce((a,b)=>Math.hypot(a.x+a.w/2-p.x,a.y+a.h/2-p.y)<Math.hypot(b.x+b.w/2-p.x,b.y+b.h/2-p.y)?a:b);
            p.action="push";p.clock=4;
          }
        }
      }
      if(p.action==="warning")return;
      if(p.action==="push")p.angle=Math.atan2(p.target.y+p.target.h/2-p.y,p.target.x+p.target.w/2-p.x);
      const speed=p.action==="dash"?(p.kind==="cat"?220:190):p.action==="push"?65:48;
      const dx=Math.cos(p.angle)*speed*dt,dy=Math.sin(p.angle)*speed*dt;
      const nx=p.x+dx,ny=p.y+dy;
      const obstacle=furniture.find(f=>circleRectOverlap(nx,ny,19,f.x,f.y,f.w,f.h));
      if(obstacle){
        const fx=obstacle.x+Math.cos(p.angle)*22*dt,fy=obstacle.y+Math.sin(p.angle)*22*dt;
        if(p.action==="push" && canShiftFurniture(obstacle,fx,fy)){
          obstacle.x=fx;obstacle.y=fy;
          if(p.cooldown<=0){floatText(p.x,p.y-32,"Furniture shuffle!","#a55a23");p.cooldown=2;}
        }else if(p.action!=="push"){p.angle+=Math.PI*.65;p.action="roam";p.clock=2;}
      }else if(nx<room.left+22 || nx>room.right-22 || ny<room.top+22 || ny>room.bottom-22){
        p.angle+=Math.PI*.7;p.action="roam";p.clock=2;
      }else if(!stations.some(s=>circleRectOverlap(nx,ny,25,s.x,s.y,s.w,s.h))){p.x=nx;p.y=ny;}
      else {p.angle+=Math.PI*.7;p.action="roam";p.clock=2;}
      players.forEach(r=>{
        const base=stations[r.id];
        if(r.x>=base.x && r.x<=base.x+base.w && r.y>=base.y && r.y<=base.y+base.h)return;
        if(p.cooldown>0 || r.hitCooldown>0 || Math.hypot(r.x-p.x,r.y-p.y)>C.robotRadius+19)return;
        // A brief nudge, not a stun: steering remains available and scores are never removed.
        const a=Math.atan2(r.y-p.y,r.x-p.x),nx=Math.cos(a),ny=Math.sin(a);
        r.vx+=nx*110;r.vy+=ny*110;r.hitCooldown=1.5;p.cooldown=2;
        const count=dropTrash(Math.min(r.load,p.kind==="cat"?1:2),nx,ny,r);r.load-=count;
        burst(p.x,p.y,"#f7c778",10,95);
        floatText(r.x,r.y-34,count?"Oops! -"+count:"Boop!","#a55a23");
        tone(p.kind==="cat"?680:250,.12,"triangle",.035);
        p.action="roam";p.clock=3;p.angle=a+Math.PI;
      });
    });
  }

  function moveAndCollide(dt, robot = players[0]) {
    const preVx = robot.vx, preVy = robot.vy;
    robot.x += robot.vx * dt;
    let collision = resolveAll("x", preVx, preVy, robot);
    robot.y += robot.vy * dt;
    const second = resolveAll("y", preVx, preVy, robot);
    if (!collision || (second && second.impact > collision.impact)) collision = second;
    if (collision && collision.furniture && collision.impact >= C.collisionImpactThreshold && robot.hitCooldown <= 0) {
      const count = Core.impactDropCount(collision.impact, robot.load);
      if (count > 0) {
        const dropped = dropTrash(count, collision.nx, collision.ny, robot);
        if (!dropped) return;
        robot.hitCooldown = C.collisionPenaltyCooldown; robot.load -= dropped;
        burst(robot.x, robot.y, "#ff765f", 13, 170);
        floatText(robot.x, robot.y - 30, "Dropped " + dropped + " items", "#d83d36"); tone(150, .16, "sawtooth", .055, 85);
      }
    }
  }

  function resolveAll(axis, preVx, preVy, robot) {
    let strongest = null, r = C.robotRadius;
    if (robot.x < room.left + r) { const impact = Math.max(0, -preVx); robot.x = room.left + r; robot.vx = Math.max(0, robot.vx) * .12; strongest = hitInfo(impact, 1, 0, false); }
    if (robot.x > room.right - r) { const impact = Math.max(0, preVx); robot.x = room.right - r; robot.vx = Math.min(0, robot.vx) * .12; strongest = hitInfo(impact, -1, 0, false); }
    if (robot.y < room.top + r) { const impact = Math.max(0, -preVy); robot.y = room.top + r; robot.vy = Math.max(0, robot.vy) * .12; strongest = hitInfo(impact, 0, 1, false); }
    if (robot.y > room.bottom - r) { const impact = Math.max(0, preVy); robot.y = room.bottom - r; robot.vy = Math.min(0, robot.vy) * .12; strongest = hitInfo(impact, 0, -1, false); }

    for (let i = 0; i < furniture.length; i++) {
      const f = furniture[i], qx = Core.clamp(robot.x, f.x, f.x + f.w), qy = Core.clamp(robot.y, f.y, f.y + f.h);
      let dx = robot.x - qx, dy = robot.y - qy, d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      let nx, ny, overlap;
      if (d2 > .0001) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; overlap = r - d; }
      else {
        const dl = Math.abs(robot.x - f.x), dr = Math.abs(f.x + f.w - robot.x), dt = Math.abs(robot.y - f.y), db = Math.abs(f.y + f.h - robot.y);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) { nx = -1; ny = 0; overlap = r + dl; } else if (m === dr) { nx = 1; ny = 0; overlap = r + dr; }
        else if (m === dt) { nx = 0; ny = -1; overlap = r + dt; } else { nx = 0; ny = 1; overlap = r + db; }
      }
      robot.x += nx * (overlap + .05); robot.y += ny * (overlap + .05);
      const into = robot.vx * nx + robot.vy * ny;
      if (into < 0) { robot.vx -= into * nx; robot.vy -= into * ny; }
      const impact = Math.max(0, -(preVx * nx + preVy * ny));
      const info = hitInfo(impact, nx, ny, true);
      if (!strongest || info.impact > strongest.impact) strongest = info;
    }
    return strongest;
  }
  function hitInfo(impact, nx, ny, isFurniture) { return { impact: impact, nx: nx, ny: ny, furniture: isFurniture }; }

  function collectTrash() {
    const pickR=C.robotRadius+C.trashRadius+4;
    for(let i=trash.length-1;i>=0;i--){
      const t=trash[i];if(t.lock>0)continue;
      let winner=null,nearest=pickR*pickR;
      // Nearest eligible player wins; exact ties alternate by item ID, not update order.
      for(let j=0;j<players.length;j++){
        const r=players[(j+(t.id||0))%players.length];if(r.load>=C.maxLoad)continue;
        const d=(r.x-t.x)**2+(r.y-t.y)**2;
        if(d<=nearest && (!winner||d<nearest)){winner=r;nearest=d;}
      }
      if(winner){trash.splice(i,1);winner.load++;burst(t.x,t.y,t.color,7,100);
        floatText(t.x,t.y-12,"+1",winner.id?"#285db1":"#226b51");tone(520+winner.load*8,.055,"sine",.035,760);}
    }
  }
  function checkRecycle(robot = players[0]) {
    if(!isRunning())return;
    const recycle=stations[robot.id];
    const inside=robot.x>recycle.x && robot.x<recycle.x+recycle.w && robot.y>recycle.y && robot.y<recycle.y+recycle.h;
    if(inside && !robot.recycleInside && robot.load>0){
      const gained=Core.deliveryScore(robot.load),mult=Core.multiplierForLoad(robot.load);
      robot.load=0;robot.score+=gained;robot.vx*=.78;robot.vy*=.78;
      floatText(recycle.x+recycle.w/2,recycle.y-5,"+"+gained+" ×"+mult,robot.id?"#285db1":"#147a54");
      burst(robot.x,robot.y,robot.color,24,190);tone(420,.28,"triangle",.07,980);
    }
    robot.recycleInside=inside;
  }

  function validTrashSpot(x, y, margin) {
    margin = margin || C.trashRadius + C.robotRadius;
    if (x < room.left + margin || x > room.right - margin || y < room.top + margin || y > room.bottom - margin) return false;
    for (let i=0;i<players.length;i++){const s=stations[i];if(circleRectOverlap(x,y,margin,s.x-34,s.y-34,s.w+68,s.h+68))return false;}
    for (let i = 0; i < furniture.length; i++) {
      const f = furniture[i]; if (circleRectOverlap(x, y, margin, f.x, f.y, f.w, f.h)) return false;
    }
    return true;
  }
  function circleRectOverlap(x, y, radius, rx, ry, rw, rh) {
    const qx = Core.clamp(x, rx, rx + rw), qy = Core.clamp(y, ry, ry + rh);
    const dx = x - qx, dy = y - qy; return dx * dx + dy * dy < radius * radius;
  }
  function spawnTrash(initial, lock) {
    const paired=mode==="duel" && !lock, amount=paired?2:1;
    const cap=mode==="duel"?C.duelMaxWorldTrash:C.maxWorldTrash;
    if(trash.length+amount>cap)return false;
    for(let i=0;i<C.maxSpawnAttempts;i++){
      const x=paired?room.left+44+Math.random()*360:room.left+44+Math.random()*(room.right-room.left-88);
      const y=room.top+68+Math.random()*(room.bottom-room.top-112), mirror=C.width-x;
      if(!validTrashSpot(x,y,28)||(paired&&!validTrashSpot(mirror,y,28)))continue;
      if(!initial&&players.some(r=>(x-r.x)**2+(y-r.y)**2<14400 || paired&&(mirror-r.x)**2+(y-r.y)**2<14400))continue;
      trash.push(makeTrash(x,y,lock||0));if(paired)trash.push(makeTrash(mirror,y,0));return true;
    }
    return false;
  }
  function makeTrash(x, y, lock) {
    const colors = ["#ff765f", "#f1b83e", "#5e9ee6", "#9b79dc"];
    return { id: nextTrashId++, x: x, y: y, lock: lock || 0, color: colors[nextTrashId % colors.length], spin: Math.random() * 6.28, kind: nextTrashId % 3 };
  }
  function dropTrash(count, nx, ny, robot = players[0]) {
    let dropped = 0;
    for (let i = 0; i < count && trash.length < (mode==="duel"?C.duelMaxWorldTrash:C.maxWorldTrash); i++) {
      let placed = false;
      for (let a = 0; a < C.maxSpawnAttempts; a++) {
        const angle = Math.atan2(ny, nx) + (Math.random() - .5) * 2.4;
        const dist = 42 + Math.random() * 52;
        const x = robot.x + Math.cos(angle) * dist, y = robot.y + Math.sin(angle) * dist;
        if (validTrashSpot(x, y, 22)) { trash.push(makeTrash(x, y, C.droppedPickupDelay)); placed = true; break; }
      }
      if (!placed) placed = spawnTrash(true, C.droppedPickupDelay);
      if (placed) dropped++;
    }
    return dropped;
  }

  function updateEffects(dt) {
    for(const robot of players){
    const speed = Math.hypot(robot.vx, robot.vy), ratio = Core.loadRatio(robot.load);
    if (ratio > .35 && speed > 80 && trails.length < 36 && Math.random() < dt * (7 + ratio * 12)) {
      trails.push({ x: robot.x - Math.cos(robot.angle) * 23, y: robot.y - Math.sin(robot.angle) * 23, life: .48, max: .48, size: 4 + ratio * 7 });
    }
    }
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; } }
    for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; f.y -= 34 * dt; if (f.life <= 0) floaters.splice(i, 1); }
    for (let i = trails.length - 1; i >= 0; i--) { trails[i].life -= dt; if (trails[i].life <= 0) trails.splice(i, 1); }
  }
  function burst(x, y, color, count, speed) {
    const roomLeft = Math.max(0, 90 - particles.length), n = Math.min(count, roomLeft);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (.35 + Math.random() * .65); particles.push({ x:x, y:y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:.25+Math.random()*.3, max:.55, color:color, size:2+Math.random()*4 }); }
  }
  function floatText(x, y, text, color) { if (floaters.length < 12) floaters.push({ x:x, y:y, text:text, color:color, life:1.05, max:1.05 }); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function updateHud() {
    el("gameHud").classList.toggle("time-warning",!training&&timeLeft<=10);
    ui.time.textContent=training?"∞":String(Math.ceil(timeLeft));el("timerLabel").textContent=training?"Free practice":"Time left";
    el("modeHud").textContent=mode==="duel"?"Versus":"Solo challenge";
    el("modeHud").textContent+=" · "+roomThemes[activeScene].name;
    el("p1Label").textContent=(mode==="duel"?"P1 · WASD · ":"")+robot.name;
    el("p2Label").textContent="P2 · ↑↓←→ · "+robot2.name;
    players.forEach((r,i)=>{
      const suffix=i?"2":"";el("score"+suffix+"Hud").textContent=r.score;
      el("load"+suffix+"Hud").textContent=r.load+" / "+C.maxLoad;
      el("mult"+suffix+"Hud").textContent="×"+Core.multiplierForLoad(r.load);
      el("load"+suffix+"Hud").classList.toggle("heavy",r.load>=16);
    });
  }

  function render() {
    if (portrait) ctx.setTransform(0, canvas.height / C.width, -canvas.width / C.height, 0, canvas.width, 0);
    else ctx.setTransform(canvas.width / C.width, 0, 0, canvas.height / C.height, 0, 0);
    drawFloor(); players.forEach(r=>drawRecycle(stations[r.id],r.id));
    for (let i = 0; i < trails.length; i++) drawTrail(trails[i]);
    for (let i = 0; i < furniture.length; i++) drawFurniture(furniture[i]);
    for (let i = 0; i < trash.length; i++) drawTrash(trash[i]);
    players.forEach(drawRobot);
    pets.forEach(drawPet);
    if(training && state!=="tutorial-done")drawGuide();
    for (let i = 0; i < particles.length; i++) drawParticle(particles[i]);
    for (let i = 0; i < floaters.length; i++) drawFloater(floaters[i]);
    if (debug) drawDebug();
  }
  function drawFloor() {
    ctx.fillStyle = roomThemes[activeScene].floor; ctx.fillRect(0, 0, C.width, C.height);
    ctx.strokeStyle = roomThemes[activeScene].line; ctx.lineWidth = 1;
    for (let x = 18; x < C.width; x += 48) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, 582); ctx.stroke(); }
    for (let y = 18; y < C.height; y += 48) { ctx.beginPath(); ctx.moveTo(18, y); ctx.lineTo(942, y); ctx.stroke(); }
    ctx.strokeStyle = roomThemes[activeScene].wall; ctx.lineWidth = 18; ctx.strokeRect(9, 9, 942, 582);
    ctx.strokeStyle = "#f8fffa"; ctx.lineWidth = 3; ctx.strokeRect(19, 19, 922, 562);
  }
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w/2, h/2); ctx.beginPath(); ctx.moveTo(x+rr,y); ctx.arcTo(x+w,y,x+w,y+h,rr); ctx.arcTo(x+w,y+h,x,y+h,rr); ctx.arcTo(x,y+h,x,y,rr); ctx.arcTo(x,y,x+w,y,rr); ctx.closePath();
  }
  function screenText(text,x,y,font,color) {
    ctx.save();ctx.translate(x,y);if(portrait)ctx.rotate(-Math.PI/2);
    ctx.font=font;ctx.textAlign="center";ctx.fillStyle=color;ctx.fillText(text,0,0);ctx.restore();
  }
  function drawRecycle(recycle,id) {
    ctx.save();ctx.shadowColor="rgba(27,125,88,.25)";ctx.shadowBlur=14;
    ctx.fillStyle=id?"#8cbfff":"#54daa6";roundRect(recycle.x,recycle.y,recycle.w,recycle.h,18);ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle="#173e37";ctx.lineWidth=5;ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,.3)";roundRect(recycle.x+11,recycle.y+11,recycle.w-22,recycle.h-22,12);ctx.fill();
    const cx=recycle.x+recycle.w/2,cy=recycle.y+recycle.h/2;
    ctx.translate(cx,cy);if(portrait)ctx.rotate(-Math.PI/2);
    ctx.fillStyle="#153f38";ctx.font="900 17px Segoe UI, sans-serif";ctx.textAlign="center";
    ctx.fillText(mode==="duel"?"P"+(id+1)+" BASE":"RECYCLE",0,34);
    ctx.font="900 43px Segoe UI Symbol, sans-serif";ctx.fillText("♻",0,7);ctx.restore();
  }
  function drawGuide() {
    let targets=guideStep===0?[{x:255,y:292}]:guideStep===1?trash:[{x:118,y:500}];
    ctx.save();ctx.strokeStyle="#1a8861";ctx.lineWidth=3;ctx.setLineDash([7,6]);
    targets.forEach(t=>{ctx.beginPath();ctx.arc(t.x,t.y,35+Math.sin(simTime*4)*3,0,Math.PI*2);ctx.stroke();});
    ctx.setLineDash([]);ctx.restore();
  }
  function drawFurniture(f) {
    ctx.save(); ctx.shadowColor = "rgba(20,37,54,.20)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5;
    ctx.fillStyle = f.color; roundRect(f.x,f.y,f.w,f.h, f.type === "plant" ? 28 : 12); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "#274153"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 3;
    if (f.type === "sofa") { ctx.beginPath(); ctx.moveTo(f.x+16,f.y+f.h*.55); ctx.lineTo(f.x+f.w-16,f.y+f.h*.55); ctx.stroke(); ctx.beginPath(); ctx.moveTo(f.x+f.w/2,f.y+8); ctx.lineTo(f.x+f.w/2,f.y+f.h*.55); ctx.stroke(); }
    else if (f.type === "desk" || f.type === "table") { roundRect(f.x+14,f.y+14,f.w-28,f.h-28,7); ctx.stroke(); }
    else if (f.type === "shelf") { for(let y=f.y+22;y<f.y+f.h;y+=20){ctx.beginPath();ctx.moveTo(f.x+8,y);ctx.lineTo(f.x+f.w-8,y);ctx.stroke();} }
    else { ctx.fillStyle="#277650"; ctx.beginPath();ctx.arc(f.x+f.w/2,f.y+f.h*.36,24,0,7);ctx.fill(); ctx.fillStyle="#e6aa65";roundRect(f.x+15,f.y+f.h*.57,f.w-30,f.h*.31,8);ctx.fill(); }
    if(f.type==="bed"){
      ctx.fillStyle="#fff7e9";roundRect(f.x+15,f.y+14,f.w-30,35,8);ctx.fill();ctx.fillStyle="#8972b5";roundRect(f.x+8,f.y+62,f.w-16,f.h-70,8);ctx.fill();
    }else if(f.type==="stove"||f.type==="counter"){
      ctx.fillStyle="#f6f3e9";roundRect(f.x+8,f.y+8,f.w-16,f.h-16,6);ctx.fill();
      if(f.type==="stove"){ctx.strokeStyle="#4e6772";ctx.lineWidth=4;for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(f.x+48+(i%2)*90,f.y+29+Math.floor(i/2)*37,12,0,Math.PI*2);ctx.stroke();}}
      else{ctx.fillStyle="#a6bf84";roundRect(f.x+20,f.y+22,f.w-40,40,5);ctx.fill();ctx.fillStyle="#ed9468";ctx.beginPath();ctx.arc(f.x+f.w/2,f.y+42,9,0,7);ctx.fill();}
    }
    ctx.restore();
  }
  function drawTrash(t) {
    ctx.save(); ctx.translate(t.x,t.y); ctx.rotate(t.spin); ctx.globalAlpha = t.lock > 0 ? .65 : 1;
    ctx.fillStyle = "rgba(20,37,54,.18)"; ctx.beginPath();ctx.ellipse(2,7,11,6,0,0,7);ctx.fill();
    ctx.fillStyle=t.color; ctx.strokeStyle="#243b4c";ctx.lineWidth=2.5;
    if(t.kind===0){roundRect(-8,-9,16,18,3);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-4,-12);ctx.lineTo(4,-12);ctx.stroke();}
    else if(t.kind===1){ctx.beginPath();ctx.moveTo(-9,-6);ctx.lineTo(7,-9);ctx.lineTo(10,7);ctx.lineTo(-5,10);ctx.closePath();ctx.fill();ctx.stroke();}
    else {ctx.beginPath();ctx.arc(0,0,9,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle="rgba(255,255,255,.7)";ctx.beginPath();ctx.arc(-2,-1,4,0,4.5);ctx.stroke();}
    ctx.restore();
  }
  function drawPet(p) {
    const cat=p.kind==="cat",color=cat?"#f2ba75":"#bd885f";
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.fillStyle="rgba(20,37,54,.18)";ctx.beginPath();ctx.ellipse(0,8,25,14,0,0,7);ctx.fill();
    ctx.strokeStyle="#513d36";ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(-29,Math.sin(simTime*9)*8);ctx.lineTo(-32,-8);ctx.stroke();
    ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(-4,0,20,14,0,0,7);ctx.fill();ctx.stroke();
    for(const side of [-1,1]){
      ctx.beginPath();ctx.ellipse(10,side*14,cat?6:10,cat?8:6,cat?side*.4:0,0,7);ctx.fill();ctx.stroke();
    }
    ctx.beginPath();ctx.arc(13,0,13,0,7);ctx.fill();ctx.stroke();
    if(cat){ctx.beginPath();ctx.moveTo(7,-10);ctx.lineTo(17,-21);ctx.lineTo(21,-7);ctx.moveTo(7,10);ctx.lineTo(17,21);ctx.lineTo(21,7);ctx.fill();ctx.stroke();}
    ctx.fillStyle="#fff4df";ctx.beginPath();ctx.ellipse(22,0,7,8,0,0,7);ctx.fill();
    ctx.fillStyle="#392d2c";for(const side of [-1,1]){ctx.beginPath();ctx.arc(17,side*6,2,0,7);ctx.fill();}
    ctx.beginPath();ctx.arc(27,0,3,0,7);ctx.fill();ctx.restore();
    if(p.action==="warning"){
      ctx.save();ctx.strokeStyle="#d98c31";ctx.lineWidth=3;ctx.setLineDash([6,5]);
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(p.angle)*150,p.y+Math.sin(p.angle)*150);ctx.stroke();ctx.restore();
      screenText("!",p.x,p.y-32,"900 26px Segoe UI","#a55a23");
    }
  }
  function drawTrail(t) { ctx.save();ctx.globalAlpha=(t.life/t.max)*.25;ctx.fillStyle="#e05950";ctx.beginPath();ctx.arc(t.x,t.y,t.size,0,7);ctx.fill();ctx.restore(); }
  function drawRobot(robot) {
    const ratio=Core.loadRatio(robot.load), bob=Math.sin(simTime*8)*1.2;
    ctx.save();ctx.translate(robot.x,robot.y+bob);ctx.rotate(robot.angle);
    ctx.fillStyle="rgba(20,37,54,.2)";ctx.beginPath();ctx.ellipse(-2,15,28+ratio*5,12,0,0,7);ctx.fill();
    if(ratio>.7){ctx.strokeStyle="rgba(232,76,62,.55)";ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,C.robotRadius+7+Math.sin(simTime*12)*2,0,7);ctx.stroke();}
    ctx.fillStyle=lerpColor(robot.color,"#ff806a",ratio*.75);ctx.strokeStyle="#173749";ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,C.robotRadius,0,7);ctx.fill();ctx.stroke();
    ctx.fillStyle="#173749";roundRect(4,-11,20,22,8);ctx.fill();
    ctx.fillStyle="#eafdf7";ctx.beginPath();ctx.arc(15,-4,3,0,7);ctx.arc(15,5,3,0,7);ctx.fill();
    ctx.strokeStyle="#173749";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-7,-20);ctx.lineTo(-7,-28);ctx.stroke();ctx.fillStyle="#ffd45a";ctx.beginPath();ctx.arc(-7,-30,4,0,7);ctx.fill();ctx.stroke();
    if(robot.load){ctx.fillStyle="#173749";ctx.font="900 12px Segoe UI";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(robot.load),-6,1);}
    ctx.restore();
    if(mode==="duel")screenText("P"+(robot.id+1),robot.x,robot.y-39,"900 16px Segoe UI",robot.id?"#225fba":"#176647");
  }
  function lerpColor(a,b,t){const ar=parseInt(a.slice(1),16),br=parseInt(b.slice(1),16);const r=Math.round(((ar>>16)&255)*(1-t)+((br>>16)&255)*t),g=Math.round(((ar>>8)&255)*(1-t)+((br>>8)&255)*t),bl=Math.round((ar&255)*(1-t)+(br&255)*t);return "rgb("+r+","+g+","+bl+")";}
  function drawParticle(p){ctx.save();ctx.globalAlpha=Math.min(1,p.life/.18);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,7);ctx.fill();ctx.restore();}
  function drawFloater(f){ctx.save();ctx.translate(f.x,f.y);if(portrait)ctx.rotate(-Math.PI/2);ctx.globalAlpha=Math.min(1,f.life/.25);ctx.font="900 19px Segoe UI, sans-serif";ctx.textAlign="center";ctx.lineWidth=4;ctx.strokeStyle="rgba(255,255,255,.9)";ctx.strokeText(f.text,0,0);ctx.fillStyle=f.color;ctx.fillText(f.text,0,0);ctx.restore();}
  function drawDebug(){ctx.save();ctx.strokeStyle="#ff00aa";ctx.lineWidth=1;ctx.beginPath();ctx.arc(robot.x,robot.y,C.robotRadius,0,7);ctx.stroke();ctx.fillStyle="#142536";ctx.font="12px monospace";ctx.fillText("v="+Math.hypot(robot.vx,robot.vy).toFixed(1),24,570);ctx.restore();}

  function frame(now) {
    const delta = Math.min(C.maxFrameDelta, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    if (isRunning()) {
      accumulator += delta;
      while (accumulator >= C.fixedStep && isRunning()) { update(C.fixedStep); accumulator -= C.fixedStep; }
    } else accumulator = 0;
    if(state!=="home" && state!=="leaderboard")render(); requestAnimationFrame(frame);
  }
  function resizeCanvas(silent = false) {
    const nextPortrait = window.matchMedia("(max-width: 600px) and (orientation: portrait)").matches;
    if (portrait !== nextPortrait) { clearInput(); if(silent!==true)pauseGame("Screen orientation changed. Select Resume to continue."); }
    portrait = nextPortrait;
    document.getElementById("gameShell").classList.toggle("portrait", portrait);
    const box = canvas.getBoundingClientRect();
    const dpr=Math.min(2,window.devicePixelRatio||1), w=Math.max(1,Math.round(box.width*dpr)),h=Math.max(1,Math.round(box.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  }

  const keyMap={ArrowUp:"up",KeyW:"up",ArrowDown:"down",KeyS:"down",ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right"};
  window.addEventListener("keydown",function(e){
    if(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
    if(keyMap[e.code]){if(isRunning()){heldCodes.add(e.code);e.preventDefault();}}
    else if((e.code==="Escape"||e.code==="KeyP")&&!e.repeat){if(isRunning())pauseGame();else if(state==="paused")resumeGame();}
  });
  window.addEventListener("keyup",function(e){if(keyMap[e.code])heldCodes.delete(e.code);});
  ui.touch.querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("pointerdown",function(e){e.preventDefault();if(!isRunning()||mode==="duel")return;btn.setPointerCapture(e.pointerId);pointerDirs.set(e.pointerId,btn.dataset.dir);btn.classList.add("active");});
    function release(e){pointerDirs.delete(e.pointerId);btn.classList.toggle("active",Array.from(pointerDirs.values()).includes(btn.dataset.dir));}
    btn.addEventListener("pointerup",release);btn.addEventListener("pointercancel",release);btn.addEventListener("lostpointercapture",release);
  });
  window.addEventListener("pointercancel",clearInput);
  window.addEventListener("blur",function(){if(isRunning())pauseGame("Paused automatically because the window lost focus.");else clearInput();});
  document.addEventListener("visibilitychange",function(){if(document.hidden){if(isRunning())pauseGame("Paused while you were away. Resume when you're ready.");else {clearInput();stopAudio();}}});
  window.addEventListener("resize",resizeCanvas);
  el("soloBtn").addEventListener("click",()=>requestGame("solo"));
  el("duelBtn").addEventListener("click",()=>requestGame("duel"));
  el("tutorialBtn").addEventListener("click",()=>{pendingMode="solo";saveNames();startTutorial();});
  el("skipTutorialBtn").addEventListener("click",leaveTutorial);
  el("tutorialPlayBtn").addEventListener("click",leaveTutorial);
  el("startBtn").addEventListener("click",startGame);
  el("restartBtn").addEventListener("click",()=>prepareGame(mode));
  el("resumeBtn").addEventListener("click",resumeGame);
  ["boardHomeBtn","readyHomeBtn","pauseHomeBtn","tutorialHomeBtn","resultHomeBtn"].forEach(id=>el(id).addEventListener("click",goHome));
  el("leaderboardBtn").addEventListener("click",()=>showLeaderboard("solo"));
  el("resultBoardBtn").addEventListener("click",()=>showLeaderboard(mode));
  el("soloBoardBtn").addEventListener("click",()=>showLeaderboard("solo"));
  el("duelBoardBtn").addEventListener("click",()=>showLeaderboard("duel"));
  ui.pauseBtn.addEventListener("click",function(){if(isRunning())pauseGame();else if(state==="paused")resumeGame();});
  ui.muteBtn.addEventListener("click",function(){muted=!muted;ui.muteBtn.textContent=muted?"×":"♪";ui.muteBtn.setAttribute("aria-label",muted?"Unmute":"Mute");ui.muteBtn.setAttribute("aria-pressed",String(muted));if(muted)stopAudio();else if(isRunning())initAudio();});
  el("gameShell").addEventListener("contextmenu",e=>e.preventDefault());
  const savedNames=profile.names();el("p1Name").value=savedNames[0];el("p2Name").value=savedNames[1];
  ["sceneLiving","sceneBedroom","sceneKitchen"].forEach((id,i)=>el(id).addEventListener("click",()=>chooseScene(["living","bedroom","kitchen"][i])));
  goHome();Platform.loadingFinished();requestAnimationFrame(frame);
})();
