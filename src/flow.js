/** Short, cancellable transitions connecting controls to the content they change. */
export class FlowMotion {
  constructor(reduced) { this.reduced=reduced; this.running=new Map(); }
  enter(element, kind='settle') {
    if(!element || element.hidden) return;
    this.running.get(element)?.cancel();
    if(this.reduced()) return;
    const from=kind==='drawer'?'translateX(20px)':kind==='filter'?'scale(.97)':'translateY(7px)';
    const animation=element.animate([{opacity:.35,transform:from},{opacity:1,transform:'none'}],
      {duration:kind==='drawer'?320:240,easing:'cubic-bezier(.16,1,.3,1)'});
    this.running.set(element,animation);
    animation.finished.catch(()=>{}).then(()=>{if(this.running.get(element)===animation)this.running.delete(element);});
  }
  stop() { for(const animation of this.running.values())animation.cancel();this.running.clear(); }
}
