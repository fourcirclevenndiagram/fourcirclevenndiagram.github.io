import { ArenaRenderer } from "./renderer.js";
import { Simulation, TEAM_NAMES, TEAM_COLORS } from "./simulation.js";

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const params=new URLSearchParams(location.search);
const FAST=params.get("fast")==="1";
const STORAGE_KEY="chaos-world-cup-v1";
const DEFAULTS={mapSize:100,quality:"auto",defaultSpeed:1,chaosFrequency:"normal",sound:true,vibration:true,autoCamera:true,debug:false,cheerTeam:-1,stats:{matches:0,wins:[0,0,0,0],scoreSum:[0,0,0,0],rankSum:[0,0,0,0],bestScore:0,biggestComeback:0,longest:0,shortest:0,recent:[]}};

function loadStore(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");if(!raw||typeof raw!=="object")return structuredClone(DEFAULTS);
    const v={...structuredClone(DEFAULTS),...raw};v.mapSize=[80,100,120].includes(+v.mapSize)?+v.mapSize:100;v.quality=["auto","low","medium","high"].includes(v.quality)?v.quality:"auto";v.defaultSpeed=[1,2,4].includes(+v.defaultSpeed)?+v.defaultSpeed:1;v.chaosFrequency=["low","normal","high"].includes(v.chaosFrequency)?v.chaosFrequency:"normal";if(!v.stats||!Array.isArray(v.stats.wins)||v.stats.wins.length!==4)v.stats=structuredClone(DEFAULTS.stats);for(const key of ["wins","scoreSum","rankSum"])v.stats[key]=(Array.isArray(v.stats[key])?v.stats[key]:[0,0,0,0]).slice(0,4).map(n=>Number.isFinite(+n)?Math.max(0,+n):0);for(const key of ["matches","bestScore","biggestComeback","longest","shortest"])v.stats[key]=Number.isFinite(+v.stats[key])?Math.max(0,+v.stats[key]):0;v.stats.recent=Array.isArray(v.stats.recent)?v.stats.recent.slice(0,20):[];return v;
  }catch{return structuredClone(DEFAULTS)}
}
let prefs=loadStore();
const saveStore=()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(prefs))}catch{}}

class AudioDirector {
  constructor(){this.ctx=null;this.master=null;this.music=null;this.enabled=prefs.sound;this.nextBeat=0;this.beat=0;this.mode="calm";}
  async unlock(){if(this.ctx){if(this.ctx.state==="suspended")await this.ctx.resume();return true}try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;this.ctx=new AC();this.master=this.ctx.createGain();this.master.gain.value=this.enabled?.22:0;this.master.connect(this.ctx.destination);this.music=this.ctx.createGain();this.music.gain.value=.18;this.music.connect(this.master);this.nextBeat=this.ctx.currentTime;return true}catch{return false}}
  setEnabled(v){this.enabled=v;if(this.master&&this.ctx)this.master.gain.setTargetAtTime(v?.22:0,this.ctx.currentTime,.04)}
  tone(freq,duration=.12,type="sine",gain=.18,slide=1){if(!this.ctx||!this.enabled)return;const now=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),now+duration);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(gain,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g).connect(this.master);o.start(now);o.stop(now+duration+.02)}
  noise(duration=.12,gain=.1){if(!this.ctx||!this.enabled)return;const len=Math.ceil(this.ctx.sampleRate*duration),buf=this.ctx.createBuffer(1,len,this.ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);const src=this.ctx.createBufferSource(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();src.buffer=buf;f.type="lowpass";f.frequency.value=900;g.gain.value=gain;src.connect(f).connect(g).connect(this.master);src.start()}
  event(e){if(!this.ctx||!this.enabled)return;const m={TOWER_CAPTURE:[660,.2,"triangle",.22,1.5],CRYSTAL_PICKUP:[880,.18,"sine",.2,1.45],CRYSTAL_STEAL:[520,.34,"sawtooth",.22,1.8],CRYSTAL_SCORE:[740,.55,"triangle",.26,2],BOSS_SPAWN:[82,.8,"sawtooth",.28,.55],BOSS_DEFEATED:[210,.7,"square",.25,2.5],CORE_SHIELD_BREAK:[120,.48,"square",.26,.45],CORE_DESTROYED:[70,.9,"sawtooth",.3,.35],LEADER_CHANGE:[560,.3,"triangle",.22,1.7],METEOR_HIT:[62,.55,"sawtooth",.32,.3],OVERTIME:[180,.8,"square",.27,2],MATCH_END:[330,.9,"triangle",.25,2.2],FINAL_10:[470,.35,"square",.2,1.4],CHAOS_WARNING:[230,.25,"sawtooth",.18,.72],RULE_CHANGE:[490,.25,"triangle",.18,1.4]};if(m[e.type]){this.tone(...m[e.type]);if(["METEOR_HIT","CORE_DESTROYED","BOSS_DEFEATED"].includes(e.type))this.noise(.35,.2)}else if(e.type==="UNIT_KILL")this.tone(150,.07,"square",.05,.7);}
  update(s){if(!this.ctx||!this.enabled||this.ctx.state!=="running"||!s)return;this.mode=s.overtime?"overtime":s.remaining<=30?"final":s.boss.active?"boss":"calm";const now=this.ctx.currentTime;if(now<this.nextBeat)return;const bpm={calm:96,boss:124,final:142,overtime:158}[this.mode],step=60/bpm/2,scale=this.mode==="boss"?[55,82,110,98]:[110,165,220,247,220,165,147,165],freq=scale[this.beat%scale.length];const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=this.mode==="calm"?"triangle":"sawtooth";o.frequency.value=freq;g.gain.setValueAtTime(.018,now);g.gain.exponentialRampToValueAtTime(.0001,now+step*.72);o.connect(g).connect(this.music);o.start(now);o.stop(now+step);if(this.beat%4===0)this.tone(freq/2,.09,"sine",.035,.8);this.beat++;this.nextBeat=now+step;}
}

const audio=new AudioDirector();
let renderer=null,worker=null,fallback=null,fallbackAccumulator=0,lastFrame=performance.now();
let snapshot=null,paused=false,speed=prefs.defaultSpeed,resultShown=false,resultTimer=null,resultHold=false,chaosLeft=3,round=0,currentSeed=0,workerReady=false,usingFallback=false,lastCountdown=-1,lastHud=0,commentQueue=[],lastCommentAt=0,toastTimer=null;

function setBoot(text,progress){$("bootText").textContent=text;$("bootProgress").style.width=`${progress}%`;}
function toast(text){const t=$("toast");t.textContent=text;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),1900);}

async function boot(){
  setBoot("기기 성능을 확인하는 중…",18);await delay(180);
  const weak=(navigator.hardwareConcurrency||4)<=4||(navigator.deviceMemory||4)<=3;if(prefs.quality==="auto"&&weak)document.documentElement.dataset.performance="low";
  setBoot("WebGL 경기장을 구성하는 중…",42);renderer=new ArenaRenderer($("arena"),{quality:prefs.quality});await delay(180);
  setBoot("전략 AI와 길찾기를 분리하는 중…",67);setupWorker();await delay(180);
  initUI();setBoot("첫 시드를 생성하는 중…",88);await delay(180);
  $("hud").hidden=false;$("arenaWrap").hidden=false;$("controls").hidden=false;startMatch();
  setBoot("경기 준비 완료",100);await delay(260);$("boot").classList.add("done");
  requestAnimationFrame(frame);
  if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
  if(params.has("benchmark"))runBenchmark(clamp(+params.get("benchmark")||12,4,40));
}

function setupWorker(){
  if(!window.Worker){switchToFallback();return}
  try{
    worker=new Worker(new URL("./simulation-worker.js",import.meta.url),{type:"module"});
    worker.onmessage=({data})=>{if(data.type==="ready"){workerReady=true;handleSnapshot(data.snapshot)}else if(data.type==="snapshot")handleSnapshot(data.snapshot);else if(data.type==="chaosResult"&&!data.accepted){chaosLeft++;updateChaosButton();toast("다른 사건 예고가 끝난 뒤 다시 투입하세요")}else if(data.type==="benchmark")showBenchmark(data.result);else if(data.type==="error"){console.warn(data.message);if(!workerReady)switchToFallback();}};
    worker.onerror=e=>{e.preventDefault();if(!workerReady)switchToFallback()};
  }catch{switchToFallback()}
}
function switchToFallback(){if(usingFallback)return;usingFallback=true;worker?.terminate();worker=null;workerReady=false;toast("호환 모드로 시뮬레이션을 실행합니다");if(currentSeed)createFallback(currentSeed)}
function createFallback(seed){fallback=new Simulation(matchConfig(seed));fallbackAccumulator=0;handleSnapshot(fallback.snapshot(true));}

function matchConfig(seed){const weak=document.documentElement.dataset.performance==="low",perTeam=prefs.mapSize===120&&weak?24:prefs.quality==="high"?40:prefs.mapSize===80?28:32;return{size:prefs.mapSize,unitsPerTeam:perTeam,duration:FAST?75:300,seed,chaosFrequency:prefs.chaosFrequency,speed,fast:FAST}}
function randomSeed(){return globalThis.crypto?.getRandomValues?globalThis.crypto.getRandomValues(new Uint32Array(1))[0]:((Date.now()^Math.random()*0xffffffff)>>>0)}
function startMatch(seedValue=null){
  clearInterval(resultTimer);round++;resultShown=false;resultHold=false;paused=false;chaosLeft=3;speed=prefs.defaultSpeed;currentSeed=seedValue==null?randomSeed():(+seedValue>>>0);lastCountdown=-1;commentQueue.length=0;$("commentary").replaceChildren();$("results").hidden=true;$("hud").hidden=false;$("arenaWrap").hidden=false;$("controls").hidden=false;$("phaseLabel").textContent=`ROUND ${String(round).padStart(2,"0")}`;$("pauseBtn").querySelector("span").textContent="Ⅱ";$("pauseBtn").querySelector("small").textContent="정지";updateSpeedButton();updateChaosButton();renderer.setMode(prefs.autoCamera?"auto":"full");
  const config=matchConfig(currentSeed);if(usingFallback)createFallback(currentSeed);else if(worker){worker.postMessage({type:workerReady?"newMatch":"init",config});setTimeout(()=>{if(!workerReady&&!usingFallback)switchToFallback()},2600)}else switchToFallback();
}

function handleSnapshot(s){
  snapshot=s;renderer.setSnapshot(s);const now=performance.now();if(now-lastHud>90){updateHUD(s);lastHud=now}
  for(const e of s.events||[])processEvent(e);
  if(s.phase==="COUNTDOWN"){const n=Math.ceil(s.countdown);if(n!==lastCountdown){lastCountdown=n;const c=$("countdown");c.textContent=n>0?n:"GO";c.classList.remove("show");void c.offsetWidth;c.classList.add("show")}}
  if(s.ended&&!resultShown){resultShown=true;setTimeout(()=>showResults(s.result),1500)}
}

function updateHUD(s){
  $("timer").textContent=formatTime(s.remaining);$("speedBadge").textContent=`×${speed}`;$("ruleName").textContent=s.rule.name;$("ruleTimer").textContent=s.rule.warning?`변경 임박`: `변경 ${Math.ceil(s.rule.remaining)}초`;
  const sorted=s.teams.slice().sort((a,b)=>a.rank-b.rank),maxTerr=Math.max(1,...s.teams.map(t=>t.territory));for(const el of $("scoreboard").children){const t=s.teams[+el.dataset.team];el.classList.toggle("leader",t.rank===1);el.querySelector(".rank").textContent=t.rank;el.querySelector("strong").textContent=t.score.toLocaleString();el.querySelector("small").textContent=t.strategy;el.style.setProperty("--territory",`${t.territory/maxTerr*100}%`)}
  const cs=s.crystal;if(cs.active){if(cs.carrier>=0){const team=s.units[cs.carrier]?.[4];$("crystalStatus").textContent=`◇ 수정: ${TEAM_NAMES[team]||"중립"} 운반 중`;$("crystalStatus").style.color=TEAM_COLORS[team]||"#fff"}else{$("crystalStatus").textContent="◇ 수정: 회수 가능";$("crystalStatus").style.color="#e7efff"}}else{$("crystalStatus").textContent=`◇ 수정: ${Math.ceil(cs.respawn)}초 후`;$("crystalStatus").style.color=""}
  $("bossStatus").hidden=!s.boss.active;if(s.boss.active){$("bossStatus").textContent=`${s.boss.name} ${Math.max(0,Math.round(s.boss.hp/s.boss.maxHp*100))}%`;$("bossStatus").style.color="#f078df"}
  $("worldTint").className=`world-tint${s.chaos.blackout?" blackout":""}${s.chaos.flood?" flood":""}`;
  if(prefs.debug){const rs=renderer.getStats();$("debugPanel").textContent=`${rs.backend}  FPS ${rs.fps.toFixed(0)}\nTPS 20 × ${speed}  TICK ${s.debug.tick}\nUNITS ${s.debug.alive}/${s.units.length}  GHOST ${s.debug.ghosts}\nPARTICLES ${rs.particles}/${renderer.maxParticles}\nFLOW CACHE ${s.debug.flowFields}  MAP v${s.debug.pathVersion}\nSEED ${s.seed}\n${s.teams.map(t=>`${TEAM_NAMES[t.id]}: ${t.strategy} [${t.priority}]`).join("\n")}`;}
}
function formatTime(v){v=Math.max(0,Math.ceil(v));return`${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`}

function processEvent(e){
  if(e.text&&e.importance>=25)queueComment(e);if(e.headline)showHeadline(e.headline,e.subtitle||e.text,e.team,e.warning);audio.event(e);
  if(prefs.vibration&&navigator.vibrate&&["METEOR_HIT","CORE_DESTROYED","MATCH_END","CRYSTAL_SCORE"].includes(e.type))navigator.vibrate(e.type==="CORE_DESTROYED"?[45,35,90]:35);
}
function queueComment(e){commentQueue.push(e);if(commentQueue.length>7)commentQueue.shift();flushComments()}
function flushComments(){const now=performance.now();if(now-lastCommentAt<650||!commentQueue.length){if(commentQueue.length)setTimeout(flushComments,680);return}const e=commentQueue.shift(),box=$("commentary"),p=document.createElement("p");p.textContent=e.text;p.style.setProperty("--event-color",e.team>=0?TEAM_COLORS[e.team]:e.warning?"#ff5577":"#9a80ff");for(const old of box.children)old.classList.add("old");box.append(p);while(box.children.length>2)box.firstElementChild.remove();lastCommentAt=now;}
function showHeadline(title,subtitle,team=-1,warning=false){const h=$("headline");h.querySelector("strong").textContent=title;h.querySelector("span").textContent=subtitle||"";h.style.setProperty("--headline",team>=0?TEAM_COLORS[team]:warning?"#ff466b":"#a981ff");h.classList.remove("show");void h.offsetWidth;h.classList.add("show")}

function initUI(){
  const board=$("scoreboard");for(let t=0;t<4;t++){const d=document.createElement("div");d.className="team-score";d.dataset.team=t;d.style.setProperty("--c",TEAM_COLORS[t]);d.innerHTML=`<div class="team-top"><span class="rank">${t+1}</span><span>${TEAM_NAMES[t]}</span></div><strong>0</strong><small>영토 확장</small>`;board.append(d)}
  $("mapSize").value=String(prefs.mapSize);$("quality").value=prefs.quality;$("defaultSpeed").value=String(prefs.defaultSpeed);$("chaosFrequency").value=prefs.chaosFrequency;$("soundToggle").checked=prefs.sound;$("vibrationToggle").checked=prefs.vibration;$("autoCameraToggle").checked=prefs.autoCamera;$("debugToggle").checked=prefs.debug;$("debugPanel").hidden=!prefs.debug;
  $("pauseBtn").addEventListener("click",togglePause);$("speedBtn").addEventListener("click",cycleSpeed);$("mapBtn").addEventListener("click",()=>{renderer.resetFull();$("cameraBtn").classList.remove("active");toast("전체 지도를 표시합니다")});$("cameraBtn").addEventListener("click",toggleCamera);$("teamBtn").addEventListener("click",cycleTeam);$("chaosBtn").addEventListener("click",injectChaos);$("settingsBtn").addEventListener("click",openSettings);$("closeSettings").addEventListener("click",closeSettings);$("sheetShade").addEventListener("click",closeSettings);
  $("nextBtn").addEventListener("click",()=>startMatch());$("replayBtn").addEventListener("click",()=>startMatch(currentSeed));$("holdResultBtn").addEventListener("click",()=>{resultHold=!resultHold;$("holdResultBtn").textContent=resultHold?"자동 진행 다시 켜기":"자동 진행 정지";toast(resultHold?"결과 화면을 유지합니다":"자동 다음 경기를 재개합니다")});
  $("mapSize").addEventListener("change",e=>{prefs.mapSize=+e.target.value;saveStore();toast("다음 경기부터 적용됩니다")});$("quality").addEventListener("change",e=>{prefs.quality=e.target.value;renderer.setQuality(prefs.quality);saveStore();toast("그래픽 품질을 적용했습니다")});$("defaultSpeed").addEventListener("change",e=>{prefs.defaultSpeed=+e.target.value;saveStore()});$("chaosFrequency").addEventListener("change",e=>{prefs.chaosFrequency=e.target.value;saveStore();toast("다음 경기부터 적용됩니다")});
  $("soundToggle").addEventListener("change",e=>{prefs.sound=e.target.checked;audio.setEnabled(prefs.sound);saveStore()});$("vibrationToggle").addEventListener("change",e=>{prefs.vibration=e.target.checked;saveStore()});$("autoCameraToggle").addEventListener("change",e=>{prefs.autoCamera=e.target.checked;renderer.setMode(prefs.autoCamera?"auto":"full");$("cameraBtn").classList.toggle("active",prefs.autoCamera);saveStore()});$("debugToggle").addEventListener("change",e=>{prefs.debug=e.target.checked;$("debugPanel").hidden=!prefs.debug;saveStore()});
  $("seedStartBtn").addEventListener("click",()=>{const v=$("seedInput").value.trim();if(!/^\d+$/.test(v)){toast("숫자 시드를 입력하세요");return}closeSettings();startMatch(+v)});$("statsBtn").addEventListener("click",toggleStats);$("resetStatsBtn").addEventListener("click",()=>{if(confirm("누적 경기 기록을 초기화할까요?")){prefs.stats=structuredClone(DEFAULTS.stats);saveStore();renderStats();toast("누적 기록을 초기화했습니다")}});
  $("audioUnlock").addEventListener("click",unlockAudio);document.addEventListener("pointerdown",unlockAudio,{once:true,passive:true});window.addEventListener("resize",()=>renderer.resize());document.addEventListener("visibilitychange",()=>{worker?.postMessage({type:"visibility",hidden:document.hidden});lastFrame=performance.now()});setupGestures();
}
async function unlockAudio(){if(await audio.unlock())$("audioUnlock").classList.add("unlocked")}
function togglePause(){paused=!paused;worker?.postMessage({type:"pause",value:paused});const b=$("pauseBtn");b.querySelector("span").textContent=paused?"▶":"Ⅱ";b.querySelector("small").textContent=paused?"계속":"정지";toast(paused?"경기를 일시정지했습니다":"경기를 재개했습니다")}
function cycleSpeed(){speed=speed===1?2:speed===2?4:1;worker?.postMessage({type:"speed",value:speed});updateSpeedButton();toast(`${speed}배속으로 변경했습니다`)}
function updateSpeedButton(){$("speedBtn").querySelector("span").textContent=`×${speed}`;$("speedBadge").textContent=`×${speed}`}
function toggleCamera(){prefs.autoCamera=!prefs.autoCamera;renderer.setMode(prefs.autoCamera?"auto":"full");$("cameraBtn").classList.toggle("active",prefs.autoCamera);$("autoCameraToggle").checked=prefs.autoCamera;saveStore();toast(prefs.autoCamera?"자동 감독을 켰습니다":"자동 감독을 껐습니다")}
let teamCycle=-2;function cycleTeam(){teamCycle++;if(teamCycle>3)teamCycle=-2;if(teamCycle===-2){renderer.setMode("auto");$("teamBtn").querySelector("small").textContent="추적";toast("자동 감독") }else if(teamCycle===-1){renderer.setMode("leader");$("teamBtn").querySelector("small").textContent="선두";toast("선두 팀 추적") }else{renderer.setMode("team",teamCycle);$("teamBtn").querySelector("small").textContent=TEAM_NAMES[teamCycle];$("teamBtn").style.color=TEAM_COLORS[teamCycle];toast(`${TEAM_NAMES[teamCycle]} 팀 추적`)}}
function injectChaos(){if(chaosLeft<=0){toast("이번 경기의 카오스 투입권을 모두 썼습니다");return}chaosLeft--;updateChaosButton();if(usingFallback){if(!fallback?.injectChaos()){chaosLeft++;updateChaosButton();toast("현재 예고가 끝난 뒤 다시 시도하세요")}}else worker?.postMessage({type:"chaos"})}
function updateChaosButton(){$("chaosCount").textContent=chaosLeft;$("chaosBtn").classList.toggle("ready",chaosLeft>0)}
function openSettings(){$("sheetShade").hidden=false;$("settingsSheet").classList.add("open");$("settingsSheet").setAttribute("aria-hidden","false");$("seedInput").placeholder=`현재 시드 ${currentSeed}`}
function closeSettings(){$("settingsSheet").classList.remove("open");$("settingsSheet").setAttribute("aria-hidden","true");setTimeout(()=>$("sheetShade").hidden=true,320)}

function setupGestures(){
  const canvas=$("arena"),points=new Map();let lastTap=0,moved=false,pinch=0;
  canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId);points.set(e.pointerId,{x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,startX:e.clientX,startY:e.clientY});moved=false;if(points.size===2){const a=[...points.values()];pinch=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}});
  canvas.addEventListener("pointermove",e=>{const p=points.get(e.pointerId);if(!p)return;p.x=e.clientX;p.y=e.clientY;if(Math.hypot(p.x-p.startX,p.y-p.startY)>5)moved=true;if(points.size===1){renderer.pan(p.x-p.lastX,p.y-p.lastY);p.lastX=p.x;p.lastY=p.y}else if(points.size===2){const a=[...points.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),cx=(a[0].x+a[1].x)/2,cy=(a[0].y+a[1].y)/2;if(pinch>0)renderer.zoomAt(d/pinch,cx,cy);pinch=d;for(const q of a){q.lastX=q.x;q.lastY=q.y}}e.preventDefault()},{passive:false});
  const up=e=>{const p=points.get(e.pointerId);points.delete(e.pointerId);if(!points.size&&p&&!moved){const now=performance.now(),rect=canvas.getBoundingClientRect();if(now-lastTap<320){renderer.resetFull();toast("전체 지도로 돌아갑니다")}else{const u=renderer.pick(e.clientX-rect.left,e.clientY-rect.top);if(u)toast(`${TEAM_NAMES[u[4]]} ${["러너","파이터","가디언","레인저","엔지니어","서포터"][u[5]]} 추적`)}lastTap=now}};canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);
}

function showResults(result){
  if(!result)return;$("hud").hidden=true;$("controls").hidden=true;const box=$("results");box.hidden=false;box.scrollTop=0;box.style.setProperty("--winner",TEAM_COLORS[result.winner]);$("winnerTitle").textContent=`${TEAM_NAMES[result.winner]} 팀 우승`;$("resultSeed").textContent=`SEED ${result.seed} · ${formatTime(result.duration)}`;
  $("resultRanks").innerHTML=result.teams.map((t,i)=>`<div class="result-rank" style="--c:${TEAM_COLORS[t.id]}"><b>${i+1}</b><div>${TEAM_NAMES[t.id]} 팀<strong>${t.score.toLocaleString()}점</strong></div><small>${t.kills} K</small></div>`).join("");
  $("awards").innerHTML=result.awards.map(a=>`<div class="award"><span>${a.icon}</span><small>${a.title}</small><strong style="color:${a.team>=0?TEAM_COLORS[a.team]:"#fff"}">${a.unit||"-"}</strong></div>`).join("");
  const top=result.teams[0],lead=maxLead(result.history),highlights=result.highlights?.slice(0,2).map(h=>h.text).filter(Boolean).join(" · ")||"결정적 목표전";$("resultFacts").innerHTML=`<span>최대 점수 차이<br><b>${lead}점</b></span><span>수정 반납<br><b>${result.teams.reduce((a,t)=>a+t.crystals,0)}회</b></span><span>타워 점령<br><b>${result.teams.reduce((a,t)=>a+t.towers,0)}회</b></span><span>보스 총 피해<br><b>${result.teams.reduce((a,t)=>a+t.boss,0).toLocaleString()}</b></span><span style="grid-column:1/-1">주요 장면<br><b>${escapeHtml(highlights)}</b></span><span style="grid-column:1/-1">카오스 사건<br><b>${result.chaos.join(" · ")||"없음"}</b></span>`;
  updateLifetimeStats(result,lead);requestAnimationFrame(()=>drawGraph(result));let left=11;$("nextCountdown").textContent=`${left}초 뒤 새로운 경기가 시작됩니다`;clearInterval(resultTimer);resultTimer=setInterval(()=>{if(resultHold)return;left--;$("nextCountdown").textContent=`${left}초 뒤 새로운 경기가 시작됩니다`;if(left<=0){clearInterval(resultTimer);startMatch()}},1000);
}
function maxLead(history){let m=0;for(const h of history){const s=h.s.slice().sort((a,b)=>b-a);m=Math.max(m,s[0]-s[1])}return m}
function drawGraph(result){const c=$("scoreGraph"),ctx=c.getContext("2d"),w=c.width,h=c.height,p=22;ctx.clearRect(0,0,w,h);ctx.fillStyle="#080d17";ctx.fillRect(0,0,w,h);ctx.strokeStyle="#202a3d";ctx.lineWidth=1;for(let i=1;i<4;i++){const y=p+(h-p*2)*i/4;ctx.beginPath();ctx.moveTo(p,y);ctx.lineTo(w-p,y);ctx.stroke()}const max=Math.max(1,...result.history.flatMap(v=>v.s));for(let t=0;t<4;t++){ctx.strokeStyle=TEAM_COLORS[t];ctx.lineWidth=3;ctx.shadowBlur=9;ctx.shadowColor=TEAM_COLORS[t];ctx.beginPath();result.history.forEach((v,i)=>{const x=p+(w-p*2)*i/Math.max(1,result.history.length-1),y=h-p-(h-p*2)*v.s[t]/max;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke()}ctx.shadowBlur=0;ctx.fillStyle="#8491a7";ctx.font="18px sans-serif";ctx.fillText("점수 흐름",p,19)}
function updateLifetimeStats(result,lead){const s=prefs.stats;s.matches++;s.wins[result.winner]++;result.teams.forEach((t,i)=>{s.scoreSum[t.id]+=t.score;s.rankSum[t.id]+=i+1});s.bestScore=Math.max(s.bestScore,result.teams[0].score);s.biggestComeback=Math.max(s.biggestComeback,lead);s.longest=Math.max(s.longest,result.duration);s.shortest=s.shortest?Math.min(s.shortest,result.duration):result.duration;s.recent.unshift({seed:result.seed,winner:result.winner,score:result.teams[0].score,date:Date.now()});s.recent=s.recent.slice(0,20);saveStore()}
function toggleStats(){const p=$("statsPanel");p.hidden=!p.hidden;if(!p.hidden)renderStats()}
function renderStats(){const s=prefs.stats,max=Math.max(1,...s.wins);$("statsPanel").innerHTML=`<b>누적 ${s.matches.toLocaleString()}경기</b><div class="stats-bars">${TEAM_NAMES.map((n,t)=>`<div class="stats-bar"><span>${n}</span><i style="--w:${s.wins[t]/max*100}%;--c:${TEAM_COLORS[t]}"></i><b>${s.wins[t]}승</b></div>`).join("")}</div><p>최고 점수 ${s.bestScore.toLocaleString()} · 최대 점수 차 ${s.biggestComeback.toLocaleString()}</p>`}
function runBenchmark(matches){toast(`${matches}경기 자동 밸런스 검사를 시작합니다`);if(worker)worker.postMessage({type:"benchmark",config:{matches,size:80,duration:FAST?60:120}});else setTimeout(()=>toast("Worker 환경에서만 밸런스 검사를 실행합니다"),400)}
function showBenchmark(r){console.info("CHAOS WORLD CUP balance test",r);toast(`검사 완료 · 승수 ${r.wins.join(" / ")}`);openSettings();$("statsPanel").hidden=false;$("statsPanel").innerHTML=`<b>자동 밸런스 검사 ${r.matches}경기</b><p>빨강 ${r.wins[0]} · 노랑 ${r.wins[1]} · 초록 ${r.wins[2]} · 파랑 ${r.wins[3]}</p><p>평균 점수 ${r.averageScores.join(" / ")}</p>`}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}

function frame(now){
  const delta=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  if(usingFallback&&fallback&&!paused&&!document.hidden&&!fallback.ended){fallbackAccumulator+=delta*speed*(fallback.slowMotion||1);let guard=10,stepped=false;while(fallbackAccumulator>=.05&&guard-->0){fallback.step(.05);fallbackAccumulator-=.05;stepped=true}if(stepped)handleSnapshot(fallback.snapshot(false))}
  renderer?.render(now);audio.update(snapshot);requestAnimationFrame(frame);
}

boot().catch(error=>{console.error(error);setBoot("초기화 중 오류가 발생했습니다. 페이지를 새로고침해 주세요.",100)});
