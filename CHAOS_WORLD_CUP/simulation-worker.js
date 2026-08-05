import { Simulation, runBalanceTest } from "./simulation.js";

let sim=null;
let paused=false;
let hidden=false;
let speed=1;
let stepBudget=0;
let timer=null;
let lastPost=0;

function begin(config){
  sim=new Simulation(config);
  paused=false;
  speed=Number(config.speed)||1;
  stepBudget=0;
  lastPost=0;
  if(timer)clearInterval(timer);
  timer=setInterval(loop,50);
  postMessage({type:"ready",snapshot:sim.snapshot(true)});
}

function loop(){
  if(!sim)return;
  if(!paused&&!hidden&&!sim.ended){
    stepBudget+=speed*(sim.slowMotion||1);
    let guard=12;
    while(stepBudget>=1&&guard-->0){sim.step(.05);stepBudget-=1;}
  }
  const now=performance.now();
  if(now-lastPost>=50){postMessage({type:"snapshot",snapshot:sim.snapshot(false)});lastPost=now;}
}

self.onmessage=e=>{
  const m=e.data||{};
  try{
    if(m.type==="init"||m.type==="newMatch")begin(m.config||{});
    else if(m.type==="pause")paused=!!m.value;
    else if(m.type==="speed")speed=[1,2,4].includes(+m.value)?+m.value:1;
    else if(m.type==="visibility")hidden=!!m.hidden;
    else if(m.type==="chaos")postMessage({type:"chaosResult",accepted:sim?.injectChaos(m.id)||false});
    else if(m.type==="snapshot"&&sim)postMessage({type:"snapshot",snapshot:sim.snapshot(!!m.full)});
    else if(m.type==="benchmark")postMessage({type:"benchmark",result:runBalanceTest(m.config||{})});
  }catch(error){postMessage({type:"error",message:error?.stack||String(error)});}
};

self.addEventListener("error",e=>postMessage({type:"error",message:e.message||"Worker error"}));
