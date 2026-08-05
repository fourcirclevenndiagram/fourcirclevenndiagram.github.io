import { TEAM_COLORS, TERRAIN, STRUCTURE } from "./simulation.js";

const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const hex=(s,a=1)=>{const n=parseInt(s.slice(1),16);return[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255,a]};
const NEUTRAL=[.72,.78,.9,1];

export class ArenaRenderer {
  constructor(canvas,{quality="auto"}={}){
    this.canvas=canvas;this.quality=quality;this.gl=null;this.ctx=null;this.mode="auto";this.followTeam=-1;this.snapshot=null;this.lastSnapshotAt=performance.now();this.map=null;this.owner=null;this.particles=[];this.maxParticles=quality==="low"?260:quality==="high"?1000:600;this.fps=60;this.frames=0;this.fpsAt=performance.now();this.renderScale=1;this.camera={x:50,y:50,zoom:1,tx:50,ty:50,tzoom:1,shake:0};this.focusUntil=0;this.lastAutoPick=0;this.lastEventId=0;this.mapTextureDirty=true;this.mapCanvas=document.createElement("canvas");this.mapCtx=this.mapCanvas.getContext("2d",{alpha:false});this.unitBuffer=null;this.programs={};this.lost=false;
    this._init();this.resize();
    canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();this.lost=true;});
    canvas.addEventListener("webglcontextrestored",()=>{this.lost=false;this._initGL();this.mapTextureDirty=true;});
  }

  _init(){
    this.gl=this.canvas.getContext("webgl2",{alpha:false,antialias:false,powerPreference:"high-performance",preserveDrawingBuffer:false});
    if(this.gl){try{this._initGL();return}catch(err){console.warn("WebGL2 renderer fallback",err);this.gl=null;}}
    this.ctx=this.canvas.getContext("2d",{alpha:false,desynchronized:true});
  }
  _shader(type,source){const gl=this.gl,s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  _program(vs,fs){const gl=this.gl,p=gl.createProgram();gl.attachShader(p,this._shader(gl.VERTEX_SHADER,vs));gl.attachShader(p,this._shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  _initGL(){
    const gl=this.gl;
    const mapVS=`#version 300 es
      in vec2 a_pos; out vec2 v_uv;
      void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}`;
    const mapFS=`#version 300 es
      precision highp float; in vec2 v_uv; out vec4 outColor;
      uniform sampler2D u_map; uniform vec2 u_res; uniform vec2 u_cam; uniform float u_scale; uniform float u_size; uniform float u_time; uniform float u_flood; uniform float u_collapse; uniform float u_divide;
      void main(){
        vec2 screen=vec2(v_uv.x,1.-v_uv.y)-.5; vec2 world=u_cam+screen*u_res/u_scale; vec2 uv=world/u_size;
        if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.)))){outColor=vec4(.005,.007,.014,1.);return;}
        vec3 c=texture(u_map,uv).rgb;
        vec2 g=abs(fract(world)-.5);float grid=smoothstep(.485,.499,max(g.x,g.y))*smoothstep(2.,6.,u_scale);c+=grid*vec3(.08,.12,.2);
        float edge=min(min(world.x,world.y),min(u_size-world.x,u_size-world.y));float limit=u_size*u_collapse;
        if(u_collapse>0.&&edge<limit){float q=clamp((limit-edge)/6.,0.,1.);c=mix(c,vec3(.38,.025,.08),.55+.25*sin((world.x+world.y)*2.+u_time*7.));c+=q*.14;}
        if(u_flood>0.)c=mix(c,vec3(.02,.19,.31),.16+.07*sin(world.y*.7+u_time*2.));
        if(u_divide>0.&&abs(world.x-u_size*.5)<.8&&abs(world.y-u_size*.5)>u_size*.08)c+=vec3(.38,.04,.62)*(1.-abs(world.x-u_size*.5)/.8);
        float vignette=1.-smoothstep(.25,.78,length(screen));c*=mix(.55,1.,vignette);c+=vec3(.007,.012,.025);
        outColor=vec4(c,1.);
      }`;
    const pointVS=`#version 300 es
      precision highp float; in vec2 a_pos; in vec4 a_color; in float a_size; in float a_shape; in float a_health;
      out vec4 v_color; out float v_shape; out float v_health;
      uniform vec2 u_res;uniform vec2 u_cam;uniform float u_scale;uniform float u_glow;
      void main(){vec2 s=(a_pos-u_cam)*u_scale;vec2 clip=vec2(s.x/(u_res.x*.5),-s.y/(u_res.y*.5));gl_Position=vec4(clip,0.,1.);gl_PointSize=clamp(a_size*u_scale*(1.+u_glow*1.55),2.,96.);v_color=a_color;v_shape=a_shape;v_health=a_health;}`;
    const pointFS=`#version 300 es
      precision highp float;in vec4 v_color;in float v_shape;in float v_health;out vec4 outColor;uniform float u_glow;uniform float u_time;
      void main(){vec2 p=gl_PointCoord*2.-1.;float d;
        if(v_shape<.5)d=length(p);
        else if(v_shape<1.5)d=max(abs(p.x)*.866+p.y*.5,-p.y);
        else if(v_shape<2.5)d=max(abs(p.x)*.866+abs(p.y)*.5,abs(p.y));
        else if(v_shape<3.5)d=abs(p.x)+abs(p.y);
        else if(v_shape<4.5)d=max(abs(p.x),abs(p.y));
        else if(v_shape<5.5)d=abs(length(p)-.62)+.18;
        else d=length(p);
        float a=1.-smoothstep(u_glow>.5?.28:.76,u_glow>.5?1.:.98,d);if(a<=0.)discard;
        vec3 c=v_color.rgb;if(u_glow<.5){float rim=smoothstep(.42,.82,d);c=mix(c,vec3(1.),(1.-rim)*.35);if(v_health<.35)c=mix(c,vec3(1.,.12,.2),.24+.14*sin(u_time*11.));}
        outColor=vec4(c,a*v_color.a*(u_glow>.5?.22:1.));
      }`;
    this.programs.map=this._program(mapVS,mapFS);this.programs.point=this._program(pointVS,pointFS);
    this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    this.unitBuffer=gl.createBuffer();this.mapTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.mapTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  }

  setQuality(q){this.quality=q;this.maxParticles=q==="low"?260:q==="high"?1000:600;this.resize();}
  resize(){
    const rect=this.canvas.getBoundingClientRect(),baseDpr=Math.min(devicePixelRatio||1,this.quality==="low"?1:this.quality==="high"?2:1.6),dpr=baseDpr*this.renderScale,w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;if(this.gl)this.gl.viewport(0,0,w,h);}
    this.cssWidth=rect.width;this.cssHeight=rect.height;this.dpr=dpr;
  }
  setSnapshot(s){
    const fresh=!this.snapshot||this.snapshot.seed!==s.seed||this.snapshot.size!==s.size;this.snapshot=s;this.lastSnapshotAt=performance.now();
    if(fresh){this.camera.x=this.camera.tx=s.size/2;this.camera.y=this.camera.ty=s.size/2;this.camera.zoom=this.camera.tzoom=1;this.focusUntil=0;this.particles.length=0;}
    if(s.map){this.map=s.map;this.mapCanvas.width=s.size;this.mapCanvas.height=s.size;this.mapTextureDirty=true;}
    if(s.owner){this.owner=s.owner;this.mapTextureDirty=true;}
    if(s.effects)for(const e of s.effects)this._spawnEffect(e);
    if(s.events)for(const e of s.events){if(e.id>this.lastEventId){this.lastEventId=e.id;if(e.importance>=65)this.focusEvent(e);}}
  }

  _spawnEffect(e){
    const cap=this.maxParticles-this.particles.length;if(cap<=0)return;const color=e.team>=0&&e.team<4?hex(TEAM_COLORS[e.team]):NEUTRAL;
    const add=(x,y,vx,vy,life,size,shape=0,c=color)=>{if(this.particles.length<this.maxParticles)this.particles.push({x,y,vx,vy,life,max:life,size,shape,color:c});};
    if(["projectile","towerBeam"].includes(e.type)){const steps=e.type==="towerBeam"?12:6;for(let i=0;i<steps;i++){const t=i/(steps-1);add(lerp(e.x,e.tx,t),lerp(e.y,e.ty,t),0,0,e.type==="towerBeam"?.18:.28,e.type==="towerBeam"?.33:.22,0,color);}}
    else if(e.type==="burst"||e.type==="meteor"||e.type==="bossAttack"){const count=e.type==="meteor"?Math.min(cap,52):Math.min(cap,18);for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,sp=(e.radius||3)*(.5+Math.random()*1.6);add(e.x,e.y,Math.cos(a)*sp,Math.sin(a)*sp,.45+Math.random()*.65,.25+Math.random()*.55,i%4===0?5:0,color);}add(e.x,e.y,0,0,.55,(e.radius||3)*1.3,5,color);this.camera.shake=Math.max(this.camera.shake,e.type==="meteor"?1.4:.65);}
    else if(["heal","repair","build","teleport","shield","coreHit","bossHit"].includes(e.type)){for(let i=0;i<Math.min(cap,10);i++){const a=Math.random()*Math.PI*2,sp=.3+Math.random()*1.5;const c=e.type==="heal"?[.25,1,.6,1]:color;add(e.x+Math.cos(a)*.5,e.y+Math.sin(a)*.5,Math.cos(a)*sp,Math.sin(a)*sp,.4+Math.random()*.5,.2+Math.random()*.35,e.type==="shield"?5:0,c);}}
    else if(e.type==="warning")add(e.x,e.y,0,0,e.t||1.2,(e.radius||4)*1.6,5,[1,.16,.26,.9]);
    else if(e.type==="gravity")for(let i=0;i<Math.min(cap,8);i++)add(e.x+(Math.random()-.5)*50,e.y+(Math.random()-.5)*50,e.vx*6,e.vy*6,.9,.18,0,[.72,.58,1,.55]);
  }
  _updateParticles(dt){for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.life-=dt;if(p.life<=0){this.particles.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;}}

  focusEvent(e){if(this.mode!=="auto"||performance.now()<this.focusUntil&&e.importance<88)return;this.camera.tx=e.x;this.camera.ty=e.y;this.camera.tzoom=clamp(1/(e.zoom||.34),1.15,7);this.focusUntil=performance.now()+Math.max(1900,(e.duration||2.5)*1000);if(e.importance>84)this.camera.shake=Math.max(this.camera.shake,.25);}
  setMode(mode,team=-1){this.mode=mode;this.followTeam=team;if(mode==="full"){this.camera.tx=this.snapshot?.size/2||50;this.camera.ty=this.snapshot?.size/2||50;this.camera.tzoom=1;}if(mode==="auto")this.focusUntil=0;}
  resetFull(){this.setMode("full");}
  pan(dx,dy){if(!this.snapshot)return;this.mode="manual";this.camera.tx=clamp(this.camera.tx-dx/(this._fitScaleCSS()*this.camera.tzoom),0,this.snapshot.size);this.camera.ty=clamp(this.camera.ty-dy/(this._fitScaleCSS()*this.camera.tzoom),0,this.snapshot.size);this.focusUntil=performance.now()+6000;}
  zoomAt(factor,sx,sy){if(!this.snapshot)return;this.mode="manual";const old=this.camera.tzoom;this.camera.tzoom=clamp(old*factor,1,8);const scale=this._fitScaleCSS()*old,wx=this.camera.tx+(sx-this.cssWidth/2)/scale,wy=this.camera.ty+(sy-this.cssHeight/2)/scale;const newScale=this._fitScaleCSS()*this.camera.tzoom;this.camera.tx=wx-(sx-this.cssWidth/2)/newScale;this.camera.ty=wy-(sy-this.cssHeight/2)/newScale;this.focusUntil=performance.now()+6000;}
  pick(sx,sy){if(!this.snapshot)return null;const scale=this._fitScaleCSS()*this.camera.zoom,wx=this.camera.x+(sx-this.cssWidth/2)/scale,wy=this.camera.y+(sy-this.cssHeight/2)/scale;let best=null,bd=2.4**2;for(const u of this.snapshot.units){if(!u[8])continue;const d=(u[0]-wx)**2+(u[1]-wy)**2;if(d<bd){bd=d;best=u;}}if(best){this.mode="manual";this.camera.tx=best[0];this.camera.ty=best[1];this.camera.tzoom=Math.max(this.camera.tzoom,4.5);this.focusUntil=performance.now()+5000;}return best;}
  _fitScale(){if(!this.snapshot)return 4;return Math.min(this.canvas.width,this.canvas.height)/(this.snapshot.size*1.04);}
  _fitScaleCSS(){if(!this.snapshot)return 4;return Math.min(this.cssWidth||this.canvas.clientWidth,this.cssHeight||this.canvas.clientHeight)/(this.snapshot.size*1.04);}

  _autoCamera(now){
    const s=this.snapshot;if(!s)return;
    if(this.mode==="full"){this.camera.tx=s.size/2;this.camera.ty=s.size/2;this.camera.tzoom=1;return;}
    if(this.mode==="team"||this.mode==="leader"){
      const team=this.mode==="leader"?s.teams.slice().sort((a,b)=>a.rank-b.rank)[0].id:this.followTeam,alive=s.units.filter(u=>u[4]===team&&u[8]);if(alive.length){let x=0,y=0;for(const u of alive){x+=u[0];y+=u[1]}this.camera.tx=x/alive.length;this.camera.ty=y/alive.length;this.camera.tzoom=2.05;}return;
    }
    if(this.mode!=="auto"||now<this.focusUntil)return;
    if(now-this.lastAutoPick<3000)return;this.lastAutoPick=now;
    const bins=Array.from({length:64},()=>({count:0,teams:0,x:0,y:0}));for(const u of s.units){if(!u[8])continue;const bx=clamp(Math.floor(u[0]/s.size*8),0,7),by=clamp(Math.floor(u[1]/s.size*8),0,7),b=bins[by*8+bx];b.count++;b.teams|=1<<u[4];b.x+=u[0];b.y+=u[1];}
    let best=null,score=-1;for(const b of bins){const teamCount=((b.teams&1)>0)+((b.teams&2)>0)+((b.teams&4)>0)+((b.teams&8)>0),v=b.count*(1+teamCount*.75);if(teamCount>1&&v>score){best=b;score=v;}}
    if(best){this.camera.tx=best.x/best.count;this.camera.ty=best.y/best.count;this.camera.tzoom=clamp(5-Math.sqrt(best.count)*.36,2,4.5);this.focusUntil=now+2300;}else{this.camera.tx=s.size/2;this.camera.ty=s.size/2;this.camera.tzoom=1.3;}
  }

  render(now=performance.now()){
    if(!this.snapshot||this.lost)return;const dt=Math.min(.05,(now-(this.lastRender||now))/1000);this.lastRender=now;this._updateParticles(dt);this._autoCamera(now);
    const k=1-Math.pow(.0008,dt),cam=this.camera;cam.x=lerp(cam.x,cam.tx,k);cam.y=lerp(cam.y,cam.ty,k);cam.zoom=lerp(cam.zoom,cam.tzoom,k);cam.shake*=Math.pow(.06,dt);let shakeX=0,shakeY=0;if(cam.shake>.01){shakeX=(Math.random()-.5)*cam.shake;shakeY=(Math.random()-.5)*cam.shake;}
    if(this.gl)this._renderGL(now,shakeX,shakeY);else this._render2D(now,shakeX,shakeY);
    this.frames++;if(now-this.fpsAt>1000){this.fps=this.frames*1000/(now-this.fpsAt);this.frames=0;this.fpsAt=now;if(this.quality==="auto"){if(this.fps<38&&this.renderScale>.72){this.renderScale*=.88;this.resize();}else if(this.fps>57&&this.renderScale<1){this.renderScale=Math.min(1,this.renderScale*1.04);this.resize();}}}
  }

  _rebuildMapTexture(){
    if(!this.map||!this.owner)return;const n=this.snapshot.size,c=this.mapCtx,terrain=this.map.terrain;c.clearRect(0,0,n,n);
    const tc=["#07111d","#251449","#0d3042","#14422e","#164332","#401429","#010207"];
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;c.fillStyle=tc[terrain[i]]||tc[0];c.fillRect(x,y,1,1);const o=this.owner[i];if(o>=0){c.globalAlpha=.27;c.fillStyle=TEAM_COLORS[o];c.fillRect(x,y,1,1);c.globalAlpha=1;}}
    const gl=this.gl;if(gl){gl.bindTexture(gl.TEXTURE_2D,this.mapTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,this.mapCanvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}this.mapTextureDirty=false;
  }

  _renderGL(now,sx,sy){
    const gl=this.gl,s=this.snapshot;if(this.mapTextureDirty)this._rebuildMapTexture();const scale=this._fitScale()*this.camera.zoom;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.002,.004,.009,1);gl.clear(gl.COLOR_BUFFER_BIT);
    const p=this.programs.map;gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);const loc=gl.getAttribLocation(p,"a_pos");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.mapTexture);gl.uniform1i(gl.getUniformLocation(p,"u_map"),0);gl.uniform2f(gl.getUniformLocation(p,"u_res"),this.canvas.width,this.canvas.height);gl.uniform2f(gl.getUniformLocation(p,"u_cam"),this.camera.x+sx,this.camera.y+sy);gl.uniform1f(gl.getUniformLocation(p,"u_scale"),scale);gl.uniform1f(gl.getUniformLocation(p,"u_size"),s.size);gl.uniform1f(gl.getUniformLocation(p,"u_time"),now/1000);gl.uniform1f(gl.getUniformLocation(p,"u_flood"),s.chaos.flood?1:0);gl.uniform1f(gl.getUniformLocation(p,"u_collapse"),s.chaos.collapse||0);gl.uniform1f(gl.getUniformLocation(p,"u_divide"),s.chaos.divide?1:0);gl.drawArrays(gl.TRIANGLES,0,6);
    const points=this._collectPoints(now),data=new Float32Array(points.length*9);let q=0;for(const v of points){data[q++]=v.x;data[q++]=v.y;data[q++]=v.color[0];data[q++]=v.color[1];data[q++]=v.color[2];data[q++]=v.color[3];data[q++]=v.size;data[q++]=v.shape;data[q++]=v.health;}
    gl.useProgram(this.programs.point);gl.bindBuffer(gl.ARRAY_BUFFER,this.unitBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);const stride=9*4;for(const [name,size,off] of [["a_pos",2,0],["a_color",4,2],["a_size",1,6],["a_shape",1,7],["a_health",1,8]]){const a=gl.getAttribLocation(this.programs.point,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,stride,off*4);}gl.uniform2f(gl.getUniformLocation(this.programs.point,"u_res"),this.canvas.width,this.canvas.height);gl.uniform2f(gl.getUniformLocation(this.programs.point,"u_cam"),this.camera.x+sx,this.camera.y+sy);gl.uniform1f(gl.getUniformLocation(this.programs.point,"u_scale"),scale);gl.uniform1f(gl.getUniformLocation(this.programs.point,"u_time"),now/1000);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.uniform1f(gl.getUniformLocation(this.programs.point,"u_glow"),1);gl.drawArrays(gl.POINTS,0,points.length);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1f(gl.getUniformLocation(this.programs.point,"u_glow"),0);gl.drawArrays(gl.POINTS,0,points.length);gl.disable(gl.BLEND);
  }

  _collectPoints(now){
    const s=this.snapshot,alpha=clamp((now-this.lastSnapshotAt)/50,0,1),out=[];
    for(const u of s.units){if(!u[8])continue;const col=hex(TEAM_COLORS[u[4]]),size=[.88,.96,1.18,.9,.96,.96][u[5]];out.push({x:lerp(u[2],u[0],alpha),y:lerp(u[3],u[1],alpha),color:col,size:u[9]?size*1.55:size,shape:u[5],health:u[6]});if(u[7]>.05)out.push({x:u[0],y:u[1],color:[col[0],col[1],col[2],.45],size:size*1.55,shape:5,health:1});}
    for(const u of s.ghosts||[])if(u[8])out.push({x:u[0],y:u[1],color:[.66,.68,.73,.78],size:.92,shape:u[5],health:u[6]});
    for(const t of s.towers){const c=t.team>=0?hex(TEAM_COLORS[t.team]):NEUTRAL;out.push({x:t.x,y:t.y,color:c,size:2.15,shape:2,health:t.hp});out.push({x:t.x,y:t.y,color:[c[0],c[1],c[2],.42],size:3.1,shape:5,health:1});}
    for(const t of s.teams){const c=hex(TEAM_COLORS[t.id]);out.push({x:t.core.x,y:t.core.y,color:c,size:t.core.alive?3.2:1.5,shape:4,health:t.core.hp/t.core.maxHp});if(t.core.shield>0)out.push({x:t.core.x,y:t.core.y,color:[c[0],c[1],c[2],.5],size:4.25,shape:5,health:1});}
    for(const p of s.portals)out.push({x:p.x,y:p.y,color:p.wild?[.8,.3,1,.86]:[.48,.42,1,.8],size:p.wild?2.6:2.1,shape:5,health:1});
    if(s.crystal.active){const c=s.crystal.carrier>=0?hex(TEAM_COLORS[s.units[s.crystal.carrier]?.[4]]||"#e7efff"):[.78,.88,1,1];out.push({x:s.crystal.x,y:s.crystal.y,color:c,size:1.6,shape:3,health:1});out.push({x:s.crystal.x,y:s.crystal.y,color:[c[0],c[1],c[2],.4],size:2.8,shape:5,health:1});}
    if(s.boss.active){out.push({x:s.boss.x,y:s.boss.y,color:[.92,.22,.82,1],size:4.8,shape:s.boss.type===0?2:s.boss.type===1?0:s.boss.type===2?4:3,health:s.boss.hp/s.boss.maxHp});out.push({x:s.boss.x,y:s.boss.y,color:[.9,.2,.72,.4],size:6.2,shape:5,health:1});}
    if(s.fortress.active){const c=s.fortress.team>=0?hex(TEAM_COLORS[s.fortress.team]):NEUTRAL;out.push({x:s.fortress.x,y:s.fortress.y,color:c,size:4.2,shape:4,health:s.fortress.hp/s.fortress.maxHp});}
    if(s.chaos.storm){out.push({x:s.chaos.storm.x,y:s.chaos.storm.y,color:[.6,.28,1,.5],size:s.chaos.storm.radius*2,shape:5,health:1});}
    for(const m of s.chaos.meteors||[])if(!m.hit)out.push({x:m.x,y:m.y,color:[1,.1,.25,.75],size:7,shape:5,health:1});
    for(const p of this.particles){const a=clamp(p.life/p.max,0,1),c=[p.color[0],p.color[1],p.color[2],p.color[3]*a];out.push({x:p.x,y:p.y,color:c,size:p.size*(p.shape===5?1+(1-a)*1.8:1),shape:p.shape,health:1});}
    return out;
  }

  _render2D(now,sx,sy){
    const c=this.ctx,s=this.snapshot,n=s.size,w=this.canvas.width,h=this.canvas.height,scale=this._fitScale()*this.camera.zoom;c.setTransform(1,0,0,1,0,0);c.fillStyle="#02040a";c.fillRect(0,0,w,h);c.save();c.translate(w/2,h/2);c.scale(scale,scale);c.translate(-this.camera.x-sx,-this.camera.y-sy);
    if(this.mapTextureDirty)this._rebuildMapTexture();c.imageSmoothingEnabled=false;c.drawImage(this.mapCanvas,0,0,n,n);
    const pts=this._collectPoints(now);for(const p of pts){c.globalAlpha=p.color[3];c.fillStyle=`rgb(${p.color[0]*255},${p.color[1]*255},${p.color[2]*255})`;c.shadowBlur=p.shape===5?10/scale:4/scale;c.shadowColor=c.fillStyle;c.beginPath();c.arc(p.x,p.y,p.size*.48,0,Math.PI*2);c.fill();}c.restore();c.globalAlpha=1;c.shadowBlur=0;
  }

  getStats(){return{fps:this.fps,particles:this.particles.length,backend:this.gl?"WebGL2":"Canvas 2D",scale:this.renderScale};}
  destroy(){this.particles.length=0;if(this.gl){for(const p of Object.values(this.programs))this.gl.deleteProgram(p);this.gl.deleteBuffer(this.quad);this.gl.deleteBuffer(this.unitBuffer);this.gl.deleteTexture(this.mapTexture);}}
}
