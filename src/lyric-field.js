import { project, unproject } from './math.js';
import { sourceCrops, flight, smooth, clamp, mix } from './lyric-geometry.js';

/** Owns temporary presentations, NEVER canonical layout nodes or source textures.
 * GPU fragments reference the constellation's existing atlas textures/UVs.
 * The compatibility path crops its existing comment canvases. */
export class LyricField {
  constructor(getScene){this.getScene=getScene;this.fragments=[];this.batches=[];this.currentRects=new Map();this.returnRects=new Map();this.needsMeasure=true;}
  prepare(records,scroll){
    this.dispose();this.scroll=scroll;const {renderer}=this.getScene();this.renderer=renderer;
    const ctx=document.createElement('canvas').getContext('2d');
    const measure=(text,font)=>{ctx.font=`${font}px Georgia, "Times New Roman", serif`;return ctx.measureText(text).width;};
    const atlas=new Map();
    if(renderer.gl){for(const page of renderer.pages)page.nodes.forEach((n,index)=>atlas.set(n.index,{page,index}));}
    else for(const tile of renderer.tiles||[])atlas.set(tile.node.index,{tile});
    const firstSeen=new Set();let index=0;
    for(const record of records){
      if(!record.source)continue;
      const texture=atlas.get(record.source.node.index);if(!texture)continue;
      const echo=firstSeen.has(record.source.key);firstSeen.add(record.source.key);
      const crops=sourceCrops(record.source,measure);let offset=0;
      for(const [part,crop] of crops.entries()){
        this.fragments.push({index:index++,record,crop,texture,echo,offset});offset+=crop.width;
        const a=record.source.segments[part],b=record.source.segments[part+1];
        if(b&&/\s/u.test(record.source.node.comment.text.slice(a.line.start+a.end,b.line.start+b.start)))offset+=measure(' ',crop.font);
      }
    }
    if(renderer.gl){
      const groups=new Map();
      for(const f of this.fragments){const p=f.texture.page;if(!groups.has(p))groups.set(p,[]);groups.get(p).push(f);}
      for(const [page,fragments] of groups){
        const array=new Float32Array(fragments.length*16);
        fragments.forEach((f,i)=>{
          const n=f.record.source.node,c=f.crop,original=page.array.slice(f.texture.index*16,f.texture.index*16+16),k=i*16;
          array.set([0,0,0,1,1,
            original[5]+original[7]*c.left/n.w,
            original[6]+original[8]*(1-(c.top+c.height)/n.h),
            original[7]*c.width/n.w,original[8]*c.height/n.h,
            ...n.color,0,-100-f.index,0,1],k);
          f.batchIndex=i;
        });
        const batch=renderer.createQuadBatch(array,16,[[1,3,0],[2,2,3],[3,4,5],[4,3,9],[5,4,12]]);
        this.batches.push({...batch,texture:page.texture,width:page.width,height:page.height,fragments});
      }
    }
    this.needsMeasure=true;
  }
  measure(){
    this.measuredScroll=this.scroll?.scrollTop||0;this.scrollBounds=this.scroll.getBoundingClientRect();
    for(const record of new Set(this.fragments.map(f=>f.record))){
      const r=record.el.getBoundingClientRect();record.rect={left:r.left,top:r.top,width:r.width,height:r.height};record.font=parseFloat(getComputedStyle(record.el).fontSize)||30;
    }this.needsMeasure=false;
  }
  origin(f,camera,width,height){
    const p=project(f.crop,camera,width,height);if(!p)return null;
    return {x:p.x,y:p.y,width:f.crop.width*p.scale,height:f.crop.height*p.scale};
  }
  target(f){
    const {record:r,crop:c}=f,rect=r.rect,ratio=r.font/c.font;
    return {x:rect.left+(f.offset+c.width/2)*ratio,y:rect.top+(c.height/2+.045*c.font)*ratio-(this.scroll.scrollTop-this.measuredScroll),width:c.width*ratio,height:c.height*ratio};
  }
  beginReturn(){this.returnRects=new Map([...this.currentRects].map(([id,r])=>[id,{...r}]));}
  render(camera,{gather=1,returning=false,returnProgress=0,time=0,current=0,energy=0,reduced=false}={}){
    const renderer=this.renderer;if(!renderer||renderer.lost||!this.fragments.length)return;
    if(this.needsMeasure)this.measure();
    const width=innerWidth,height=innerHeight,ctx=renderer.ctx;
    if(ctx){ctx.save();ctx.setTransform(renderer.dpr,0,0,renderer.dpr,0,0);ctx.globalCompositeOperation='source-over';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';}
    for(const f of this.fragments){
      const original=this.origin(f,camera,width,height);if(!original)continue;
      const r=f.record,w=r.word,target=this.target(f);
      const delay=Math.min(.1,f.record.phraseIndex*.012);const progress=reduced?1:clamp((gather-.16-delay)/(.84-delay));
      let rect=flight(original,target,progress,f.record.phraseIndex,reduced);
      const handoff=smooth(gather/.18),approach=smooth((gather-.13)/.87);
      const relevance=r.phraseIndex===current?1:Math.abs(r.phraseIndex-current)===1?.38:.2;
      const singing=time>=w.start&&time<w.end;
      let alpha=handoff*mix(r.source.node.luminosity,relevance,approach);
      if(singing)alpha=Math.min(1,alpha+.15+energy*.12);
      if(f.echo)alpha*=gather>=.999?smooth((time-(r.phrase.start??r.phrase.words[0].start)+.2)/.6):0;
      // The archive spelling flies intact. A supplied transliteration takes over
      // only at its recorded sung time, without changing the stored comment.
      if(r.adapted&&gather>=.999)alpha*=1-smooth((time-w.start)/.25);
      if(returning){
        if(r.adapted)alpha=handoff*relevance;
        if(f.echo)alpha*=1-smooth(returnProgress/.18);
        rect=flight(this.returnRects.get(f.index)||rect,original,returnProgress,f.record.phraseIndex,reduced);
        alpha*=1-smooth((returnProgress-.72)/.28);
      }
      if(!returning){
        const edge=68,bounds=this.scrollBounds;
        const aperture=smooth((rect.y-bounds.top)/edge)*smooth((bounds.bottom-rect.y)/edge);
        alpha*=mix(1,aperture,smooth((gather-.55)/.45));
      }
      this.currentRects.set(f.index,rect);
      const visible=rect.y+rect.height/2>0&&rect.y-rect.height/2<height&&rect.x+rect.width/2>0&&rect.x-rect.width/2<width;
      if(!visible)alpha=0;
      if(renderer.gl){
        const plane=camera.z-1000,world=unproject(rect.x,rect.y,plane,camera,width,height),units=2000*Math.tan(Math.PI/10)/height;
        const batch=this.batches.find(b=>b.texture===f.texture.page.texture),k=f.batchIndex*16;
        batch.array[k]=world.x;batch.array[k+1]=world.y;batch.array[k+2]=plane;batch.array[k+3]=rect.width*units;batch.array[k+4]=rect.height*units;batch.array[k+14]=alpha;
      }else if(alpha>.002){
        const tile=f.texture.tile,c=f.crop,factor=tile.canvas.width/r.source.node.w;
        ctx.globalAlpha=clamp(alpha);ctx.drawImage(tile.canvas,c.left*factor,c.top*factor,c.width*factor,c.height*factor,rect.x-rect.width/2,rect.y-rect.height/2,rect.width,rect.height);
      }
    }
    if(ctx){ctx.restore();return;}
    const g=renderer.gl,p=renderer.wordProgram;renderer.use(p,camera);
    for(const [name,value] of Object.entries({uMood:0,uMoodFrom:0,uHover:-1,uSelected:-1,uDetailPass:1,uMap:0}))g.uniform1i(renderer.loc(p,name),value);
    for(const [name,value] of Object.entries({uMoodBlend:1,uReveal:1,uReadMix:0,uPerformanceMix:0}))g.uniform1f(renderer.loc(p,name),value);
    g.uniform4iv(renderer.loc(p,'uDetailIds'),[-1,-1,-1,-1]);g.activeTexture(g.TEXTURE0);g.blendFunc(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA);
    for(const b of this.batches){
      g.bindBuffer(g.ARRAY_BUFFER,b.buffer);g.bufferSubData(g.ARRAY_BUFFER,0,b.array);g.bindTexture(g.TEXTURE_2D,b.texture);
      g.uniform2f(renderer.loc(p,'uTexel'),1/b.width,1/b.height);g.bindVertexArray(b.vao);g.drawArraysInstanced(g.TRIANGLE_STRIP,0,4,b.count);renderer.drawCalls++;
    }g.bindVertexArray(null);
  }
  dispose(){
    const gl=this.renderer?.gl;if(gl&&!this.renderer.lost)for(const b of this.batches){gl.deleteBuffer(b.buffer);gl.deleteVertexArray(b.vao);}
    // Atlas textures belong to the constellation. Do NOT delete them here.
    this.fragments=[];this.batches=[];this.currentRects.clear();this.returnRects.clear();this.renderer=null;
  }
}
