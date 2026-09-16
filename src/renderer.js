import { TAN, random, hash, clamp, project } from './math.js';
import { WORD_FONT, LINE_HEIGHT } from './layout.js';
import { atmosphereFor } from './atmosphere.js';

const WORLD_PROJECTION = `
uniform vec3 uCamera; uniform vec2 uViewport;
vec4 projectWorld(vec3 world) {
  float d=uCamera.z-world.z;
  if(d<1.0) return vec4(4.0,4.0,4.0,1.0);
  return vec4((world.x-uCamera.x)/(${TAN.toFixed(10)}*(uViewport.x/uViewport.y)),
              (world.y-uCamera.y)/${TAN.toFixed(10)},0.0,d);
}`;
function program(gl, vertex, fragment) {
  const shaders = [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]].map(([type,source])=>{
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) { const e=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(e); }
    return shader;
  });
  const p=gl.createProgram();shaders.forEach(s=>gl.attachShader(p,s));gl.linkProgram(p);
  shaders.forEach(s=>gl.deleteShader(s));
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) { const e=gl.getProgramInfoLog(p);gl.deleteProgram(p);throw new Error(e); }
  return { p, uniforms:new Map() };
}
const WORD_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 aPosition;
layout(location=2) in vec2 aSize;
layout(location=3) in vec4 aUV;
layout(location=4) in vec3 aTint;
layout(location=5) in vec4 aMeta;
${WORLD_PROJECTION}
uniform int uMood; uniform int uMoodFrom; uniform float uMoodBlend; uniform float uReveal; uniform int uHover; uniform int uSelected;
uniform ivec4 uDetailIds; uniform int uDetailPass; uniform highp int uArrivalStarPass;
out vec2 vUV; out vec2 vLocal; out vec3 vTint; out float vAlpha; out float vHighlight;
void main(){
  vUV=aUV.xy+(aCorner+.5)*aUV.zw;vLocal=aCorner;
  int mask=int(aMeta.x+.5); int id=int(aMeta.y+.5);
  bool matches=(uMood==0 || (mask & uMood)!=0) && aMeta.w>.5;
  vHighlight=(id==uHover || id==uSelected) ? 1.0 : 0.0;
  vTint=mix(aTint,vec3(1.0,.93,.77),vHighlight*.55);
  bool before=(uMoodFrom==0 || (mask & uMoodFrom)!=0) && aMeta.w>.5;
  float rank=clamp((aPosition.x+1400.)/2800.,0.,1.);
  float wave=smoothstep(0.,1.,(uMoodBlend-rank*.38)/.62);
  float arrival=.08+.92*smoothstep(0.,.8,uReveal);
  vAlpha=mix(mix(.14,1.,float(before)),mix(.14,1.,float(matches)),wave)*aMeta.z*arrival;
  float phase=fract(float(id)*.61803398875);
  float gather=clamp((uReveal-phase*.1)/.72,0.,1.);
  float settle=gather*gather*(3.-2.*gather);
  float angle=float(id)*2.39996323+(1.-settle)*.65;
  float radius=450.+phase*1400.;
  vec3 scattered=vec3(cos(angle)*radius,sin(angle)*radius*.48,-350.-phase*400.);
  vec3 position=mix(scattered,aPosition,settle);
  float words=smoothstep(.76+phase*.08,1.,uReveal);
  if(uArrivalStarPass==1){
    vAlpha=(1.-words)*(.5+.5*smoothstep(0.,.12,uReveal));
    gl_Position=projectWorld(position+vec3(aCorner*vec2(12.+phase*14.),0.));
  }else{
    vAlpha*=words;
    gl_Position=projectWorld(aPosition+vec3(aCorner*aSize,0.));
  }
  if(uArrivalStarPass==0 && uDetailPass==0 && any(equal(ivec4(id),uDetailIds)))gl_Position=vec4(4.,4.,4.,1.);
}`;
const WORD_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uMap; uniform vec2 uTexel; uniform highp int uArrivalStarPass;
in vec2 vUV; in vec2 vLocal; in vec3 vTint; in float vAlpha; in float vHighlight;
out vec4 outColor;
void main(){
  if(uArrivalStarPass==1){
    float r=length(vLocal);
    float core=exp(-r*r*170.)+exp(-r*r*23.)*.55;
    float rays=(exp(-abs(vLocal.x)*90.)*exp(-abs(vLocal.y)*7.)+exp(-abs(vLocal.y)*90.)*exp(-abs(vLocal.x)*7.))*.28;
    float a=(core+rays)*vAlpha*(1.-smoothstep(.35,.5,r));
    outColor=vec4(vTint,a);return;
  }
  vec4 ink=texture(uMap,vUV);
  float halo=texture(uMap,vUV+vec2(uTexel.x,0.)).a+texture(uMap,vUV-vec2(uTexel.x,0.)).a+
             texture(uMap,vUV+vec2(0.,uTexel.y)).a+texture(uMap,vUV-vec2(0.,uTexel.y)).a;
  float a=(ink.a+halo*(.024+vHighlight*.06))*vAlpha*1.7;
  if(a<.003)discard;
  float chroma=max(ink.r,max(ink.g,ink.b))-min(ink.r,min(ink.g,ink.b));
  vec3 color=mix(vTint,ink.rgb,smoothstep(.12,.25,chroma));
  outColor=vec4(color,min(a,1.));
}`;
const STAR_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition; layout(location=1) in vec3 aColor;
layout(location=2) in vec4 aMeta;
${WORLD_PROJECTION}
uniform float uTime; uniform float uDPR;
out vec3 vColor; out float vAlpha; out float vFlare;
void main(){
  gl_Position=projectWorld(aPosition);
  float d=max(1.,uCamera.z-aPosition.z);
  gl_PointSize=clamp(aMeta.x*uViewport.y/(2.*${TAN.toFixed(10)}*d),.65*uDPR,25.*uDPR);
  vColor=aColor;vAlpha=aMeta.z*(.90+.10*sin(uTime*.45+aMeta.y));vFlare=aMeta.w;
}`;
const STAR_FRAGMENT=`#version 300 es
precision highp float;
in vec3 vColor; in float vAlpha; in float vFlare; out vec4 outColor;
void main(){
  vec2 p=gl_PointCoord-.5; float r=length(p);
  float glow=exp(-r*r*22.0)*.7+exp(-r*r*170.)*.6;
  float rays=(exp(-abs(p.x)*95.)*exp(-abs(p.y)*6.)+exp(-abs(p.y)*95.)*exp(-abs(p.x)*6.))*.22*vFlare;
  float a=(glow+rays)*vAlpha*(1.-smoothstep(.40,.5,r));
  outColor=vec4(vColor,a);
}`;
const CLOUD_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner; layout(location=1) in vec3 aPosition;
layout(location=2) in vec2 aSize; layout(location=3) in vec4 aColor;
${WORLD_PROJECTION}
out vec2 vP; out vec3 vSeed; out vec4 vColor;
void main(){vP=aCorner*2.;vColor=aColor;vSeed=aPosition*.017;gl_Position=projectWorld(aPosition+vec3(aCorner*aSize,0.));}`;
const CLOUD_FRAGMENT=`#version 300 es
precision highp float;
in vec2 vP; in vec3 vSeed; in vec4 vColor; out vec4 outColor; uniform float uExposure;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.1)*.28+noise(p*4.3)*.17;}
void main(){
  float envelope=exp(-dot(vP,vP)*3.5)*(1.-smoothstep(.65,1.0,length(vP)));
  vec2 p=vP*3.8+vSeed.xy;
  float density=fbm(p+vec2(fbm(p+vSeed.z),fbm(p+7.1))*1.8);
  outColor=vec4(vColor.rgb,envelope*smoothstep(.22,.78,density)*vColor.a*uExposure);
}`;
const LINE_VERTEX=`#version 300 es
precision highp float; layout(location=0) in vec3 aPosition;
${WORLD_PROJECTION}
void main(){gl_Position=projectWorld(aPosition);}`;
const LINE_FRAGMENT=`#version 300 es
precision highp float;out vec4 outColor;void main(){outColor=vec4(.73,.79,.91,.19);}`;

/** GPU renderer. All instance positions are uploaded once per dataset, never on zoom. */
export class ConstellationRenderer {
  constructor(canvas, onFailure) {
    this.canvas=canvas;this.onFailure=onFailure;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:false,powerPreference:'low-power',preserveDrawingBuffer:false});
    if(!gl)throw new Error('WebGL 2 is unavailable. Every comment is still available in the reading list.');
    this.gl=gl;this.pages=[];this.nodes=[];this.mood=0;this.hover=-1;this.selected=-1;this.atmosphere=true;this.exposure=.78;
    this.drawCalls=0;this.time=0;this.lost=false;this.reveal=1;this.moodFrom=0;this.moodBlend=1;
    this.initialize();
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;onFailure('The graphics context paused. Restoring your sky; Browse remains available.');});
    canvas.addEventListener('webglcontextrestored',async()=>{
      try {const saved=this.lastLayout,author=this.author;this.pages=[];this.details=new Map();this.stars=this.clouds=this.lines=null;this.initialize();this.lost=false;if(saved)await this.setLayout(saved);this.setAuthor(author);onFailure('');}
      catch(error){this.lost=true;onFailure('Graphics recovery failed. Every comment remains available in Browse.');}
    });
  }
  initialize(){
    const gl=this.gl;this.details=new Map();this.author=null;
    this.wordProgram=program(gl,WORD_VERTEX,WORD_FRAGMENT);
    this.starProgram=program(gl,STAR_VERTEX,STAR_FRAGMENT);
    this.cloudProgram=program(gl,CLOUD_VERTEX,CLOUD_FRAGMENT);
    this.lineProgram=program(gl,LINE_VERTEX,LINE_FRAGMENT);
    this.quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-.5,-.5,.5,-.5,-.5,.5,.5,.5]),gl.STATIC_DRAW);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);
    gl.clearColor(.012,.027,.055,1);
    this.resize();
  }
  loc(p,name){if(!p.uniforms.has(name))p.uniforms.set(name,this.gl.getUniformLocation(p.p,name));return p.uniforms.get(name);}
  use(p,camera){const g=this.gl;g.useProgram(p.p);g.uniform3f(this.loc(p,'uCamera'),camera.x,camera.y,camera.z);g.uniform2f(this.loc(p,'uViewport'),this.canvas.width,this.canvas.height);}
  resize(){
    this.dpr=Math.min(devicePixelRatio||1,innerWidth<700?1.65:1.75);
    this.canvas.width=Math.round(innerWidth*this.dpr);this.canvas.height=Math.round(innerHeight*this.dpr);
    this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }
  attribute(location,size,stride,offset,divisor=0){const g=this.gl;g.enableVertexAttribArray(location);g.vertexAttribPointer(location,size,g.FLOAT,false,stride*4,offset*4);g.vertexAttribDivisor(location,divisor);}
  createQuadBatch(array,stride,attributes){
    const g=this.gl,vao=g.createVertexArray();g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER,this.quad);this.attribute(0,2,2,0);
    const buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,array,g.STATIC_DRAW);
    attributes.forEach(([loc,size,offset])=>this.attribute(loc,size,stride,offset,1));g.bindVertexArray(null);
    return {vao,buffer,array,count:array.length/stride};
  }
  clearWorld(){
    const g=this.gl;
    for(const d of this.details?.values()||[]){g.deleteTexture(d.texture);g.deleteBuffer(d.buffer);g.deleteVertexArray(d.vao);}
    this.details?.clear();
    for(const page of this.pages){g.deleteTexture(page.texture);g.deleteBuffer(page.buffer);g.deleteVertexArray(page.vao);}
    this.pages=[];
    for(const batch of [this.stars,this.clouds,this.lines])if(batch){g.deleteBuffer(batch.buffer);g.deleteVertexArray(batch.vao);}
    this.stars=this.clouds=this.lines=null;this.nodes=[];this.textureBytes=0;this.lastLayout=null;
  }
  async setLayout(layout,onProgress=()=>{}) {
    // A new import during context loss must become the collection restored later.
    if(this.lost){this.lastLayout=layout;return;}
    this.clearWorld();this.nodes=layout.nodes;this.lastLayout=layout;
    if(!this.nodes.length)return;
    const g=this.gl,side=Math.min(2048,g.getParameter(g.MAX_TEXTURE_SIZE));
    // Bound atlas memory rather than allocating one unbounded texture.
    const texelEstimate=this.nodes.reduce((s,n)=>s+n.w*n.h*(48/n.font)**2,0);
    const rasterFont=48*Math.min(1,Math.sqrt(14_000_000/texelEstimate));
    const pages=[];let page={tiles:[],bottom:0};pages.push(page);let x=8,y=8,shelf=0;
    for(const n of [...this.nodes].sort((a,b)=>a.z-b.z)){
      const factor=Math.min(Math.max(4,rasterFont)/n.font,(side-32)/n.w,(side-32)/n.h);
      const w=Math.ceil(n.w*factor),h=Math.ceil(n.h*factor);
      if(x+w+8>side){x=8;y+=shelf+16;shelf=0;}
      if(y+h+8>side){page={tiles:[],bottom:0};pages.push(page);x=8;y=8;shelf=0;}
      page.tiles.push({n,x,y,w,h,factor});page.bottom=Math.max(page.bottom,y+h+8);x+=w+16;shelf=Math.max(shelf,h);
    }
    this.textureBytes=0;
    for(let p=0;p<pages.length;p++){
      const page=pages[p];const canvas=document.createElement('canvas');canvas.width=side;canvas.height=Math.min(side,2**Math.ceil(Math.log2(page.bottom)));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='top';
      const values=[];
      page.tiles.forEach(({n,x,y,w,h,factor})=>{
        const font=n.font*factor;ctx.font=`${font}px ${WORD_FONT}`;
        n.lines.forEach((line,i)=>ctx.fillText(line,x+w/2,y+font*(.3+i*LINE_HEIGHT)));
        values.push(n.x,n.y,n.z,n.w,n.h,x/canvas.width,1-(y+h)/canvas.height,w/canvas.width,h/canvas.height,...n.color,n.mask,n.index,n.luminosity,1);
      });
      const texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,texture);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,canvas);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);g.generateMipmap(g.TEXTURE_2D);
      const batch=this.createQuadBatch(new Float32Array(values),16,[[1,3,0],[2,2,3],[3,4,5],[4,3,9],[5,4,12]]);
      this.pages.push({...batch,texture,width:canvas.width,height:canvas.height,nodes:page.tiles.map(t=>t.n)});
      this.textureBytes+=canvas.width*canvas.height*4*4/3;
      onProgress((p+1)/pages.length);await new Promise(r=>setTimeout(r,0));
    }
    this.createAtmosphere();
    this.hover=this.selected=-1;
  }
  createAtmosphere(){
    const g=this.gl,world=atmosphereFor(this.nodes);
    const colors=[[.94,.84,.65],[.59,.77,1.],[.94,.78,.65]];
    const stars=world.stars.flatMap(p=>[p.x,p.y,p.z,...colors[p.color],p.size,p.phase,p.alpha,p.bright?1:0]);
    const vao=g.createVertexArray();g.bindVertexArray(vao);const buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(stars),g.STATIC_DRAW);
    this.attribute(0,3,10,0);this.attribute(1,3,10,3);this.attribute(2,4,10,6);g.bindVertexArray(null);
    this.stars={vao,buffer,count:stars.length/10};
    this.clouds=this.createQuadBatch(new Float32Array(world.clouds.flatMap(c=>[c.x,c.y,c.z,c.w,c.h,...c.color])),9,[[1,3,0],[2,2,3],[3,4,5]]);
  }
  detailFor(n){
    if(this.details.has(n.index))return this.details.get(n.index);
    const g=this.gl,factor=Math.min(88/n.font,1536/n.w,1536/n.h,Math.sqrt(550000/(n.w*n.h)));
    const c=document.createElement('canvas');c.width=Math.ceil(n.w*factor);c.height=Math.ceil(n.h*factor);
    const ctx=c.getContext('2d'),font=n.font*factor;ctx.font=`${font}px ${WORD_FONT}`;ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#fff';
    n.lines.forEach((line,i)=>ctx.fillText(line,c.width/2,font*(.3+i*LINE_HEIGHT)));
    const texture=g.createTexture();g.bindTexture(g.TEXTURE_2D,texture);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);
    g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,c);
    g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
    g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
    const array=new Float32Array([n.x,n.y,n.z,n.w,n.h,0,0,1,1,...n.color,n.mask,n.index,n.luminosity,!this.author||this.author===n.comment.author?1:0]);
    const batch=this.createQuadBatch(array,16,[[1,3,0],[2,2,3],[3,4,5],[4,3,9],[5,4,12]]);
    const page={...batch,texture,width:c.width,height:c.height,nodes:[n],bytes:c.width*c.height*4};
    if(this.details.size>=12){const key=this.details.keys().next().value,old=this.details.get(key);g.deleteTexture(old.texture);g.deleteBuffer(old.buffer);g.deleteVertexArray(old.vao);this.details.delete(key);}
    this.details.set(n.index,page);return page;
  }

  setAuthor(author){
    this.author=author;const g=this.gl;
    for(const page of [...this.pages,...this.details.values()]){
      page.nodes.forEach((n,i)=>page.array[i*16+15]=!author||n.comment.author===author?1:0);
      g.bindBuffer(g.ARRAY_BUFFER,page.buffer);g.bufferSubData(g.ARRAY_BUFFER,0,page.array);
    }
  }
  setHover(index){
    if(this.hover===index)return;this.hover=index;
    const g=this.gl;
    if(this.lines){g.deleteBuffer(this.lines.buffer);g.deleteVertexArray(this.lines.vao);this.lines=null;}
    if(index<0)return;
    const source=this.nodes[index];if(!source?.comment.author)return;
    const relatives=this.nodes.filter(n=>n.index!==index&&n.comment.author===source.comment.author)
      .sort((a,b)=>Math.hypot(a.x-source.x,a.y-source.y)-Math.hypot(b.x-source.x,b.y-source.y)).slice(0,3);
    if(!relatives.length)return;
    const values=relatives.flatMap(n=>[source.x,source.y-source.h/2-3,source.z,n.x,n.y-n.h/2-3,n.z]);
    const vao=g.createVertexArray();g.bindVertexArray(vao);const buffer=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(values),g.STATIC_DRAW);this.attribute(0,3,3,0);g.bindVertexArray(null);
    this.lines={vao,buffer,count:values.length/3};
  }
  render(camera,time){
    if(this.lost)return;
    const g=this.gl;g.clear(g.COLOR_BUFFER_BIT);this.drawCalls=0;
    const w=this.canvas.width/this.dpr,h=this.canvas.height/this.dpr;
    const visible=this.nodes.map(n=>({n,p:project(n,camera,w,h)})).filter(({n,p})=>p&&n.font*p.scale>24&&p.x+n.w*p.scale/2>0&&p.x-n.w*p.scale/2<w&&p.y+n.h*p.scale/2>0&&p.y-n.h*p.scale/2<h);
    visible.sort((a,b)=>(a.n.index===this.selected?-1:0)-(b.n.index===this.selected?-1:0)||Math.hypot(a.p.x-w/2,a.p.y-h/2)-Math.hypot(b.p.x-w/2,b.p.y-h/2));
    const detailNodes=visible.slice(0,4).map(v=>v.n),detailPages=detailNodes.map(n=>this.detailFor(n));
    const detailIDs=Array.from({length:4},(_,i)=>detailNodes[i]?.index??-1);

    if(this.atmosphere&&this.clouds){
      this.use(this.cloudProgram,camera);g.uniform1f(this.loc(this.cloudProgram,'uExposure'),this.exposure);g.bindVertexArray(this.clouds.vao);g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,this.clouds.count);this.drawCalls++;
    }
    if(this.atmosphere&&this.stars){
      this.use(this.starProgram,camera);g.uniform1f(this.loc(this.starProgram,'uTime'),time);g.uniform1f(this.loc(this.starProgram,'uDPR'),this.dpr);
      g.blendFunc(g.SRC_ALPHA,g.ONE);g.bindVertexArray(this.stars.vao);g.drawArrays(g.POINTS,0,this.stars.count);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);this.drawCalls++;
    }
    if(this.lines){this.use(this.lineProgram,camera);g.bindVertexArray(this.lines.vao);g.drawArrays(g.LINES,0,this.lines.count);this.drawCalls++;}
    this.use(this.wordProgram,camera);g.uniform1f(this.loc(this.wordProgram,'uReveal'),this.reveal);g.uniform1i(this.loc(this.wordProgram,'uMoodFrom'),this.moodFrom);g.uniform1f(this.loc(this.wordProgram,'uMoodBlend'),this.moodBlend);g.uniform1i(this.loc(this.wordProgram,'uMood'),this.mood);g.uniform1i(this.loc(this.wordProgram,'uHover'),this.hover);g.uniform1i(this.loc(this.wordProgram,'uSelected'),this.selected);
    g.uniform1i(this.loc(this.wordProgram,'uArrivalStarPass'),0);
    g.uniform4iv(this.loc(this.wordProgram,'uDetailIds'),detailIDs);g.uniform1i(this.loc(this.wordProgram,'uDetailPass'),0);
    g.uniform1i(this.loc(this.wordProgram,'uMap'),0);g.activeTexture(g.TEXTURE0);
    for(const page of this.pages){
      g.bindTexture(g.TEXTURE_2D,page.texture);g.uniform2f(this.loc(this.wordProgram,'uTexel'),1/page.width,1/page.height);g.bindVertexArray(page.vao);g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,page.count);this.drawCalls++;
    }
    g.uniform1i(this.loc(this.wordProgram,'uDetailPass'),1);
    for(const page of detailPages){g.bindTexture(g.TEXTURE_2D,page.texture);g.uniform2f(this.loc(this.wordProgram,'uTexel'),1/page.width,1/page.height);g.bindVertexArray(page.vao);g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,page.count);this.drawCalls++;}
    if(this.reveal<1){
      g.uniform1i(this.loc(this.wordProgram,'uArrivalStarPass'),1);
      for(const page of this.pages){g.bindVertexArray(page.vao);g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,page.count);this.drawCalls++;}
      g.uniform1i(this.loc(this.wordProgram,'uArrivalStarPass'),0);
    }
    g.bindVertexArray(null);
  }
  dispose(){this.clearWorld();this.gl.deleteBuffer(this.quad);for(const p of [this.wordProgram,this.starProgram,this.cloudProgram,this.lineProgram])this.gl.deleteProgram(p.p);}
}

/** Public only for reproducible shader validation; not a second renderer. */
export const shaderSources=Object.freeze({words:{vertex:WORD_VERTEX,fragment:WORD_FRAGMENT},stars:{vertex:STAR_VERTEX,fragment:STAR_FRAGMENT},clouds:{vertex:CLOUD_VERTEX,fragment:CLOUD_FRAGMENT},lines:{vertex:LINE_VERTEX,fragment:LINE_FRAGMENT}});
