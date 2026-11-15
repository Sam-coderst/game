(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CleanerProfile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEY = "slipperyCleanerProfileV2", LIMIT = 10;
  function name(value, fallback) {
    let clean = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim() : "";
    clean = clean.replace(/^\u6e05\u6d01\u5de5(?= ?[12]?$)/, "Cleaner");
    return Array.from(clean || fallback || "Cleaner").slice(0, 12).join("");
  }
  function validScore(n) { return Number.isSafeInteger(n) && n >= 0 && n <= 1000000; }
  function cleanEntries(entries, mode) {
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    return entries.slice(0, 100).filter(e => {
      if (!e || typeof e.id !== "string" || seen.has(e.id) || !Number.isFinite(Date.parse(e.at)) ||
          !Array.isArray(e.players) || e.players.length !== (mode === "duel" ? 2 : 1) ||
          !e.players.every(p => p && validScore(p.score))) return false;
      seen.add(e.id); return true;
    }).map(e => ({id:e.id.slice(0,80),at:new Date(e.at).toISOString(),players:e.players.map((p,i)=>({name:name(p.name,"Cleaner "+(i+1)),score:p.score}))}))
      .sort((a,b)=>Math.max(...b.players.map(p=>p.score))-Math.max(...a.players.map(p=>p.score)) || Date.parse(a.at)-Date.parse(b.at))
      .slice(0,LIMIT);
  }
  function create(getStorage) {
    let available = true, serial = 0;
    const data = {tutorialSeen:false,names:["", ""],solo:[],duel:[],legacyBest:0};
    try {
      const store = getStorage(), saved = JSON.parse(store.getItem(KEY) || "null");
      if (saved && typeof saved === "object") {
        data.tutorialSeen = saved.tutorialSeen === true;
        data.names = [0,1].map(i=>typeof saved.names?.[i] === "string" ? name(saved.names[i],"") : "");
        data.solo = cleanEntries(saved.solo,"solo"); data.duel = cleanEntries(saved.duel,"duel");
      }
      const legacy = Number(store.getItem("slipperyCleanerBest"));
      if (validScore(legacy)) data.legacyBest = legacy;
    } catch (_) { available = false; }
    function save() {
      try { getStorage().setItem(KEY,JSON.stringify(data)); available = true; }
      catch (_) { available = false; }
      return available;
    }
    return {
      available:()=>available, tutorialSeen:()=>data.tutorialSeen,
      markTutorial(){data.tutorialSeen=true;save();}, names:()=>data.names.slice(),
      setNames(a,b){data.names=[name(a,"Cleaner 1"),name(b,"Cleaner 2")];save();return data.names.slice();},
      best:()=>Math.max(data.legacyBest,data.solo[0]?.players[0].score || 0),
      entries:mode=>cleanEntries(data[mode],mode),
      record(mode,players) {
        if (mode!=="solo" && mode!=="duel") return null;
        const entry={id:Date.now().toString(36)+"-"+(++serial)+"-"+Math.random().toString(36).slice(2,8),at:new Date().toISOString(),players};
        const valid=cleanEntries([entry],mode); if(!valid.length)return null;
        data[mode]=cleanEntries(data[mode].concat(valid),mode);save();
        return {id:entry.id,rank:data[mode].findIndex(e=>e.id===entry.id)+1,saved:available};
      }
    };
  }
  return {create,name,cleanEntries};
});
