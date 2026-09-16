import * as THREE from 'three';
import './style.css';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const host=$('#universe'), app=$('#app');
const moodNames={all:'Everything',laugh:'Make me laugh',love:'Feeling loved',poetry:'A little poetry'};
const descriptions={all:'A name made of little moments.',laugh:'For the things only your people would say.',love:'Some words feel like a warm hug.',poetry:'A few words. A whole feeling.'};
const palette={all:'#eadac2',laugh:'#edc386',love:'#e8abbc',poetry:'#a8ccf3'};
let data={comments:[],version:''}, mood='all', authorFilter=null, active=null, hoverId=null;
let paused=matchMedia('(prefers-reduced-motion: reduce)').matches, sceneTime=0;
let fragments=[], mesh=null, nearMesh=null, nearWords=[], stars=null, initialized=false, sceneUnavailable=false;
let width=innerWidth,height=innerHeight, homeZ=160, targetZ=160;
let targetX=0,targetY=0, rotationTarget=new THREE.Vector2(), pointer=new THREE.Vector2();
let lastFrame=0, tick=0, lastRendered=0, lastMoodTime=-20, loadIn=0;
let pointerStart=null, pinchStart=null, pointerMap=new Map(), dragDistance=0;
let toastTimer, previousFocus=null, readingOrigin=null, history=[], historyIndex=-1;
const seen=new Set();
const raycaster=new THREE.Raycaster();
const colorScratch=new THREE.Color();
const world=new THREE.Group();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(34,1,.1,1500);
let renderer;

function announce(text){$('#accessible-status').textContent=text;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3300);}
function hash(str){let h=2166136261;for(const c of str){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng=random(1019);
const mobile=()=>width<=700;
const minimumZ=()=>Math.max(26,height*.055);
const matches=c=>(mood==='all'||c.moods.includes(mood))&&(!authorFilter||c.author===authorFilter);
const eligible=()=>data.comments.filter(matches);
const selectedColor=c=>palette[mood==='all'?(c.moods.includes('love')?'love':c.moods.includes('laugh')?'laugh':c.moods.includes('poetry')?'poetry':'all'):mood];

try {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  scene.add(world);
} catch {
  sceneUnavailable=true;
  $('#scene-status').textContent='Your browser couldn’t open the constellation. You can still read every word.';
  $('#browse').classList.add('fallback-focus');
}

// Pack true text into horizontal runs inside a typographic mask. No solid name is rendered.
function makeLayout(comments){
  const mask=document.createElement('canvas');mask.width=1800;mask.height=380;
  const ctx=mask.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='white';ctx.textBaseline='middle';ctx.textAlign='center';
  ctx.font='700 360px "Bricolage Grotesque"';
  const measured=ctx.measureText('KHUSHI').width;
  ctx.save();ctx.translate(900,190);ctx.scale(1650/measured,1);ctx.fillText('KHUSHI',0,0);ctx.restore();
  const pixels=ctx.getImageData(0,0,1800,380).data;
  const inside=(x,y)=>pixels[(Math.floor(y)*1800+Math.floor(x))*4+3]>150;
  const textCanvas=document.createElement('canvas');const tc=textCanvas.getContext('2d');tc.font='500 11px "DM Sans"';
  const segments=[];
  for(const c of comments){
    const words=c.text.replace(/\s+/g,' ').split(' ');let phrase='';
    for(const word of words){
      if((phrase+' '+word).length>22 && phrase){segments.push({text:phrase,comment:c});phrase=word;}
      else phrase+=(phrase?' ':'')+word;
    }
    if(phrase)segments.push({text:phrase,comment:c});
  }
  // Shuffle reproducibly so comments from one post are not confined to a single letter.
  const stable=random(443);for(let i=segments.length-1;i>0;i--){const j=Math.floor(stable()*(i+1));[segments[i],segments[j]]=[segments[j],segments[i]];}
  const output=[];let cursor=0;
  if(!segments.length)return output;
  for(let y=38;y<340;y+=11.4){
    let x=50;
    while(x<1750){
      if(!inside(x,y)){x+=2;continue;}
      const start=x;while(x<1750 && inside(x,y))x+=2;
      const end=x;let left=start+1;
      while(left<end-12){
        let segment=segments[cursor%segments.length];cursor++;
        const available=end-left;
        let phrase=segment.text;
        let textWidth=tc.measureText(phrase).width;
        if(textWidth>available){
          while(textWidth>available && phrase.length>3){phrase=phrase.slice(0,-1);textWidth=tc.measureText(phrase).width;}
        }
        if(phrase.length<3||textWidth<9)break;
        const seed=hash(segment.comment.id+output.length);
        output.push({text:phrase,comment:segment.comment,x:(left+textWidth/2-900)/10,y:(190-y)/10,z:(seed%1000/1000-.5)*3.4,w:textWidth/10,h:1.25,seed:seed%500/50,brightness:.67+(seed%30)/100});
        left+=textWidth+5;
      }
    }
  }
  // Guarantee every received comment is represented even when the silhouette is full.
  const present=new Set(output.map(f=>f.comment.id));
  for(const c of comments){
    if(present.has(c.id))continue;
    const base=output[hash(c.id)%output.length];if(!base)continue;
    output.push({...base,text:c.text.replace(/\s+/g,' ').slice(0,22),comment:c,z:base.z-3,brightness:.58});
  }
  return output;
}

function buildCloud(){
  if(!renderer||!data.comments.length)return;
  const next=makeLayout(data.comments);
  const atlas=document.createElement('canvas');
  const cols=16,tileW=256,tileH=40,rows=Math.ceil(next.length/cols);
  atlas.width=4096;atlas.height=THREE.MathUtils.ceilPowerOfTwo(rows*tileH);
  const ctx=atlas.getContext('2d');ctx.font='500 26px "DM Sans"';ctx.fillStyle='#fff';ctx.textBaseline='middle';
  const uvRects=new Float32Array(next.length*4),colors=new Float32Array(next.length*3),opacities=new Float32Array(next.length);
  next.forEach((f,i)=>{
    const col=i%cols,row=Math.floor(i/cols);let tx=f.text;
    ctx.fillText(tx,col*tileW+4,row*tileH+tileH/2,tileW-8);
    const used=Math.min(ctx.measureText(tx).width+8,tileW);
    uvRects.set([col*tileW/atlas.width,1-(row+1)*tileH/atlas.height,used/atlas.width,tileH/atlas.height],i*4);
    colors.set(new THREE.Color(selectedColor(f.comment)).toArray(),i*3);opacities[i]=f.brightness;
  });
  const texture=new THREE.CanvasTexture(atlas);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.setAttribute('atlasRect',new THREE.InstancedBufferAttribute(uvRects,4));
  geometry.setAttribute('wordColor',new THREE.InstancedBufferAttribute(colors,3));
  geometry.setAttribute('wordAlpha',new THREE.InstancedBufferAttribute(opacities,1));
  const material=new THREE.ShaderMaterial({
    uniforms:{map:{value:texture},edgeFade:{value:0},viewport:{value:new THREE.Vector2(width,height)}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`attribute vec4 atlasRect;attribute vec3 wordColor;attribute float wordAlpha;varying vec2 vUv;varying vec3 vColor;varying float vAlpha;void main(){vUv=atlasRect.xy+uv*atlasRect.zw;vColor=wordColor;vAlpha=wordAlpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D map;uniform float edgeFade;uniform vec2 viewport;varying vec2 vUv;varying vec3 vColor;varying float vAlpha;void main(){vec4 texel=texture2D(map,vUv);vec2 p=gl_FragCoord.xy/viewport;float edge=smoothstep(0.,.065,min(p.x,1.-p.x))*smoothstep(0.,.11,min(p.y,1.-p.y));float a=texel.a*vAlpha*mix(1.,edge,edgeFade);if(a<.025)discard;float ink=step(.92,min(texel.r,min(texel.g,texel.b)));gl_FragColor=vec4(mix(texel.rgb,vColor,ink),a);#include <colorspace_fragment>}`.replace(';#include',';\n#include')
  });
  if(mesh){world.remove(mesh);mesh.geometry.dispose();mesh.material.uniforms.map.value.dispose();mesh.material.dispose();}
  mesh=new THREE.InstancedMesh(geometry,material,next.length);mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);world.add(mesh);fragments=next;
  const dummy=new THREE.Object3D();fragments.forEach((f,i)=>{dummy.position.set(f.x,f.y,f.z);dummy.scale.set(f.w,f.h,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
  buildReadableCloud();
  if(!stars)buildStars();
  $('#scene-status').hidden=true;initialized=true;
}

function buildReadableCloud(){
  // Measure at reading resolution. Each plane uses the same aspect ratio as its
  // painted text; only the camera changes its apparent size.
  const measure=document.createElement('canvas').getContext('2d');
  measure.font='500 48px "DM Sans"';
  const placed=[],pages=[{items:[],height:0}];let atlasX=0,atlasY=0,shelfHeight=0;
  const shuffled=[...data.comments].sort((a,b)=>hash(a.id)-hash(b.id));
  const graphemes=new Intl.Segmenter(undefined,{granularity:'grapheme'});
  for(const c of shuffled){
    const lines=[];
    for(const paragraph of c.text.split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        // Long handles and URLs wrap without squeezing their letterforms.
        const pieces=[];let piece='';
        for(const {segment} of graphemes.segment(word)){
          if(piece&&measure.measureText(piece+segment).width>736){pieces.push(piece);piece='';}
          piece+=segment;
        }
        if(piece)pieces.push(piece);
        for(const part of pieces){
          const next=line?line+' '+part:part;
          if(measure.measureText(next).width>736&&line){lines.push(line);line=part;}else line=next;
        }
      }
      lines.push(line);
    }
    const textW=Math.ceil(Math.max(...lines.map(l=>measure.measureText(l).width))+28);
    const textH=lines.length*61+20;
    if(atlasX+textW+8>4096){atlasX=0;atlasY+=shelfHeight+8;shelfHeight=0;}
    if(atlasY+textH+8>4096){pages.push({items:[],height:0});atlasX=0;atlasY=0;shelfHeight=0;}
    const variants=fragments.filter(f=>f.comment.id===c.id);
    const anchor=variants[Math.floor(variants.length/2)]||{x:0,y:0};
    const fontScale=c.text.length<40?1.18:c.text.length>100?.9:1;
    const w=textW/32*fontScale,h=textH/32*fontScale;
    let x=anchor.x*1.9,y=anchor.y*2.8,step=0;
    do{
      const radius=Math.sqrt(step)*2.4,angle=step*.56;
      x=anchor.x*1.9+Math.cos(angle)*radius;y=anchor.y*2.8+Math.sin(angle)*radius;step++;
    }while(placed.some(p=>Math.abs(x-p.x)<(w+p.w)/2+2.4&&Math.abs(y-p.y)<(h+p.h)/2+2.4));
    const item={comment:c,text:c.text,lines,textW,textH,atlasX,atlasY,x,y,z:0,w,h};
    placed.push(item);pages.at(-1).items.push(item);pages.at(-1).height=Math.max(pages.at(-1).height,atlasY+textH+8);
    atlasX+=textW+8;shelfHeight=Math.max(shelfHeight,textH);
  }
  if(nearMesh){
    scene.remove(nearMesh);
    for(const part of nearMesh.children){part.geometry.dispose();part.material.uniforms.map.value.dispose();part.material.dispose();}
  }
  nearMesh=new THREE.Group();nearWords=placed;scene.add(nearMesh);
  for(const page of pages){
    const canvas=document.createElement('canvas');canvas.width=4096;canvas.height=THREE.MathUtils.ceilPowerOfTwo(page.height);
    const ctx=canvas.getContext('2d');ctx.font='500 48px "DM Sans"';ctx.textBaseline='top';ctx.textAlign='center';ctx.fillStyle='white';
    const uvRects=new Float32Array(page.items.length*4),colors=new Float32Array(page.items.length*3),alphas=new Float32Array(page.items.length);
    page.items.forEach((p,i)=>{
      p.lines.forEach((line,n)=>ctx.fillText(line,p.atlasX+p.textW/2,p.atlasY+8+n*61));
      uvRects.set([p.atlasX/canvas.width,1-(p.atlasY+p.textH)/canvas.height,p.textW/canvas.width,p.textH/canvas.height],i*4);
      colors.set(new THREE.Color(selectedColor(p.comment)).toArray(),i*3);
    });
    const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    const geometry=new THREE.PlaneGeometry(1,1);
    geometry.setAttribute('atlasRect',new THREE.InstancedBufferAttribute(uvRects,4));geometry.setAttribute('wordColor',new THREE.InstancedBufferAttribute(colors,3));geometry.setAttribute('wordAlpha',new THREE.InstancedBufferAttribute(alphas,1));
    const material=mesh.material.clone();material.uniforms.map.value=texture;material.uniforms.edgeFade.value=1;
    renderer.getDrawingBufferSize(material.uniforms.viewport.value);
    const part=new THREE.InstancedMesh(geometry,material,page.items.length);part.frustumCulled=false;part.userData.words=page.items;
    const d=new THREE.Object3D();page.items.forEach((p,i)=>{d.position.set(p.x,p.y,p.z);d.scale.set(p.w,p.h,1);d.updateMatrix();part.setMatrixAt(i,d.matrix);});
    part.instanceMatrix.needsUpdate=true;part.computeBoundingSphere();nearMesh.add(part);
  }
}

function buildStars(){
  const points=[],alphas=[];
  for(let i=0;i<140;i++){points.push((rng()-.5)*260,(rng()-.5)*130,-14-rng()*45);alphas.push(.25+rng()*.65);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('alpha',new THREE.Float32BufferAttribute(alphas,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:'attribute float alpha;varying float vAlpha;void main(){vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=1.6;}',fragmentShader:'varying float vAlpha;void main(){float a=1.-smoothstep(.05,.5,distance(gl_PointCoord,vec2(.5)));gl_FragColor=vec4(.7,.77,.9,a*vAlpha*.5);}'});
  stars=new THREE.Points(g,m);scene.add(stars);
  // One quiet orbital line supplies depth around the words.
  const curve=new THREE.EllipseCurve(0,0,106,35,0,Math.PI*2,false,0);
  const lineGeo=new THREE.BufferGeometry().setFromPoints(curve.getPoints(160));
  const orbit=new THREE.LineLoop(lineGeo,new THREE.LineBasicMaterial({color:0x60728d,transparent:true,opacity:.12}));
  orbit.rotation.x=1.15;orbit.rotation.z=-.12;orbit.position.z=-10;scene.add(orbit);
}

function resize(){
  width=app.clientWidth;height=app.clientHeight;
  if(!renderer)return;
  const oldHome=homeZ;camera.aspect=width/height;world.scale.y=mobile()?1.6:1.08;
  homeZ=Math.max(87,(mobile()?98:105)/(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect));
  targetZ=targetZ===oldHome?homeZ:THREE.MathUtils.clamp(targetZ,minimumZ(),homeZ);
  if(!initialized)camera.position.set(0,0,homeZ);
  camera.updateProjectionMatrix();renderer.setSize(width,height);
  if(nearMesh)for(const part of nearMesh.children)renderer.getDrawingBufferSize(part.material.uniforms.viewport.value);
}
new ResizeObserver(resize).observe(app);

function goHome(){
  closeReader(false);targetX=0;targetY=0;targetZ=homeZ;rotationTarget.set(0,0);authorFilter=null;
  $('#home').hidden=true;app.classList.remove('exploring');updateMoodUI();
}
function zoomBy(factor){
  targetZ=THREE.MathUtils.clamp(targetZ*factor,minimumZ(),homeZ*1.06);
  $('#home').hidden=targetZ>=homeZ*.94;app.classList.toggle('exploring',targetZ<homeZ*.85);
  if(targetZ>=homeZ*.98){targetX=0;targetY=0;}
}
function changeMood(next){
  mood=next;authorFilter=null;lastMoodTime=sceneTime;closeReader(false);targetZ=homeZ;targetX=0;targetY=0;
  $('#home').hidden=true;app.classList.remove('exploring');updateMoodUI();
  if(!$('#library').hidden)renderLibrary();
  announce(`${eligible().length} comments. ${moodNames[mood]}.`);
}
function updateMoodUI(){
  $$('.moods button').forEach(b=>{const current=b.dataset.mood===mood;b.classList.toggle('active',current);b.setAttribute('aria-pressed',String(current));});
  $('#mood-description').textContent=authorFilter?`Following @${authorFilter}`:descriptions[mood];
  $('#surprise').disabled=eligible().length===0;
  document.documentElement.style.setProperty('--accent',palette[mood]);
}

function setText(el,text){el.textContent=text||'';}
function chooseSurprise(){
  const options=eligible();if(!options.length){toast('There are no comments in this mood yet.');return;}
  let pool=options.filter(c=>!seen.has(c.id));
  if(!pool.length)pool=options.filter(c=>c.id!==active?.id);
  if(!pool.length)pool=options;
  const c=pool[Math.floor(Math.random()*pool.length)];openComment(c);
}
function openComment(c,{track=true}={}){
  if(!c)return;
  const wasOpen=!$('#reader').hidden;
  if(!wasOpen){previousFocus=document.activeElement;readingOrigin={x:targetX,y:targetY,z:targetZ,rx:rotationTarget.x,ry:rotationTarget.y};}
  active=c;seen.add(c.id);hoverId=null;$('#hover-preview').hidden=true;$('#library').hidden=true;
  if(track){history=history.slice(0,historyIndex+1);history.push(c.id);historyIndex=history.length-1;}
  $('#reader').hidden=false;app.classList.add('reader-open','exploring');$('#home').hidden=false;
  setText($('#reader-position'),'@'+c.author);setText($('#sender-initial'),c.author.replace(/^[_.]+/,'').charAt(0).toUpperCase());
  $('#reader').classList.toggle('is-short',c.text.length<55);$('#reader').classList.toggle('is-long',c.text.length>120);
  setText($('#reader-title'),c.text);setText($('#reader-byline'),c.postDate||'');
  $('#reader-moods').replaceChildren();
  for(const m of c.moods){const s=document.createElement('span');s.textContent=moodNames[m];$('#reader-moods').append(s);}
  $('#thread').replaceChildren();
  const replies=c.conversation.filter(r=>r.id!==c.id);
  if(replies.length){
    const toggle=document.createElement('button');toggle.className='thread-toggle';toggle.setAttribute('aria-expanded','false');toggle.innerHTML=`<span>${c.parentId?'Conversation':replies.length+' '+(replies.length===1?'reply':'replies')}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>`;
    const content=document.createElement('div');content.className='thread-replies';content.hidden=true;toggle.onclick=()=>{content.hidden=!content.hidden;toggle.setAttribute('aria-expanded',String(!content.hidden));};$('#thread').append(toggle,content);
    for(const r of replies){const item=document.createElement('div');item.className='reply'+(r.isOwner?' is-khushi':'');const who=document.createElement('span');who.textContent=r.isOwner?'Khushi':`@${r.author}`;const p=document.createElement('p');p.textContent=r.text;item.append(who,p);content.append(item);}
  }
  $('#original').href=c.commentUrl;$('#same-author').textContent='Follow this voice';
  $('#same-author').disabled=data.comments.filter(x=>x.author===c.author).length<2;
  $('#read-count').textContent=`${seen.size} discovered`;
  $('#prev-comment').disabled=historyIndex<=0;
  $('.reader-scroll').scrollTop=0;
  const f=nearWords.find(f=>f.comment.id===c.id);
  if(f){
    targetZ=mobile()?homeZ*.32:Math.min(homeZ*.38,65);
    targetX=f.x;targetY=f.y;
    rotationTarget.set(0,0);
  }
  announce(`Comment by ${c.author}: ${c.text}`);
  if(!wasOpen)$('#close-reader').focus({preventScroll:true});
}
function closeReader(restore=true){
  const wasOpen=!$('#reader').hidden;
  $('#reader').hidden=true;app.classList.remove('reader-open');active=null;
  if(restore&&wasOpen){
    if(readingOrigin){targetX=readingOrigin.x;targetY=readingOrigin.y;targetZ=readingOrigin.z;rotationTarget.set(readingOrigin.rx,readingOrigin.ry);$('#home').hidden=targetZ>=homeZ*.94;}
    if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
  }
}
function renderLibrary(){
  const list=$('#library-list');list.replaceChildren();
  const comments=eligible();
  setText($('#library-note'),`${comments.length} comments${authorFilter?' by @'+authorFilter:mood==='all'?'': ' · '+moodNames[mood]}. Original words, just as they were written.`);
  if(!comments.length){const p=document.createElement('p');p.textContent='No comments in this mood yet. Try Everything.';list.append(p);}
  for(const c of comments){const b=document.createElement('button');b.className='list-comment';const p=document.createElement('p');p.textContent=c.text;const s=document.createElement('span');s.textContent=`@${c.author}${c.postDate?' · '+c.postDate:''}`;b.append(p,s);b.addEventListener('click',()=>openComment(c));list.append(b);}
}
function openLibrary(){previousFocus=document.activeElement;closeReader(false);renderLibrary();$('#library').hidden=false;$('#close-library').focus();}
function closeLibrary(){$('#library').hidden=true;$('#browse').focus();}

function pick(event){
  if(!mesh||!renderer||!initialized)return null;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  const near=homeZ/camera.position.z>1.35;
  const hits=raycaster.intersectObject(near?nearMesh:mesh,true);
  for(const h of hits){const f=(near?h.object.userData.words:fragments)[h.instanceId];if(matches(f.comment))return f;}
  return null;
}
host.addEventListener('pointerdown',e=>{
  if(active)return;
  host.setPointerCapture(e.pointerId);pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointerMap.size===1){pointerStart={x:e.clientX,y:e.clientY,tx:targetX,ty:targetY,rx:rotationTarget.x,ry:rotationTarget.y};dragDistance=0;}
  if(pointerMap.size===2){const [a,b]=[...pointerMap.values()];pinchStart={dist:Math.hypot(a.x-b.x,a.y-b.y),z:targetZ};}
});
host.addEventListener('pointermove',e=>{
  if(pointerMap.has(e.pointerId)){
    pointerMap.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointerMap.size===2&&pinchStart){const [a,b]=[...pointerMap.values()];targetZ=THREE.MathUtils.clamp(pinchStart.z*pinchStart.dist/Math.hypot(a.x-b.x,a.y-b.y),minimumZ(),homeZ);$('#home').hidden=false;app.classList.add('exploring');dragDistance=100;return;}
    if(pointerStart){const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;dragDistance=Math.hypot(dx,dy);if(targetZ<homeZ*.83){targetX=THREE.MathUtils.clamp(pointerStart.tx-dx*.0012*targetZ,-240,240);targetY=THREE.MathUtils.clamp(pointerStart.ty+dy*.0012*targetZ,-145,145);}else{rotationTarget.y=THREE.MathUtils.clamp(pointerStart.ry+dx*.0008,-.2,.2);rotationTarget.x=THREE.MathUtils.clamp(pointerStart.rx+dy*.0005,-.12,.12);}}return;
  }
  if(mobile()||active||tick%2!==0)return;
  const f=pick(e);hoverId=f?.comment.id||null;host.style.cursor=f?'pointer':'grab';
  const tooltip=$('#hover-preview');tooltip.hidden=!f;
  if(f){setText(tooltip.querySelector('p'),f.comment.text.length>170?f.comment.text.slice(0,167)+'…':f.comment.text);setText(tooltip.querySelector('span'),'@'+f.comment.author+' · Click to read');tooltip.style.left=THREE.MathUtils.clamp(e.clientX+20,12,width-280)+'px';tooltip.style.top=THREE.MathUtils.clamp(e.clientY-40,85,height-210)+'px';}
});
function endPointer(e){
  if(pointerMap.size===1&&dragDistance<7&&pointerStart){const f=pick(e);if(f)openComment(f.comment);}
  pointerMap.delete(e.pointerId);if(!pointerMap.size){pointerStart=null;pinchStart=null;}
}
host.addEventListener('pointerup',endPointer);
host.addEventListener('pointercancel',e=>{pointerMap.delete(e.pointerId);pointerStart=null;pinchStart=null;});
host.addEventListener('pointerleave',()=>{hoverId=null;$('#hover-preview').hidden=true;});
host.addEventListener('wheel',e=>{if(active)return;e.preventDefault();zoomBy(Math.exp(e.deltaY*.001));$('#hover-preview').hidden=true;},{passive:false});

$('#brand').onclick=goHome;$('#home').onclick=goHome;$('#zoom-in').onclick=()=>zoomBy(.77);$('#zoom-out').onclick=()=>zoomBy(1.3);
$$('.moods button').forEach(b=>b.onclick=()=>changeMood(b.dataset.mood));
$('#surprise').onclick=chooseSurprise;$('#next-comment').onclick=chooseSurprise;
$('#prev-comment').onclick=()=>{if(historyIndex>0){historyIndex--;openComment(data.comments.find(c=>c.id===history[historyIndex]),{track:false});}};
$('#close-reader').onclick=()=>closeReader();$('#browse').onclick=openLibrary;$('#close-library').onclick=closeLibrary;
$('#same-author').onclick=()=>{const name=active.author;closeReader(false);mood='all';authorFilter=name;lastMoodTime=sceneTime;targetZ=homeZ;targetX=0;targetY=0;updateMoodUI();renderLibrary();$('#library').hidden=false;$('#home').hidden=false;$('#close-library').focus();};
function updateMotion(){
  $('#motion').setAttribute('aria-pressed',String(paused));$('#motion').setAttribute('aria-label',paused?'Resume motion':'Pause motion');
  $('#motion svg').innerHTML=paused?'<path d="m9 5 10 7-10 7V5Z"/>':'<path d="M9 6v12M15 6v12"/>';
}
$('#motion').onclick=()=>{paused=!paused;updateMotion();};updateMotion();
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#library').hidden)closeLibrary();else if(!$('#reader').hidden)closeReader();else goHome();}
  if(e.key==='Tab'){
    const pane=!$('#library').hidden?$('#library'):!$('#reader').hidden?$('#reader'):null;if(!pane)return;
    const items=[...pane.querySelectorAll('button:not(:disabled),a[href]')].filter(x=>!x.hidden);const first=items[0],last=items.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  }
});

const dummy=new THREE.Object3D();
function animate(ms){
  requestAnimationFrame(animate);
  if(document.hidden)return;
  // A calm scene stays smooth at 30fps and avoids exhausting the laptop GPU.
  if(ms-lastRendered<31)return;lastRendered=ms;
  const dt=Math.min((ms-lastFrame)/1000,.05);lastFrame=ms;tick++;
  if(!paused)sceneTime+=dt;
  loadIn=Math.min(1,loadIn+dt*.5);
  if(!renderer||!initialized)return;
  const ease=1-Math.exp(-dt*4.5);
  camera.position.x=THREE.MathUtils.lerp(camera.position.x,targetX,ease);
  camera.position.y=THREE.MathUtils.lerp(camera.position.y,targetY,ease);
  camera.position.z=THREE.MathUtils.lerp(camera.position.z,targetZ,ease);
  world.rotation.x=THREE.MathUtils.lerp(world.rotation.x,rotationTarget.x,ease);
  world.rotation.y=THREE.MathUtils.lerp(world.rotation.y,rotationTarget.y,ease);
  const close=THREE.MathUtils.clamp(1-camera.position.z/homeZ,0,.85);
  const alphas=mesh.geometry.attributes.wordAlpha,colors=mesh.geometry.attributes.wordColor;
  const wave=(sceneTime-lastMoodTime)*85-105;
  const zoom=homeZ/camera.position.z;
  const nearAlpha=THREE.MathUtils.smoothstep(zoom,1.12,1.55);
  const farAlpha=1-nearAlpha;
  fragments.forEach((f,i)=>{
    const selected=f.comment.id===active?.id;
    const hovering=f.comment.id===hoverId;
    const match=matches(f.comment);
    const float=paused||active?0:Math.sin(sceneTime*.34+f.seed)*.13;
    const zDrift=paused||active?0:Math.sin(sceneTime*.24+f.seed)*.42;
    const expanding=close*.028;
    dummy.position.set(f.x*(1+expanding),f.y*(1+close*.06)+float,f.z+zDrift+(match&&mood!=='all'?1.7:0)+(selected?2:0));
    dummy.scale.set(f.w,f.h,1);dummy.rotation.set(-world.rotation.x*.4,-world.rotation.y*.4,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    const shine=Math.max(0,1-Math.abs(f.x-wave)/12)*.45;
    const targetOpacity=farAlpha*(active?(selected?1:.2):(match?Math.min(1,f.brightness+shine+(hovering?.3:0)):.23));
    alphas.array[i]=targetOpacity;
    colorScratch.set(selectedColor(f.comment));
    for(let c=0;c<3;c++)colors.array[i*3+c]+=([colorScratch.r,colorScratch.g,colorScratch.b][c]-colors.array[i*3+c])*ease;
  });
  mesh.instanceMatrix.needsUpdate=true;alphas.needsUpdate=true;colors.needsUpdate=true;
  if(nearMesh)for(const part of nearMesh.children){
    const na=part.geometry.attributes.wordAlpha,nc=part.geometry.attributes.wordColor;
    part.userData.words.forEach((f,i)=>{
      const selected=f.comment.id===active?.id,hovering=f.comment.id===hoverId;
      const opacity=nearAlpha*(active?(selected?1:.35):(matches(f.comment)?hovering?1:.9:.13));
      na.array[i]=opacity;colorScratch.set(selectedColor(f.comment));
      nc.array[i*3]+=(colorScratch.r-nc.array[i*3])*ease;nc.array[i*3+1]+=(colorScratch.g-nc.array[i*3+1])*ease;nc.array[i*3+2]+=(colorScratch.b-nc.array[i*3+2])*ease;
    });na.needsUpdate=true;nc.needsUpdate=true;
  }
  if(tick%10===0)$('#zoom-label').textContent=(homeZ/camera.position.z).toFixed(1).replace('.0','')+'×';
  renderer.render(scene,camera);
}

let refreshing=false;
async function refreshComments(first=false){
  if(refreshing)return;refreshing=true;
  try{
    const response=await fetch(import.meta.env.DEV?'/api/comments':'./data/comments.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Comments unavailable');
    const next=await response.json();if(!Array.isArray(next.comments))throw new Error('Invalid comments');
    if(next.version!==data.version){
      const previous=data.comments.length;data=next;
      $('#counter').textContent=`${data.comments.length} little moments, in their own words.`;
      $('#coverage').textContent=data.postsRead<data.postTotal?`${data.postsRead} of ${data.postTotal} posts · More words are arriving`:`${data.postsRead} posts explored · Collection in progress`;
      if(!data.comments.length){$('#scene-status').hidden=false;$('#scene-status').textContent='The first words will find their way here soon.';}
      buildCloud();updateMoodUI();if(!$('#library').hidden)renderLibrary();
      if(active){const updated=data.comments.find(c=>c.id===active.id);if(updated)active=updated;}
      if(!first&&data.comments.length>previous)toast(`${data.comments.length-previous} more little moments have joined.`);
    }
  }catch{
    if(first){$('#scene-status').hidden=false;$('#scene-status').textContent='The words couldn’t load. Try refreshing the page.';$('#counter').textContent='The collection is temporarily unavailable.';}
  }finally{refreshing=false;}
}

await Promise.all([document.fonts.load('700 360px "Bricolage Grotesque"'),document.fonts.load('500 26px "DM Sans"')]);
resize();await refreshComments(true);requestAnimationFrame(animate);
setInterval(()=>{if(!document.hidden)refreshComments();},12000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshComments();});
