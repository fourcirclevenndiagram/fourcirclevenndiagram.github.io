export const TEAM_NAMES = ["빨강", "노랑", "초록", "파랑"];
export const TEAM_COLORS = ["#ff3f53", "#ffd83d", "#38e99a", "#43a7ff"];
export const ROLE_NAMES = ["러너", "파이터", "가디언", "레인저", "엔지니어", "서포터"];

export const TERRAIN = Object.freeze({ FLOOR:0, WALL:1, WATER:2, BOOST:3, HEAL:4, HAZARD:5, VOID:6 });
export const STRUCTURE = Object.freeze({ NONE:0, BASE:1, TOWER:2, PORTAL:3, CRYSTAL:4, FORTRESS:5 });

export const RULES = [
  { id:"NORMAL", name:"기본 점수전", desc:"모든 목표가 표준 점수를 냅니다." },
  { id:"TERRITORY_X2", name:"영토 점수 2배", desc:"넓게 점령한 팀이 빠르게 추격합니다." },
  { id:"CRYSTAL_X2", name:"중앙 수정 점수 2배", desc:"수정 반납 점수가 두 배입니다." },
  { id:"TOWER_X2", name:"중립 타워 점수 2배", desc:"타워 유지 점수가 두 배입니다." },
  { id:"BOSS_X2", name:"보스 피해 점수 증가", desc:"보스에게 준 피해가 더 큰 점수가 됩니다." },
  { id:"CORE_X2", name:"본진 공격 점수 증가", desc:"코어 보호막과 본체 피해 점수가 증가합니다." },
  { id:"KILL_X2", name:"처치 점수 증가", desc:"교전과 연속 처치가 중요해집니다." },
  { id:"UTILITY_X2", name:"기술 병과 과충전", desc:"엔지니어와 서포터 효과가 강화됩니다." },
  { id:"HASTE", name:"전 유닛 가속", desc:"모든 유닛의 이동 속도가 증가합니다." },
  { id:"RAPID", name:"재사용 대기시간 감소", desc:"공격과 능력이 더 빠르게 돌아옵니다." },
  { id:"LONG_RESPAWN", name:"부활 지연", desc:"쓰러진 유닛의 공백이 길어집니다." },
  { id:"NO_RESPAWN", name:"부활 봉쇄", desc:"잠시 동안 본진 부활이 멈춥니다." },
  { id:"SURVIVOR", name:"생존자 보너스", desc:"오래 살아남은 유닛이 지속 점수를 냅니다." },
  { id:"CENTER_ONLY", name:"중앙 집중전", desc:"중앙 지역 행동만 점수로 인정됩니다." },
  { id:"FINAL_FRENZY", name:"최후의 광란", desc:"모든 주요 점수원이 강화됩니다." }
];

export const CHAOS = [
  { id:"GRAVITY", name:"중력 방향 변경", headline:"GRAVITY SHIFT" },
  { id:"FLOOD", name:"홍수", headline:"FLOOD WARNING" },
  { id:"BLACKOUT", name:"정전", headline:"BLACKOUT" },
  { id:"TOWER_RESET", name:"타워 초기화", headline:"TOWER RESET" },
  { id:"BOSS_INVASION", name:"보스 난입", headline:"BOSS INVASION" },
  { id:"GHOSTS", name:"망령 유닛 부활", headline:"THE FALLEN RISE" },
  { id:"PORTAL", name:"순간이동 문 폭주", headline:"PORTAL SURGE" },
  { id:"METEOR", name:"운석 낙하", headline:"METEOR STORM" },
  { id:"DIVIDE", name:"지도 분단", headline:"WORLD DIVIDED" },
  { id:"COLLAPSE", name:"외곽 붕괴", headline:"RING COLLAPSE" },
  { id:"FORTRESS", name:"이동 요새 출현", headline:"MOBILE FORTRESS" },
  { id:"STORM", name:"에너지 폭풍", headline:"ENERGY STORM" }
];

const ROLE = [
  { hp:62, shield:0, speed:3.35, attack:8, range:1.15, cooldown:.72 },
  { hp:105, shield:8, speed:2.35, attack:14, range:1.65, cooldown:.9 },
  { hp:172, shield:46, speed:1.72, attack:10, range:1.35, cooldown:1.05 },
  { hp:78, shield:0, speed:2.12, attack:12, range:5.7, cooldown:1.18 },
  { hp:86, shield:12, speed:1.92, attack:6, range:2.7, cooldown:1.35 },
  { hp:80, shield:18, speed:2.05, attack:5, range:3.2, cooldown:1.12 }
];
const STRATEGIES = ["TERRITORY","CRYSTAL","TOWER","BOSS","CORE","DEFEND","LEADER_HUNT","REGROUP"];
const BASE_POS = [[.09,.09],[.91,.09],[.09,.91],[.91,.91]];
const BOSS_NAMES = ["거대 골렘","전기 구체","흡수 슬라임","공중 감시자"];

class RNG {
  constructor(seed){ this.state=(seed>>>0)||0x6d2b79f5; }
  next(){ let t=this.state+=0x6d2b79f5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296; }
  int(a,b){ return a+Math.floor(this.next()*(b-a+1)); }
  pick(a){ return a[Math.floor(this.next()*a.length)]; }
  chance(p){ return this.next()<p; }
}

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const dist2=(a,b,c,d)=>{const x=a-c,y=b-d;return x*x+y*y};
const fmtTeam=t=>TEAM_NAMES[t]||"중립";

export class Simulation {
  constructor(config={}){
    this.config={ size:clamp(+config.size||100,80,120), unitsPerTeam:clamp(+config.unitsPerTeam||32,24,40), duration:+config.duration||300, chaosFrequency:config.chaosFrequency||"normal", fast:!!config.fast };
    this.seed=(+config.seed>>>0)||((Date.now()^Math.floor(Math.random()*0xffffffff))>>>0);
    this.rng=new RNG(this.seed);
    this.n=this.config.size; this.cells=this.n*this.n; this.tick=0; this.time=0; this.dt=.05; this.remaining=this.config.duration;
    this.phase="COUNTDOWN"; this.countdown=3; this.ended=false; this.overtime=false; this.winner=-1;
    this.terrain=new Uint8Array(this.cells); this.owner=new Int8Array(this.cells); this.owner.fill(-1);
    this.influence=new Float32Array(this.cells); this.danger=new Float32Array(this.cells); this.elevation=new Uint8Array(this.cells);
    this.structures=new Uint8Array(this.cells); this.structureTeam=new Int8Array(this.cells); this.structureTeam.fill(-1); this.wallHP=new Int16Array(this.cells);
    this.mapDirty=true; this.ownerDirty=true; this.pathVersion=1; this.flowCache=new Map(); this.events=[]; this.effects=[]; this.eventLog=[]; this.eventSerial=0;
    this.units=[]; this.teams=[]; this.towers=[]; this.portals=[]; this.barriers=[]; this.ghosts=[];
    this.crystal={ active:false,x:0,y:0,carrier:-1,lastTeam:-1,respawn:12,stolen:false };
    this.boss={ active:false,type:0,name:"",x:0,y:0,hp:0,maxHp:0,attackCd:0,damage:[0,0,0,0],spawned:false };
    this.fortress={ active:false,x:0,y:0,targetX:0,targetY:0,team:-1,progress:0,hp:620,maxHp:620 };
    this.rule=RULES[0]; this.ruleRemaining=this.rng.int(34,44); this.ruleWarning=false;
    this.chaosState={ active:null,remaining:0,gravityX:0,gravityY:0,storm:null,collapse:0,divide:false,blackout:false,flood:false };
    this.chaosSchedule=[]; this.chaosUsed=[]; this.pendingChaos=null; this.pendingChaosTime=0;
    this.scoreHistory=[]; this.scoreHistoryTimer=0; this.lastLeader=-1; this.slowMotion=1; this.slowMotionTimer=0;
    this.gridBins=[]; this.binSize=5; this.binN=Math.ceil(this.n/this.binSize); for(let i=0;i<this.binN*this.binN;i++)this.gridBins.push([]);
    this._generateMap(); this._createTeams(); this._spawnUnits(); this._scheduleChaos(); this._recordScores();
    this.emit("MATCH_READY",this.n/2,this.n/2,-1,-1,0,30,false,`시드 ${this.seed}의 경기장이 생성되었습니다.`);
  }

  idx(x,y){ return y*this.n+x; }
  inside(x,y){ return x>=1&&y>=1&&x<this.n-1&&y<this.n-1; }
  passable(x,y,team=-1){
    x=x|0;y=y|0;if(!this.inside(x,y))return false;const i=this.idx(x,y),t=this.terrain[i];
    if(t===TERRAIN.WALL||t===TERRAIN.VOID)return false;
    if(this.chaosState.divide&&Math.abs(x-this.n/2)<1.4&&Math.abs(y-this.n/2)>this.n*.08)return false;
    return true;
  }

  _generateMap(){
    const n=this.n, c=n>>1;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=this.idx(x,y); this.elevation[i]=Math.floor(90+70*Math.sin(x*.13)*Math.cos(y*.11)+this.rng.next()*45);
      if(x===0||y===0||x===n-1||y===n-1){this.terrain[i]=TERRAIN.WALL;this.wallHP[i]=9999;}
    }
    // Four-way mirrored obstacle plan keeps route opportunities equivalent.
    for(let k=0;k<Math.floor(n*.32);k++){
      const x=this.rng.int(12,c-8),y=this.rng.int(12,c-8),w=this.rng.int(2,5),h=this.rng.int(2,7);
      const spots=[[x,y],[n-x-w,y],[x,n-y-h],[n-x-w,n-y-h]];
      for(const [sx,sy] of spots)for(let yy=sy;yy<sy+h;yy++)for(let xx=sx;xx<sx+w;xx++)if(this.inside(xx,yy)){const i=this.idx(xx,yy);this.terrain[i]=TERRAIN.WALL;this.wallHP[i]=this.rng.int(90,170);}
    }
    const carve=(x0,y0,x1,y1,width=2)=>{
      const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));
      for(let s=0;s<=steps;s++){const x=Math.round(x0+(x1-x0)*s/steps),y=Math.round(y0+(y1-y0)*s/steps);for(let oy=-width;oy<=width;oy++)for(let ox=-width;ox<=width;ox++)if(this.inside(x+ox,y+oy)){const i=this.idx(x+ox,y+oy);this.terrain[i]=TERRAIN.FLOOR;this.wallHP[i]=0;}}
    };
    for(const [px,py] of BASE_POS){const bx=Math.round(px*(n-1)),by=Math.round(py*(n-1));carve(bx,by,c,c,2);carve(bx,by,bx,c,1);carve(bx,by,c,by,1);for(let y=by-6;y<=by+6;y++)for(let x=bx-6;x<=bx+6;x++)if(this.inside(x,y)){this.terrain[this.idx(x,y)]=TERRAIN.FLOOR;this.wallHP[this.idx(x,y)]=0;}}
    for(let y=c-8;y<=c+8;y++)for(let x=c-8;x<=c+8;x++)if(this.inside(x,y)){this.terrain[this.idx(x,y)]=TERRAIN.FLOOR;this.wallHP[this.idx(x,y)]=0;}
    // Special terrain is mirrored as well.
    for(let k=0;k<Math.floor(n*.22);k++){
      const x=this.rng.int(7,c-5),y=this.rng.int(7,c-5),type=this.rng.pick([TERRAIN.WATER,TERRAIN.BOOST,TERRAIN.HEAL,TERRAIN.HAZARD]);
      for(const [sx,sy] of [[x,y],[n-1-x,y],[x,n-1-y],[n-1-x,n-1-y]])for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const i=this.idx(sx+ox,sy+oy);if(this.terrain[i]===TERRAIN.FLOOR)this.terrain[i]=type;}
    }
    const towerPos=[[c,Math.round(n*.22)],[Math.round(n*.78),c],[c,Math.round(n*.78)],[Math.round(n*.22),c],[c,c]];
    towerPos.forEach(([x,y],id)=>{const i=this.idx(x,y);this.terrain[i]=TERRAIN.FLOOR;this.structures[i]=STRUCTURE.TOWER;this.towers.push({id,x,y,team:-1,capture:[0,0,0,0],hp:260,maxHp:260,shotCd:0,name:id===4?"중앙 타워":["북부 타워","동부 타워","남부 타워","서부 타워"][id]});});
    for(const [x,y] of [[Math.round(n*.28),Math.round(n*.28)],[Math.round(n*.72),Math.round(n*.28)],[Math.round(n*.28),Math.round(n*.72)],[Math.round(n*.72),Math.round(n*.72)]]){const i=this.idx(x,y);this.structures[i]=STRUCTURE.PORTAL;this.portals.push({x,y,active:true});}
    const ci=this.idx(c,c);this.structures[ci]=STRUCTURE.CRYSTAL;this.crystal.x=c;this.crystal.y=c;
  }

  _createTeams(){
    const rotation=this.seed&3;
    for(let t=0;t<4;t++){
      const baseSlot=(t+rotation)&3,[px,py]=BASE_POS[baseSlot],x=Math.round(px*(this.n-1)),y=Math.round(py*(this.n-1)),i=this.idx(x,y);this.structures[i]=STRUCTURE.BASE;this.structureTeam[i]=t;
      const bias=[{attack:1.08,speed:1,defense:.96,range:1},{attack:.97,speed:1.08,defense:.96,range:1},{attack:.97,speed:.97,defense:1.08,range:1},{attack:.97,speed:1,defense:.97,range:1.08}][t];
      this.teams.push({ id:t,baseSlot,name:TEAM_NAMES[t],score:0,rank:t+1,kills:0,deaths:0,damage:0,healing:0,territory:0,maxTerritory:0,towerCaptures:0,crystalScores:0,crystalSteals:0,bossDamage:0,coreDamage:0,streak:0,maxStreak:0,strategy:"TERRITORY",orders:[],lastStrategy:"",bias,core:{x,y,hp:900,maxHp:900,shield:900,maxShield:900,alive:true},eliminated:false,opPriority:0 });
      for(let yy=y-5;yy<=y+5;yy++)for(let xx=x-5;xx<=x+5;xx++)if(this.inside(xx,yy)){const j=this.idx(xx,yy);this.owner[j]=t;this.influence[j]=70;}
    }
  }

  _spawnUnits(){
    const distribution=[.18,.31,.17,.16,.09,.09], counts=distribution.map(v=>Math.floor(v*this.config.unitsPerTeam));
    while(counts.reduce((a,b)=>a+b,0)<this.config.unitsPerTeam)counts[1]++;
    let id=0;
    for(let t=0;t<4;t++){let localId=0;for(let role=0;role<6;role++)for(let k=0;k<counts[role];k++){
      const base=this.teams[t].core,ang=this.rng.next()*Math.PI*2,r=this.rng.next()*4+1,s=ROLE[role],hp=s.hp*(t===2?1.05:1),attack=s.attack*(t===0?1.06:1),speed=s.speed*(t===1?1.06:1),range=s.range*(t===3?1.06:1);
      this.units.push({id,team:t,role,squad:localId%5,x:base.x+Math.cos(ang)*r,y:base.y+Math.sin(ang)*r,px:base.x,py:base.y,vx:0,vy:0,hp,maxHp:hp,shield:s.shield,maxShield:s.shield,speed,attack,range,cooldown:this.rng.next(),abilityCd:this.rng.next()*6,alive:true,respawn:0,life:0,born:0,carrying:false,damage:0,healing:0,kills:0,deaths:0,objective:0,captures:0,lastHit:-1,lastHitTime:0,multi:0,lastKill:-99,barrierCd:this.rng.next()*12,callsign:`${["R","F","G","N","E","S"][role]}-${String(k+1).padStart(2,"0")}`});id++;localId++;
    }}
  }

  _scheduleChaos(){
    const count=this.config.chaosFrequency==="low"?3:this.config.chaosFrequency==="high"?6:this.rng.int(4,5),margin=35,span=Math.max(80,this.config.duration-margin*2);
    const pool=CHAOS.slice();
    for(let i=0;i<count;i++){const pick=pool.splice(this.rng.int(0,pool.length-1),1)[0];this.chaosSchedule.push({time:margin+span*(i+1)/(count+1)+this.rng.int(-10,10),chaos:pick,done:false});}
  }

  emit(type,x,y,team=-1,unit=-1,score=0,importance=40,slow=false,text="",extra={}){
    const e={id:++this.eventSerial,type,time:this.time,x,y,team,unit,score,importance,slow,text,duration:extra.duration||2.5,zoom:extra.zoom||.34,...extra};
    this.events.push(e);if(importance>=40){this.eventLog.push(e);if(this.eventLog.length>160)this.eventLog.shift();}
    if(slow&&this.slowMotionTimer<=0){this.slowMotion=.32;this.slowMotionTimer=clamp(extra.slowDuration||.8,.5,2);}
    return e;
  }
  effect(type,x,y,extra={}){if(this.effects.length<180)this.effects.push({type,x,y,...extra});}

  start(){ if(this.phase==="COUNTDOWN")this.phase="LIVE"; }

  step(dt=this.dt){
    if(this.ended)return;
    dt=clamp(dt,0,.1);this.tick++;this.time+=dt;
    if(this.phase==="COUNTDOWN"){
      this.countdown-=dt;if(this.countdown<=0){this.phase="LIVE";this.emit("MATCH_START",this.n/2,this.n/2,-1,-1,0,70,false,"네 팀의 자동 경기가 시작됩니다!",{headline:"BATTLE START",zoom:.2});}return;
    }
    this.remaining-=dt;
    this._updateRule(dt);this._updateChaos(dt);this._updateStrategy(dt);this._buildBins();
    this._updateUnits(dt);this._updateObjectives(dt);this._updateTerritory(dt);this._updateScores(dt);this._updateLeader();
    if(this.slowMotionTimer>0){this.slowMotionTimer-=dt;if(this.slowMotionTimer<=0)this.slowMotion=1;}
    if(this.remaining<=30&&!this.finalCalled){this.finalCalled=true;this.rule=RULES.find(r=>r.id==="FINAL_FRENZY");this.ruleRemaining=31;this.emit("FINAL_30",this.n/2,this.n/2,-1,-1,0,90,false,"마지막 30초, 모든 주요 목표의 가치가 상승합니다!",{headline:"FINAL 30 SECONDS",zoom:.23});this._startChaos(CHAOS.find(c=>c.id==="COLLAPSE"),true);}
    if(this.remaining<=10&&!this.tenCalled){this.tenCalled=true;this.emit("FINAL_10",this.n/2,this.n/2,-1,-1,0,96,false,"마지막 10초입니다!",{headline:"FINAL 10 SECONDS",zoom:.2});}
    if(this.remaining<=0)this._finishOrOvertime();
  }

  _updateRule(dt){
    this.ruleRemaining-=dt;
    if(this.ruleRemaining<=5&&!this.ruleWarning){this.ruleWarning=true;this.emit("RULE_WARNING",this.n/2,this.n/2,-1,-1,0,45,false,`5초 뒤 경기 규칙이 바뀝니다.`);}
    if(this.ruleRemaining<=0){
      const available=RULES.filter(r=>r.id!==this.rule.id&&r.id!=="FINAL_FRENZY");this.rule=this.rng.pick(available);this.ruleRemaining=this.rng.int(30,50);this.ruleWarning=false;
      this.emit("RULE_CHANGE",this.n/2,this.n/2,-1,-1,0,68,false,`새 규칙: ${this.rule.name}`,{headline:"RULE CHANGE",subtitle:this.rule.name,zoom:.25});
    }
  }

  _updateChaos(dt){
    for(const s of this.chaosSchedule)if(!s.done&&this.time>=s.time-4){s.done=true;this.pendingChaos=s.chaos;this.pendingChaosTime=4;this.emit("CHAOS_WARNING",this.n/2,this.n/2,-1,-1,0,82,false,`${s.chaos.name} 발생 4초 전!`,{headline:s.chaos.headline,subtitle:"4초 후 전장 변화",warning:true,zoom:.24});break;}
    if(this.pendingChaos){this.pendingChaosTime-=dt;if(this.pendingChaosTime<=0){this._startChaos(this.pendingChaos);this.pendingChaos=null;}}
    const cs=this.chaosState;
    if(cs.remaining>0){cs.remaining-=dt;if(cs.active?.id==="GRAVITY"&&this.tick%20===0)this.effect("gravity",this.n/2,this.n/2,{vx:cs.gravityX,vy:cs.gravityY});if(cs.remaining<=0)this._endChaos();}
    if(cs.storm){cs.storm.remaining-=dt;if(cs.storm.remaining<=0)cs.storm=null;}
    if(cs.collapse>0)cs.collapse=clamp(cs.collapse+dt*.055,0,.46);
    if(this.meteors?.length){for(const m of this.meteors){m.t-=dt;if(m.t<=0&&!m.hit){m.hit=true;this._meteorHit(m);}}this.meteors=this.meteors.filter(m=>m.t>-.8);}
  }

  injectChaos(id=null){
    if(this.pendingChaos)return false;let c=id?CHAOS.find(v=>v.id===id):this.rng.pick(CHAOS.filter(v=>v.id!==this.chaosState.active?.id));this.pendingChaos=c;this.pendingChaosTime=3;this.emit("CHAOS_WARNING",this.n/2,this.n/2,-1,-1,0,84,false,`관중 투입: ${c.name} 3초 전!`,{headline:c.headline,subtitle:"카오스 투입",warning:true});return true;
  }

  _startChaos(c,forced=false){
    if(!c)return;const cs=this.chaosState;cs.active=c;cs.remaining=forced&&c.id==="COLLAPSE"?35:this.rng.int(15,24);this.chaosUsed.push(c.name);
    const center=this.n/2;
    switch(c.id){
      case"GRAVITY":{const a=this.rng.next()*Math.PI*2;cs.gravityX=Math.cos(a)*.85;cs.gravityY=Math.sin(a)*.85;break;}
      case"FLOOD":cs.flood=true;break;
      case"BLACKOUT":cs.blackout=true;break;
      case"TOWER_RESET":for(const t of this.towers){t.team=-1;t.capture.fill(0);this.structureTeam[this.idx(t.x,t.y)]=-1;}this.ownerDirty=true;break;
      case"BOSS_INVASION":this._spawnBoss(true);break;
      case"GHOSTS":this._raiseGhosts();break;
      case"PORTAL":this._addWildPortals();break;
      case"METEOR":this._createMeteors(7);break;
      case"DIVIDE":cs.divide=true;this.pathVersion++;this.flowCache.clear();this.mapDirty=true;break;
      case"COLLAPSE":cs.collapse=Math.max(cs.collapse,.02);break;
      case"FORTRESS":this._spawnFortress();break;
      case"STORM":cs.storm={x:this.rng.int(this.n*.25,this.n*.75),y:this.rng.int(this.n*.25,this.n*.75),radius:this.n*.13,remaining:22};break;
    }
    this.emit("CHAOS_TRIGGERED",center,center,-1,-1,0,88,c.id==="METEOR"||c.id==="DIVIDE",`${c.name}이 전장을 바꿉니다!`,{headline:c.headline,subtitle:c.name,zoom:.22,slowDuration:.65});
  }

  _endChaos(){const cs=this.chaosState;if(!cs.active)return;const id=cs.active.id;if(id==="FLOOD")cs.flood=false;if(id==="BLACKOUT")cs.blackout=false;if(id==="DIVIDE"){cs.divide=false;this.pathVersion++;this.flowCache.clear();this.mapDirty=true;}cs.gravityX=cs.gravityY=0;cs.active=null;cs.remaining=0;}

  _createMeteors(count){this.meteors=[];for(let i=0;i<count;i++){const x=this.rng.int(8,this.n-9),y=this.rng.int(8,this.n-9);this.meteors.push({x,y,t:1.2+i*.55,hit:false});this.effect("warning",x,y,{radius:4,t:1.2+i*.55});}}
  _meteorHit(m){
    for(let y=m.y-3;y<=m.y+3;y++)for(let x=m.x-3;x<=m.x+3;x++)if(this.inside(x,y)){const i=this.idx(x,y);if(this.terrain[i]===TERRAIN.WALL&&this.wallHP[i]<9999){this.terrain[i]=TERRAIN.FLOOR;this.wallHP[i]=0;this.mapDirty=true;}}
    for(const u of this.units)if(u.alive&&dist2(u.x,u.y,m.x,m.y)<25)this._damageUnit(u,55*(1-Math.sqrt(dist2(u.x,u.y,m.x,m.y))/6),-1,-1);
    this.pathVersion++;this.flowCache.clear();this.effect("meteor",m.x,m.y,{radius:7});this.emit("METEOR_HIT",m.x,m.y,-1,-1,0,72,true,"운석 충돌로 통로와 진형이 무너졌습니다!",{headline:"IMPACT",zoom:.5,slowDuration:.55});
  }

  _raiseGhosts(){
    const dead=this.units.filter(u=>!u.alive).slice(0,16);for(const src of dead){this.ghosts.push({id:10000+this.ghosts.length,team:4,role:src.role,squad:0,x:src.x,y:src.y,px:src.x,py:src.y,vx:0,vy:0,hp:55,maxHp:55,shield:0,maxShield:0,speed:2.1,attack:9,range:1.4,cooldown:0,abilityCd:0,alive:true,respawn:0,life:0,born:this.time,carrying:false,damage:0,healing:0,kills:0,deaths:0,objective:0,captures:0,lastHit:-1,lastHitTime:0,multi:0,lastKill:-99,barrierCd:99,callsign:"망령"});}
  }
  _addWildPortals(){for(let i=0;i<6;i++){const x=this.rng.int(6,this.n-7),y=this.rng.int(6,this.n-7);if(this.passable(x,y)){this.portals.push({x,y,active:true,wild:true,expires:this.time+22});this.structures[this.idx(x,y)]=STRUCTURE.PORTAL;this.mapDirty=true;}}}
  _spawnFortress(){this.fortress={active:true,x:this.n/2,y:6,targetX:this.n/2,targetY:this.n-7,team:-1,progress:0,hp:620,maxHp:620};}

  _updateStrategy(dt){
    if(this.tick%50!==0)return;
    const leader=this.teams.slice().sort((a,b)=>b.score-a.score)[0].id;
    for(const team of this.teams){
      if(team.eliminated)continue;const scoreGap=this.teams[leader].score-team.score, util={TERRITORY:18,CRYSTAL:this.crystal.active?32:8,TOWER:22,BOSS:this.boss.active?28:0,CORE:this.time>this.config.duration*.4?18:2,DEFEND:team.core.shield<team.core.maxShield*.45?34:10,LEADER_HUNT:scoreGap>100?25:6,REGROUP:8};
      if(this.rule.id==="TERRITORY_X2")util.TERRITORY+=28;if(this.rule.id==="CRYSTAL_X2")util.CRYSTAL+=34;if(this.rule.id==="TOWER_X2")util.TOWER+=30;if(this.rule.id==="BOSS_X2")util.BOSS+=34;if(this.rule.id==="CORE_X2")util.CORE+=26;if(this.rule.id==="KILL_X2")util.LEADER_HUNT+=22;
      if(team.id===0){util.CORE+=2;util.LEADER_HUNT+=8;util.TOWER+=10}if(team.id===1)util.CRYSTAL+=7;if(team.id===2){util.DEFEND+=4;util.TOWER+=4}if(team.id===3){util.TOWER+=3;util.LEADER_HUNT+=4}
      for(const k in util)util[k]+=this.rng.next()*10;
      team.lastStrategy=team.strategy;team.strategy=Object.entries(util).sort((a,b)=>b[1]-a[1])[0][0];team.opPriority=Math.round(util[team.strategy]);team.orders=[];
      for(let s=0;s<5;s++){let strategy=team.strategy;if(s===1)strategy="DEFEND";if(s===2&&this.crystal.active)strategy="CRYSTAL";if(s===3&&this.towers.some(v=>v.team!==team.id))strategy="TOWER";if(s===4&&scoreGap>60)strategy="LEADER_HUNT";team.orders.push({strategy,...this._strategyTarget(team,strategy,leader)});}
      if(team.lastStrategy!==team.strategy)this.emit("AI_ORDER",team.core.x,team.core.y,team.id,-1,0,25,false,`${team.name} 팀 작전: ${this.strategyKorean(team.strategy)}`);
    }
  }

  strategyKorean(s){return({TERRITORY:"영토 확장",CRYSTAL:"수정 탈취",TOWER:"타워 점령",BOSS:"보스 집중 공격",CORE:"적 본진 압박",DEFEND:"본진 방어",LEADER_HUNT:"선두 견제",REGROUP:"병력 재집결"})[s]||s;}
  _strategyTarget(team,s,leader){
    if(s==="CRYSTAL"){if(this.crystal.carrier>=0){const u=this.units[this.crystal.carrier];if(u?.team===team.id)return{x:team.core.x,y:team.core.y};if(u)return{x:u.x,y:u.y};}return{x:this.crystal.x,y:this.crystal.y};}
    if(s==="TOWER"){const preferred=[3,0,2,1][team.baseSlot],list=this.towers.filter(t=>t.team!==team.id).sort((a,b)=>(dist2(a.x,a.y,team.core.x,team.core.y)-(a.id===preferred?.5:0))-(dist2(b.x,b.y,team.core.x,team.core.y)-(b.id===preferred?.5:0)));return list[0]||{x:this.n/2,y:this.n/2};}
    if(s==="BOSS"&&this.boss.active)return{x:this.boss.x,y:this.boss.y};
    if(s==="CORE"||s==="LEADER_HUNT"){const targets=this.teams.filter(t=>t.id!==team.id&&!t.eliminated).sort((a,b)=>s==="LEADER_HUNT"?(b.score-a.score):(dist2(a.core.x,a.core.y,team.core.x,team.core.y)-dist2(b.core.x,b.core.y,team.core.x,team.core.y)));return{x:targets[0].core.x,y:targets[0].core.y};}
    if(s==="DEFEND"||s==="REGROUP")return{x:team.core.x,y:team.core.y};
    const ang=this.rng.next()*Math.PI*2,r=this.n*(.18+this.rng.next()*.2);return{x:clamp(this.n/2+Math.cos(ang)*r,4,this.n-5),y:clamp(this.n/2+Math.sin(ang)*r,4,this.n-5)};
  }

  _buildBins(){for(const b of this.gridBins)b.length=0;for(const u of this.units)if(u.alive){const bx=clamp(Math.floor(u.x/this.binSize),0,this.binN-1),by=clamp(Math.floor(u.y/this.binSize),0,this.binN-1);this.gridBins[by*this.binN+bx].push(u);}for(const u of this.ghosts)if(u.alive){const bx=clamp(Math.floor(u.x/this.binSize),0,this.binN-1),by=clamp(Math.floor(u.y/this.binSize),0,this.binN-1);this.gridBins[by*this.binN+bx].push(u);}}
  _nearby(x,y,r,team,friend=false){const out=[],minX=clamp(Math.floor((x-r)/this.binSize),0,this.binN-1),maxX=clamp(Math.floor((x+r)/this.binSize),0,this.binN-1),minY=clamp(Math.floor((y-r)/this.binSize),0,this.binN-1),maxY=clamp(Math.floor((y+r)/this.binSize),0,this.binN-1),rr=r*r;for(let by=minY;by<=maxY;by++)for(let bx=minX;bx<=maxX;bx++)for(const u of this.gridBins[by*this.binN+bx])if(u.alive&&(friend?u.team===team:u.team!==team)&&dist2(x,y,u.x,u.y)<=rr)out.push(u);return out;}

  _updateUnits(dt){
    const all=this.units.concat(this.ghosts),start=(this.tick*17)%Math.max(1,all.length);for(let ai=0;ai<all.length;ai++){const u=all[(ai+start)%all.length];
      u.px=u.x;u.py=u.y;
      if(!u.alive){if(u.team<4){u.respawn-=dt;const team=this.teams[u.team];if(u.respawn<=0&&this.rule.id!=="NO_RESPAWN"&&(team.core.alive||this.towers.some(t=>t.team===u.team))){const spawn=team.core.alive?team.core:this.towers.find(t=>t.team===u.team);this._respawn(u,spawn.x,spawn.y);}}continue;}
      u.life+=dt;u.cooldown-=dt;u.abilityCd-=dt;u.barrierCd-=dt;
      const cell=this.idx(clamp(u.x|0,0,this.n-1),clamp(u.y|0,0,this.n-1)),terrain=this.terrain[cell];
      if(terrain===TERRAIN.HEAL&&u.team<4){u.hp=Math.min(u.maxHp,u.hp+dt*7);u.shield=Math.min(u.maxShield,u.shield+dt*4)}
      if(terrain===TERRAIN.HAZARD)this._damageUnit(u,dt*6,-1,-1);
      if(this.chaosState.collapse>0){const edge=Math.min(u.x,u.y,this.n-u.x,this.n-u.y);if(edge<this.n*this.chaosState.collapse)this._damageUnit(u,dt*(12+(this.chaosState.collapse*this.n-edge)*2),-1,-1);}
      if(!u.alive)continue;
      if(u.team<4&&u.role===5)this._support(u,dt);if(u.team<4&&u.role===4)this._engineer(u,dt);
      const enemy=this._chooseEnemy(u);
      if(enemy&&u.cooldown<=0){this._attack(u,enemy);}
      let target;
      if(u.team===4){const foes=this._nearby(u.x,u.y,12,4,false);target=foes[0]||{x:this.n/2,y:this.n/2};}
      else if(u.carrying)target=this.teams[u.team].core;
      else if(u.hp<u.maxHp*.24)target=this.teams[u.team].core;
      else{const order=this.teams[u.team].orders[u.squad]||{strategy:"TERRITORY",x:this.n/2,y:this.n/2};target=order;if(order.strategy==="CRYSTAL"&&this.crystal.carrier>=0){const carrier=this.units[this.crystal.carrier];if(carrier&&carrier.team===u.team&&carrier.id!==u.id)target=carrier;}}
      if(enemy&&dist2(u.x,u.y,enemy.x,enemy.y)<Math.pow(u.range*.72,2)&&u.role!==0)target={x:u.x-(enemy.x-u.x),y:u.y-(enemy.y-u.y)};
      this._moveUnit(u,target.x,target.y,dt);
      this._portalCheck(u);this._objectiveContact(u);
    }
    this.ghosts=this.ghosts.filter(g=>g.alive&&this.time-g.born<24);
  }

  _chooseEnemy(u){
    const scan=u.range+1.2, foes=this._nearby(u.x,u.y,scan,u.team,false);let best=null,score=1e9;for(const e of foes){if(e.team===4&&u.team===4)continue;const d=dist2(u.x,u.y,e.x,e.y),priority=(e.carrying?-12:0)+(e.role===5?-3:0);if(d+priority<score){score=d+priority;best=e;}}return best;
  }
  _attack(u,target){
    const haste=this.rule.id==="RAPID"?.67:1,storm=this.chaosState.storm&&dist2(u.x,u.y,this.chaosState.storm.x,this.chaosState.storm.y)<this.chaosState.storm.radius**2?.62:1;u.cooldown=ROLE[u.role].cooldown*haste*storm*(.88+this.rng.next()*.24);
    let damage=u.attack*(.84+this.rng.next()*.32);if(u.team===0)damage*=1.04;if(u.role===3&&dist2(u.x,u.y,target.x,target.y)>12)damage*=1.12;
    this._damageUnit(target,damage,u.team,u.id);u.damage+=damage;if(u.team<4)this.teams[u.team].damage+=damage;
    this.effect("projectile",u.x,u.y,{tx:target.x,ty:target.y,team:u.team,role:u.role});
  }
  _damageUnit(target,damage,attackerTeam,attackerId){
    if(!target.alive||damage<=0)return;let left=damage;if(target.shield>0){const s=Math.min(target.shield,left);target.shield-=s;left-=s;this.effect("shield",target.x,target.y,{team:target.team});}
    target.hp-=left;target.lastHit=attackerId;target.lastHitTime=this.time;if(target.hp<=0)this._killUnit(target,attackerTeam,attackerId);
  }
  _killUnit(u,killerTeam,killerId){
    if(!u.alive)return;u.alive=false;u.hp=0;u.deaths++;if(u.carrying)this._dropCrystal(u);const victimTeam=u.team;
    if(victimTeam<4){this.teams[victimTeam].deaths++;const respawnBase=this.rule.id==="LONG_RESPAWN"?10:6;u.respawn=respawnBase+this.rng.next()*3;}
    if(killerTeam>=0&&killerTeam<4&&killerTeam!==victimTeam){const killer=this.units[killerId],mult=this.rule.id==="KILL_X2"?2:this.rule.id==="FINAL_FRENZY"?1.5:1,bounty=this._leaderId()===victimTeam?2:0,points=(5+bounty)*mult;this.teams[killerTeam].score+=points;this.teams[killerTeam].kills++;this.teams[killerTeam].streak++;this.teams[killerTeam].maxStreak=Math.max(this.teams[killerTeam].maxStreak,this.teams[killerTeam].streak);if(killer){killer.kills++;if(this.time-killer.lastKill<2.3)killer.multi++;else killer.multi=1;killer.lastKill=this.time;if(killer.multi>=3)this.emit("MULTI_KILL",u.x,u.y,killerTeam,killer.id,points,73,true,`${fmtTeam(killerTeam)} ${killer.callsign}, ${killer.multi}연속 처치!`,{headline:`${killer.multi}× MULTI KILL`,zoom:.48,slowDuration:.55});}}
    if(victimTeam<4)this.teams[victimTeam].streak=0;this.effect("burst",u.x,u.y,{team:victimTeam});this.emit("UNIT_KILL",u.x,u.y,killerTeam,killerId,5,18,false,`${fmtTeam(killerTeam)} 팀이 ${fmtTeam(victimTeam)} 유닛을 쓰러뜨렸습니다.`);
  }
  _respawn(u,x,y){u.alive=true;u.x=x+(this.rng.next()-.5)*3;u.y=y+(this.rng.next()-.5)*3;u.px=u.x;u.py=u.y;u.hp=u.maxHp;u.shield=u.maxShield;u.cooldown=1;u.born=this.time;u.life=0;}

  _moveUnit(u,tx,ty,dt){
    if(!Number.isFinite(tx)||!Number.isFinite(ty))return;let dx=tx-u.x,dy=ty-u.y,goalDist=Math.hypot(dx,dy);if(goalDist<.12)return;
    let vx=dx/goalDist,vy=dy/goalDist;
    if(goalDist>3){const step=this._flowStep(u,tx,ty);if(step){vx=step.x-u.x;vy=step.y-u.y;const d=Math.hypot(vx,vy)||1;vx/=d;vy/=d;}}
    const friends=this._nearby(u.x,u.y,1.05,u.team,true);for(const f of friends)if(f.id!==u.id){const d2=dist2(u.x,u.y,f.x,f.y);if(d2>.001){vx+=(u.x-f.x)/d2*.08;vy+=(u.y-f.y)/d2*.08;}}
    if(this.chaosState.gravityX){vx+=this.chaosState.gravityX*.28;vy+=this.chaosState.gravityY*.28;}
    const norm=Math.hypot(vx,vy)||1;vx/=norm;vy/=norm;let speed=u.speed;
    const i=this.idx(clamp(u.x|0,0,this.n-1),clamp(u.y|0,0,this.n-1)),ter=this.terrain[i];if(ter===TERRAIN.WATER||this.chaosState.flood&&this.elevation[i]<105)speed*=.55;if(ter===TERRAIN.BOOST)speed*=1.35;if(this.rule.id==="HASTE")speed*=1.28;if(u.carrying)speed*=.68;
    const nx=u.x+vx*speed*dt,ny=u.y+vy*speed*dt;u.vx=vx*speed;u.vy=vy*speed;
    if(this.passable(nx,ny,u.team)){u.x=nx;u.y=ny}else if(this.passable(nx,u.y,u.team))u.x=nx;else if(this.passable(u.x,ny,u.team))u.y=ny;else{u.vx*=-.2;u.vy*=-.2;}
  }
  _flowStep(u,tx,ty){
    const gx=clamp(Math.round(tx),1,this.n-2),gy=clamp(Math.round(ty),1,this.n-2),key=`${gx},${gy},${this.pathVersion}`;let flow=this.flowCache.get(key);if(!flow){flow=this._makeFlow(gx,gy);this.flowCache.set(key,flow);if(this.flowCache.size>20)this.flowCache.delete(this.flowCache.keys().next().value);}
    const x=clamp(u.x|0,1,this.n-2),y=clamp(u.y|0,1,this.n-2);let best=flow[this.idx(x,y)];if(best<0)best=32767;let bx=x,by=y;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){if(!ox&&!oy)continue;const nx=x+ox,ny=y+oy;if(!this.passable(nx,ny,u.team))continue;const d=flow[this.idx(nx,ny)];if(d>=0&&d<best){best=d;bx=nx;by=ny;}}return bx===x&&by===y?null:{x:bx+.5,y:by+.5};
  }
  _makeFlow(gx,gy){const d=new Int16Array(this.cells);d.fill(-1);const q=new Int32Array(this.cells);let head=0,tail=0,gi=this.idx(gx,gy);if(!this.passable(gx,gy)){for(let r=1;r<8&&d[gi]<0;r++)for(let y=gy-r;y<=gy+r;y++)for(let x=gx-r;x<=gx+r;x++)if(this.passable(x,y)){gi=this.idx(x,y);gx=x;gy=y;r=99;break;}}d[gi]=0;q[tail++]=gi;while(head<tail){const i=q[head++],x=i%this.n,y=(i/this.n)|0,nd=d[i]+1;for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+ox,ny=y+oy;if(!this.passable(nx,ny))continue;const j=this.idx(nx,ny);if(d[j]<0){d[j]=nd;q[tail++]=j;}}}return d;}

  _support(u,dt){if(u.abilityCd>0)return;const allies=this._nearby(u.x,u.y,3.4,u.team,true).filter(a=>a.hp<a.maxHp*.88||a.shield<a.maxShield);if(!allies.length)return;allies.sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);const a=allies[0],power=(this.rule.id==="UTILITY_X2"?23:13)*(u.team===2?1.07:1);a.hp=Math.min(a.maxHp,a.hp+power);a.shield=Math.min(a.maxShield,a.shield+power*.7);u.healing+=power;this.teams[u.team].healing+=power;u.abilityCd=3.3;this.effect("heal",a.x,a.y,{team:u.team});}
  _engineer(u,dt){if(u.abilityCd<=0){const tower=this.towers.find(t=>t.team===u.team&&dist2(u.x,u.y,t.x,t.y)<16&&t.hp<t.maxHp);if(tower){const p=this.rule.id==="UTILITY_X2"?32:18;tower.hp=Math.min(tower.maxHp,tower.hp+p);u.objective+=p*.15;u.abilityCd=3.8;this.effect("repair",tower.x,tower.y,{team:u.team});}}if(u.barrierCd<=0&&this.barriers.length<18){const nearTower=this.towers.some(t=>t.team===u.team&&dist2(u.x,u.y,t.x,t.y)<22);if(nearTower){const x=clamp(Math.round(u.x+(u.vx||1)*1.5),2,this.n-3),y=clamp(Math.round(u.y+(u.vy||0)*1.5),2,this.n-3),i=this.idx(x,y);if(this.terrain[i]===TERRAIN.FLOOR&&this.structures[i]===STRUCTURE.NONE){this.terrain[i]=TERRAIN.WALL;this.wallHP[i]=this.rule.id==="UTILITY_X2"?160:90;this.barriers.push({x,y,team:u.team,expires:this.time+18});u.barrierCd=14;u.objective+=4;this.mapDirty=true;this.pathVersion++;this.flowCache.clear();this.effect("build",x,y,{team:u.team});}}}}

  _portalCheck(u){for(let i=0;i<this.portals.length;i++){const p=this.portals[i];if(!p.active)continue;if(dist2(u.x,u.y,p.x,p.y)<.65){const options=this.portals.filter(q=>q!==p&&q.active);if(options.length){const q=options[(i+1+u.id)%options.length];u.x=q.x+(this.rng.next()-.5)*2;u.y=q.y+(this.rng.next()-.5)*2;u.px=u.x;u.py=u.y;this.effect("teleport",u.x,u.y,{team:u.team});}break;}}}
  _objectiveContact(u){
    if(u.team>=4)return;
    if(this.crystal.active&&this.crystal.carrier<0&&dist2(u.x,u.y,this.crystal.x,this.crystal.y)<.75){this.crystal.carrier=u.id;u.carrying=true;const steal=this.crystal.lastTeam>=0&&this.crystal.lastTeam!==u.team;this.crystal.stolen=steal;if(steal){this.teams[u.team].crystalSteals++;this.emit("CRYSTAL_STEAL",u.x,u.y,u.team,u.id,0,82,true,`${fmtTeam(u.team)} 팀이 떨어진 수정을 가로챘습니다!`,{headline:"CRYSTAL STOLEN",zoom:.44,slowDuration:.65});}else this.emit("CRYSTAL_PICKUP",u.x,u.y,u.team,u.id,0,66,false,`${fmtTeam(u.team)} 팀이 중앙 수정을 확보했습니다.`,{headline:"CRYSTAL TAKEN",zoom:.42});}
    if(u.carrying){this.crystal.x=u.x;this.crystal.y=u.y;const core=this.teams[u.team].core;if(dist2(u.x,u.y,core.x,core.y)<9)this._scoreCrystal(u);}
  }
  _dropCrystal(u){u.carrying=false;this.crystal.carrier=-1;this.crystal.x=clamp(u.x,2,this.n-3);this.crystal.y=clamp(u.y,2,this.n-3);this.crystal.lastTeam=u.team;this.emit("CRYSTAL_DROP",u.x,u.y,u.team,u.id,0,78,true,`${fmtTeam(u.team)} 운반 유닛이 쓰러져 수정이 떨어졌습니다!`,{headline:"CRYSTAL DROPPED",zoom:.5,slowDuration:.6});}
  _scoreCrystal(u){const mult=this.rule.id==="CRYSTAL_X2"?2:this.rule.id==="FINAL_FRENZY"?1.7:1,points=Math.round(95*mult);this.teams[u.team].score+=points;this.teams[u.team].crystalScores++;u.objective+=points;u.carrying=false;this.crystal.active=false;this.crystal.carrier=-1;this.crystal.respawn=18;this.crystal.lastTeam=-1;this.emit("CRYSTAL_SCORE",u.x,u.y,u.team,u.id,points,94,this.remaining<20,`${fmtTeam(u.team)} 팀이 수정을 반납해 ${points}점을 획득했습니다!`,{headline:"CRYSTAL SECURED",zoom:.48,slowDuration:.9});}

  _updateObjectives(dt){
    if(!this.crystal.active){this.crystal.respawn-=dt;if(this.crystal.respawn<=0){this.crystal.active=true;this.crystal.x=this.n/2;this.crystal.y=this.n/2;this.emit("CRYSTAL_SPAWN",this.crystal.x,this.crystal.y,-1,-1,0,55,false,"중앙 수정이 다시 활성화되었습니다.");}}
    for(const tower of this.towers){
      const present=[0,0,0,0];for(const u of this._nearby(tower.x,tower.y,3.2,-1,false))if(u.team<4)present[u.team]++;
      const max=Math.max(...present),contenders=present.filter(v=>v===max&&v>0).length;if(max>0&&contenders===1){const team=present.indexOf(max);for(let t=0;t<4;t++)tower.capture[t]=clamp(tower.capture[t]+(t===team?dt*(1+max*.13):-dt*.45),0,8);if(tower.capture[team]>=8&&tower.team!==team){const prev=tower.team;tower.team=team;tower.capture.fill(0);this.structureTeam[this.idx(tower.x,tower.y)]=team;this.teams[team].towerCaptures++;this.teams[team].score+=18;this.emit("TOWER_CAPTURE",tower.x,tower.y,team,-1,18,70,false,`${fmtTeam(team)} 팀이 ${tower.name}를 점령했습니다!`,{headline:"TOWER CAPTURED",zoom:.45});if(prev>=0)this.emit("TOWER_LOST",tower.x,tower.y,prev,-1,0,35,false,`${fmtTeam(prev)} 팀이 ${tower.name}를 빼앗겼습니다.`);}}
      if(tower.team>=0){tower.shotCd-=dt;if(tower.shotCd<=0){const foes=this._nearby(tower.x,tower.y,8,tower.team,false).filter(v=>v.team!==4);if(foes.length){const e=foes[0];this._damageUnit(e,14,tower.team,-1);this.effect("towerBeam",tower.x,tower.y,{tx:e.x,ty:e.y,team:tower.team});tower.shotCd=.8;}}}
    }
    if(!this.boss.spawned&&this.time>this.config.duration*.42)this._spawnBoss(false);if(this.boss.active)this._updateBoss(dt);if(this.fortress.active)this._updateFortress(dt);
    this._updateCores(dt);this._expireStructures();
  }
  _spawnBoss(invasion){if(this.boss.active)return;const type=this.rng.int(0,3);this.boss={active:true,spawned:true,type,name:BOSS_NAMES[type],x:invasion?this.rng.int(this.n*.2,this.n*.8):this.n/2,y:invasion?this.rng.int(this.n*.2,this.n*.8):this.n/2,hp:invasion?1350:1050,maxHp:invasion?1350:1050,attackCd:2,damage:[0,0,0,0]};this.emit("BOSS_SPAWN",this.boss.x,this.boss.y,-1,-1,0,86,false,`${this.boss.name}이 경기장에 출현했습니다!`,{headline:"BOSS ARRIVAL",subtitle:this.boss.name,zoom:.42});}
  _updateBoss(dt){const b=this.boss;b.attackCd-=dt;const attackers=this._nearby(b.x,b.y,8,-1,false).filter(u=>u.team<4);for(const u of attackers)if(u.cooldown<=0&&dist2(u.x,u.y,b.x,b.y)<=u.range*u.range+4){const dmg=u.attack*.68;b.hp-=dmg;b.damage[u.team]+=dmg;this.teams[u.team].bossDamage+=dmg;u.damage+=dmg;u.cooldown=ROLE[u.role].cooldown;this.effect("bossHit",b.x,b.y,{team:u.team});this.teams[u.team].score+=dmg*(this.rule.id==="BOSS_X2"?.055:.026);if(b.hp<=0){this._bossDefeated(u.team,u.id);return;}}
    if(b.attackCd<=0&&attackers.length){b.attackCd=b.type===1?1.5:2.4;const count=b.type===1?Math.min(5,attackers.length):Math.min(2,attackers.length);for(let i=0;i<count;i++)this._damageUnit(attackers[i],b.type===0?38:24,-1,-1);this.effect("bossAttack",b.x,b.y,{bossType:b.type,radius:b.type===0?6:4});}
    if(b.type===1){b.x=clamp(b.x+Math.cos(this.time*.8)*dt*2.2,4,this.n-5);b.y=clamp(b.y+Math.sin(this.time*.73)*dt*2.2,4,this.n-5);}else if(b.type===3){b.x=clamp(b.x+Math.cos(this.time*.25)*dt*.8,4,this.n-5);}
  }
  _bossDefeated(lastTeam,lastUnit){const b=this.boss,total=b.damage.reduce((a,v)=>a+v,0)||1;for(let t=0;t<4;t++){const share=b.damage[t]/total,points=Math.round(120*share+(t===lastTeam?18:0));this.teams[t].score+=points;}b.active=false;this.emit("BOSS_DEFEATED",b.x,b.y,lastTeam,lastUnit,0,96,true,`${b.name} 처치! 기여도에 따라 보상이 배분됩니다.`,{headline:"BOSS DOWN",zoom:.52,slowDuration:1.1});}
  _updateFortress(dt){const f=this.fortress,near=[0,0,0,0];for(const u of this._nearby(f.x,f.y,5,-1,false))if(u.team<4)near[u.team]++;const max=Math.max(...near);f.team=max>0&&near.filter(v=>v===max).length===1?near.indexOf(max):-1;let dx=f.targetX-f.x,dy=f.targetY-f.y,d=Math.hypot(dx,dy)||1;f.x+=dx/d*dt*1.15;f.y+=dy/d*dt*1.15;f.progress+=dt;if(f.team>=0){this.teams[f.team].score+=dt*.7;for(const e of this._nearby(f.x,f.y,6,f.team,false).slice(0,1)){this._damageUnit(e,dt*16,f.team,-1);this.effect("towerBeam",f.x,f.y,{tx:e.x,ty:e.y,team:f.team});}}if(d<2||f.progress>55){if(f.team>=0){this.teams[f.team].score+=75;this.emit("FORTRESS_ESCORT",f.x,f.y,f.team,-1,75,78,false,`${fmtTeam(f.team)} 팀이 이동 요새를 목적지까지 호위했습니다!`,{headline:"ESCORT COMPLETE",zoom:.46});}f.active=false;}}
  _updateCores(dt){for(const team of this.teams){const c=team.core;if(!c.alive)continue;const foes=this._nearby(c.x,c.y,6.5,team.id,false).filter(u=>u.team<4);for(const u of foes){if(u.cooldown<=0){let dmg=u.attack*.52;if(this.time<this.config.duration*.25)dmg*=.32;let left=dmg;if(c.shield>0){const s=Math.min(c.shield,left);c.shield-=s;left-=s;if(c.shield<=0&&!c.shieldCalled){c.shieldCalled=true;this.emit("CORE_SHIELD_BREAK",c.x,c.y,team.id,u.id,0,86,true,`${team.name} 팀 본진 보호막이 파괴됐습니다!`,{headline:"CORE SHIELD BREAK",zoom:.48,slowDuration:.7});}}c.hp-=left;u.cooldown=ROLE[u.role].cooldown;this.teams[u.team].coreDamage+=dmg;const mult=this.rule.id==="CORE_X2"?2:this.rule.id==="FINAL_FRENZY"?1.5:1;this.teams[u.team].score+=dmg*.035*mult;this.effect("coreHit",c.x,c.y,{team:team.id,attacker:u.team});if(c.hp<=0)this._destroyCore(team,u.team,u.id);}}
      if(!foes.length&&c.shield<c.maxShield*.55)c.shield=Math.min(c.maxShield*.55,c.shield+dt*1.4);
    }for(const team of this.teams)if(!team.eliminated&&!team.core.alive&&!this.towers.some(t=>t.team===team.id)&&!this.units.some(u=>u.team===team.id&&u.alive)){team.eliminated=true;this.emit("TEAM_ELIMINATED",team.core.x,team.core.y,team.id,-1,0,92,true,`${team.name} 팀의 모든 부활 지점과 유닛이 사라졌습니다.`,{headline:"TEAM ELIMINATED",zoom:.42,slowDuration:.8});}}
  _destroyCore(team,attacker,id){team.core.alive=false;team.core.hp=0;this.teams[attacker].score+=110;this.emit("CORE_DESTROYED",team.core.x,team.core.y,attacker,id,110,99,true,`${fmtTeam(attacker)} 팀이 ${team.name} 팀 코어를 파괴했습니다!`,{headline:"CORE BREAK",subtitle:`${team.name} 본진 파괴`,zoom:.54,slowDuration:1.2});}
  _expireStructures(){const before=this.barriers.length;this.barriers=this.barriers.filter(b=>{if(this.time>=b.expires){const i=this.idx(b.x,b.y);if(this.structures[i]===STRUCTURE.NONE){this.terrain[i]=TERRAIN.FLOOR;this.wallHP[i]=0;}return false}return true});if(before!==this.barriers.length){this.mapDirty=true;this.pathVersion++;this.flowCache.clear();}for(const p of this.portals)if(p.wild&&this.time>=p.expires){p.active=false;this.structures[this.idx(p.x,p.y)]=STRUCTURE.NONE;this.mapDirty=true;}}

  _updateTerritory(dt){
    if(this.tick%4!==0)return;const delta=dt*4;
    const start=(this.tick*13)%this.units.length;for(let k=0;k<this.units.length;k++){const u=this.units[(k+start)%this.units.length];if(!u.alive)continue;const x=clamp(u.x|0,1,this.n-2),y=clamp(u.y|0,1,this.n-2),power=(u.role===0?2.5:u.role===2?1.1:1.6)*delta;for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){const i=this.idx(x+ox,y+oy);if(this.terrain[i]===TERRAIN.WALL||this.terrain[i]===TERRAIN.VOID)continue;const old=this.owner[i];if(old===u.team)this.influence[i]=Math.min(100,this.influence[i]+power*.55);else{this.influence[i]-=power;if(this.influence[i]<=0){this.owner[i]=u.team;this.influence[i]=12;this.ownerDirty=true;u.captures++;}}}}
    if(this.tick%40===0){const counts=[0,0,0,0];for(let i=0;i<this.cells;i++)if(this.owner[i]>=0)counts[this.owner[i]]++;for(let t=0;t<4;t++){this.teams[t].territory=counts[t];this.teams[t].maxTerritory=Math.max(this.teams[t].maxTerritory,counts[t]);}}
  }
  _updateScores(dt){
    if(this.tick%40===0){const territoryMult=this.rule.id==="TERRITORY_X2"?2:this.rule.id==="FINAL_FRENZY"?1.45:1,towerMult=this.rule.id==="TOWER_X2"?2:this.rule.id==="FINAL_FRENZY"?1.5:1;for(const t of this.teams){const centerOnly=this.rule.id==="CENTER_ONLY";t.score+=(centerOnly?this._centerTerritory(t.id):t.territory)/this.cells*22*territoryMult;const towers=this.towers.filter(v=>v.team===t.id).length;t.score+=towers*1.1*towerMult;if(this.rule.id==="SURVIVOR")t.score+=this.units.filter(u=>u.team===t.id&&u.alive&&u.life>25).length*.15;}}
    this.scoreHistoryTimer+=dt;if(this.scoreHistoryTimer>=5){this.scoreHistoryTimer=0;this._recordScores();}
  }
  _centerTerritory(team){let c=0,r=this.n*.22,cx=this.n/2,cy=this.n/2;for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++)if(this.owner[this.idx(x,y)]===team)c++;return c*4;}
  _recordScores(){this.scoreHistory.push({t:this.time,s:this.teams.map(v=>Math.round(v.score))});if(this.scoreHistory.length>90)this.scoreHistory.shift();}
  _leaderId(){let id=0;for(let t=1;t<4;t++)if(this.teams[t].score>this.teams[id].score)id=t;return id;}
  _updateLeader(){const id=this._leaderId();if(this.lastLeader>=0&&id!==this.lastLeader){const gap=Math.abs(this.teams[id].score-this.teams[this.lastLeader].score);this.emit("LEADER_CHANGE",this.n/2,this.n/2,id,-1,0,83,this.remaining<15,`현재 선두가 ${fmtTeam(this.lastLeader)}에서 ${fmtTeam(id)}으로 바뀌었습니다!`,{headline:"LEADER CHANGE",subtitle:`${fmtTeam(id)} 팀 선두`,zoom:.22,slowDuration:.55});}this.lastLeader=id;const sorted=this.teams.slice().sort((a,b)=>b.score-a.score);sorted.forEach((v,i)=>v.rank=i+1);}
  _finishOrOvertime(){const sorted=this.teams.slice().sort((a,b)=>b.score-a.score);if(!this.overtime&&Math.abs(sorted[0].score-sorted[1].score)<1){this.overtime=true;this.remaining=45;this.rule=RULES.find(r=>r.id==="FINAL_FRENZY");this.emit("OVERTIME",this.n/2,this.n/2,-1,-1,0,99,true,"동점! 중앙 최종 수정을 놓고 연장전에 돌입합니다!",{headline:"OVERTIME",zoom:.2,slowDuration:1});this.crystal.active=true;this.crystal.x=this.n/2;this.crystal.y=this.n/2;return;}this.ended=true;this.phase="RESULT";this.winner=sorted[0].id;this._recordScores();this.emit("MATCH_END",this.n/2,this.n/2,this.winner,-1,0,100,true,`${fmtTeam(this.winner)} 팀이 CHAOS WORLD CUP 우승을 차지했습니다!`,{headline:"CHAMPION",zoom:.2,slowDuration:1.5});}

  getResult(){
    const ranks=this.teams.slice().sort((a,b)=>b.score-a.score),living=this.units.slice().sort((a,b)=>b.life-a.life)[0],damage=this.units.slice().sort((a,b)=>b.damage-a.damage)[0],heal=this.units.slice().sort((a,b)=>b.healing-a.healing)[0],objective=this.units.slice().sort((a,b)=>b.objective-a.objective)[0],kills=this.units.slice().sort((a,b)=>b.kills-a.kills)[0];
    const mvp=this.units.slice().sort((a,b)=>(b.damage*.12+b.healing*.22+b.objective+b.kills*10)-(a.damage*.12+a.healing*.22+a.objective+a.kills*10))[0];
    return{seed:this.seed,duration:this.time,winner:this.winner,teams:ranks.map(t=>({id:t.id,score:Math.round(t.score),kills:t.kills,territory:t.maxTerritory,towers:t.towerCaptures,crystals:t.crystalScores,steals:t.crystalSteals,boss:Math.round(t.bossDamage),core:Math.round(t.coreDamage)})),history:this.scoreHistory,chaos:[...new Set(this.chaosUsed)],awards:[{title:"종합 MVP",icon:"★",unit:mvp?.callsign,team:mvp?.team},{title:"최고 공격수",icon:"⚔",unit:damage?.callsign,team:damage?.team},{title:"최고 지원가",icon:"✚",unit:heal?.callsign,team:heal?.team},{title:"목표 해결사",icon:"◇",unit:objective?.callsign,team:objective?.team},{title:"처치왕",icon:"♜",unit:kills?.callsign,team:kills?.team},{title:"생존왕",icon:"⌛",unit:living?.callsign,team:living?.team}],highlights:this.eventLog.slice().sort((a,b)=>b.importance-a.importance).slice(0,4)};
  }

  snapshot(full=false){
    const sendMap=full||this.mapDirty,sendOwner=full||this.ownerDirty||this.tick%10===0;
    const snap={seed:this.seed,size:this.n,time:this.time,remaining:Math.max(0,this.remaining),phase:this.phase,countdown:Math.max(0,this.countdown),overtime:this.overtime,rule:{...this.rule,remaining:this.ruleRemaining,warning:this.ruleWarning},slowMotion:this.slowMotion,teams:this.teams.map(t=>({id:t.id,score:Math.round(t.score),rank:t.rank,kills:t.kills,territory:t.territory,strategy:this.strategyKorean(t.strategy),priority:t.opPriority,core:{...t.core}})),units:this.units.map(u=>[u.x,u.y,u.px,u.py,u.team,u.role,u.hp/u.maxHp,u.maxShield?u.shield/u.maxShield:0,u.alive?1:0,u.carrying?1:0,u.id,u.squad]),ghosts:this.ghosts.map(u=>[u.x,u.y,u.px,u.py,4,u.role,u.hp/u.maxHp,0,u.alive?1:0,0,u.id,0]),towers:this.towers.map(t=>({id:t.id,x:t.x,y:t.y,team:t.team,hp:t.hp/t.maxHp,capture:t.capture})),portals:this.portals.filter(p=>p.active).map(p=>({x:p.x,y:p.y,wild:!!p.wild})),crystal:{...this.crystal},boss:{...this.boss},fortress:{...this.fortress},chaos:{active:this.chaosState.active?.id||null,name:this.chaosState.active?.name||"",remaining:this.chaosState.remaining,gravityX:this.chaosState.gravityX,gravityY:this.chaosState.gravityY,blackout:this.chaosState.blackout,flood:this.chaosState.flood,collapse:this.chaosState.collapse,divide:this.chaosState.divide,storm:this.chaosState.storm,meteors:this.meteors||[]},events:this.events.splice(0),effects:this.effects.splice(0),debug:{tick:this.tick,flowFields:this.flowCache.size,pathVersion:this.pathVersion,alive:this.units.filter(u=>u.alive).length,ghosts:this.ghosts.length},ended:this.ended,result:this.ended?this.getResult():null};
    if(sendMap){snap.map={terrain:this.terrain.slice(),structures:this.structures.slice(),structureTeam:this.structureTeam.slice(),elevation:this.elevation.slice()};this.mapDirty=false;}
    if(sendOwner){snap.owner=this.owner.slice();this.ownerDirty=false;}
    return snap;
  }
}

export function runBalanceTest({matches=12,size=80,duration=150}={}){
  const wins=[0,0,0,0],scores=[0,0,0,0],details=[];
  for(let i=0;i<matches;i++){const seed=(0xabc000+Math.imul(i,0x9e3779b9))>>>0,sim=new Simulation({size,unitsPerTeam:24,duration,seed,fast:true,chaosFrequency:"normal"});sim.phase="LIVE";sim.countdown=0;let guard=duration*20+1000;while(!sim.ended&&guard-->0)sim.step(.05);wins[sim.winner]++;for(let t=0;t<4;t++)scores[t]+=sim.teams[t].score;details.push({seed:sim.seed,winner:sim.winner,duration:sim.time});}
  return{matches,wins,averageScores:scores.map(v=>Math.round(v/matches)),details};
}
