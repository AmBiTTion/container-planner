import {binFor,allTypes} from './model.js';
import {shape} from './engine.js';
import {workspaceItems} from './batch-edit.js';

const NS='http://www.w3.org/2000/svg';
const element=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));return e;};
export class Editor2D{
  constructor(host,{select,move,place,preview,notice}){
    this.host=host;this.select=select;this.move=move;this.place=place;this.preview=preview;this.notice=notice;
    this.svg=element('svg',{'aria-label':'二维精确摆放编辑器',role:'img',tabindex:0});host.append(this.svg);
    this.svg.addEventListener('contextmenu',e=>e.preventDefault());
    this.svg.addEventListener('pointerdown',e=>this.down(e));
    this.svg.addEventListener('pointermove',e=>this.dragTo(e));
    this.svg.addEventListener('pointerup',e=>this.up(e));
    this.svg.addEventListener('pointercancel',()=>{this.drag=null;this.draw();});
    this.svg.addEventListener('wheel',e=>{e.preventDefault();const at=this.point(e),f=e.deltaY>0?1.15:1/1.15,v=this.view;
      if(v.w*f<50||v.w*f>1e6)return;this.view={x:at.x+(v.x-at.x)*f,y:at.y+(v.y-at.y)*f,w:v.w*f,h:v.h*f};this.setView();},{passive:false});
  }
  point(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(this.svg.getScreenCTM().inverse());return {x:p.x,y:p.y};}
  setView(){const v=this.view;this.svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);}
  update(p,mode,report,ui){
    const key=`${p.id}:${mode}:${ui.editor2d}:${binFor(p,mode).length}:${binFor(p,mode).width}`;
    this.p=p;this.mode=mode;this.report=report;this.ui=ui;
    this.host.classList.toggle('hidden',!ui.editor2d);
    if(!ui.editor2d)return;
    if(this.key!==key){this.key=key;this.fit();}this.draw();
  }
  fit(){const b=binFor(this.p,this.mode),h=this.ui.editor2d==='side'?b.height:b.width,pad=Math.max(b.length,h)*.055;this.view={x:-pad,y:-pad,w:b.length+pad*2,h:h+pad*2};this.setView();}
  geometry(i,t){const a=shape(i,t),b=binFor(this.p,this.mode);return this.ui.editor2d==='side'?{x:a.x,y:b.height-a.z-a.h,w:a.l,h:a.h,points:[[a.x,b.height-a.z-a.h],[a.x+a.l,b.height-a.z-a.h],[a.x+a.l,b.height-a.z],[a.x,b.height-a.z]]}:{x:a.x,y:a.y,w:a.l,h:a.w,points:a.polygon};}
  draw(){
    if(!this.p||!this.ui.editor2d)return;
    const svg=this.svg;svg.replaceChildren();const b=binFor(this.p,this.mode),h=this.ui.editor2d==='side'?b.height:b.width;
    svg.append(element('rect',{x:0,y:0,width:b.length,height:h,fill:'#f7f8f3',stroke:'#5a7563','stroke-width':3}));
    const step=Math.max(this.p.settings.snap||50,Math.ceil(Math.max(b.length,h)/100/50)*50);
    for(let x=0;x<=b.length;x+=step)svg.append(element('line',{x1:x,y1:0,x2:x,y2:h,stroke:'#dce3d9','stroke-width':1}));
    for(let y=0;y<=h;y+=step)svg.append(element('line',{x1:0,y1:y,x2:b.length,y2:y,stroke:'#dce3d9','stroke-width':1}));
    this.visible=workspaceItems(this.p,this.mode).filter(i=>this.ui.layer==='all'||(this.ui.onlyLayer?this.report.levels[i.id]===Number(this.ui.layer):this.report.levels[i.id]<=Number(this.ui.layer)));
    const types=allTypes(this.p),errors=new Set(this.report.issues.filter(i=>i.level==='error').flatMap(i=>i.ids));
    for(const i of [...this.visible].sort((a,b)=>a.z-b.z)){
      const t=types.find(t=>t.id===i.typeId),g=this.geometry(i,t),chosen=this.ui.selection.includes(i.id),group=element('g',{'data-item-id':i.id});
      group.append(element('polygon',{points:g.points.map(p=>p.join(',')).join(' '),fill:errors.has(i.id)?'#e9a599':t.color,'fill-opacity':.8,stroke:chosen?'#163fe0':'#5c685b','stroke-width':chosen?5:1.5,'vector-effect':'non-scaling-stroke'}));
      const text=element('text',{x:g.x+g.w/2,y:g.y+g.h/2,'text-anchor':'middle','dominant-baseline':'middle','font-size':Math.max(12,Math.min(g.w/8,g.h/4,75)),fill:'#19261f','pointer-events':'none'});
      text.textContent=`${t.name.slice(0,12)}${i.locked?' 🔒':''}`;group.append(text);
      const title=element('title');title.textContent=`${t.name} · X ${i.x.toFixed(1)} Y ${i.y.toFixed(1)} Z ${i.z.toFixed(1)} mm`;group.append(title);svg.append(group);
    }
    if(this.ui.spaces)for(const a of this.ui.spaceData?.regions||[]){
      const side=this.ui.editor2d==='side',y=side?b.height-a.z-a.h:a.y,h=side?a.h:a.w;
      const group=element('g',{'data-free-region':a.id,'pointer-events':'none'});
      group.append(element('rect',{x:a.x,y,width:a.l,height:h,fill:'#ddab3a18',stroke:'#ad6d11','stroke-width':2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'7 5'}));
      const label=element('text',{x:a.x+5,y:y+Math.min(h*.6,90),'font-size':Math.max(18,b.length*.012),fill:'#754306'});label.textContent=`#${a.id}`;group.append(label);svg.append(group);
    }
    const title=element('text',{x:b.length/2,y:-Math.max(30,b.length*.018),'text-anchor':'middle','font-size':Math.max(20,b.length*.018),fill:'#435b47'});title.textContent=`X 长向 ${b.length} mm　→ 柜门　${this.ui.editor2d==='side'?'侧视：向上为 Z 高度':'俯视：向下为 Y 宽向'}`;svg.append(title);
  }
  down(e){
    if(![0,2].includes(e.button))return;
    const at=this.point(e),id=e.target.closest('[data-item-id]')?.dataset.itemId;
    this.drag={at,last:at,id,button:e.button,add:e.ctrlKey||e.metaKey||e.shiftKey,view:{...this.view},client:[e.clientX,e.clientY]};
    this.svg.setPointerCapture(e.pointerId);
  }
  dragTo(e){
    if(!this.drag){
      if(this.ui.pending&&this.ui.editor2d==='top'){
        const at=this.point(e),z=this.ui.layer==='all'?0:Math.min(...this.visible.map(i=>i.z),Infinity),r=this.preview?.({x:at.x,y:at.y,z:Number.isFinite(z)?z:0});
        this.svg.querySelector('[data-drag-preview]')?.remove();
        if(r){const t=allTypes(this.p).find(t=>t.id===r.item.typeId),g=this.geometry(r.item,t);this.svg.append(element('polygon',{'data-drag-preview':'',points:g.points.map(p=>p.join(',')).join(' '),fill:r.valid?'#81bb7855':'#ed746655',stroke:r.valid?'#367934':'#bc3929','stroke-width':3,'pointer-events':'none'}));}
      }return;
    }const d=this.drag,at=this.point(e);d.last=at;
    if(d.button===2){this.view={...this.view,x:this.view.x+d.at.x-at.x,y:this.view.y+d.at.y-at.y};this.setView();return;}
    this.svg.querySelector('[data-drag-preview]')?.remove();
    if(d.id&&!d.add){const i=this.visible.find(i=>i.id===d.id);if(!i)return;
      const t=allTypes(this.p).find(t=>t.id===i.typeId),g=this.geometry(i,t);
      this.svg.append(element('rect',{'data-drag-preview':'',x:g.x+at.x-d.at.x,y:g.y+at.y-d.at.y,width:g.w,height:g.h,fill:'none',stroke:'#164cdf','stroke-width':3,'stroke-dasharray':'12 6','pointer-events':'none'}));
    }else if(!d.id)this.svg.append(element('rect',{'data-drag-preview':'',x:Math.min(d.at.x,at.x),y:Math.min(d.at.y,at.y),width:Math.abs(at.x-d.at.x),height:Math.abs(at.y-d.at.y),fill:'#588bff33',stroke:'#164cdf','stroke-width':3,'pointer-events':'none'}));
  }
  up(e){
    const d=this.drag;if(!d)return;this.drag=null;
    const at=this.point(e),clicked=Math.hypot(e.clientX-d.client[0],e.clientY-d.client[1])<5;
    if(this.svg.hasPointerCapture(e.pointerId))this.svg.releasePointerCapture(e.pointerId);
    if(d.button===2)return;
    try{
      if(this.ui.pending&&clicked){if(this.ui.editor2d==='side')throw Error('新增货物请使用二维俯视，或指定 XYZ 坐标');
        const z=this.ui.layer==='all'?0:Math.min(...this.visible.map(i=>i.z),Infinity);this.place({x:at.x,y:at.y,z:Number.isFinite(z)?z:0});return;}
      if(d.id){if(clicked||d.add)this.select([d.id],d.add);else{
        const step=this.ui.snapping?(this.p.settings.snap||1):1,dx=Math.round((at.x-d.at.x)/step)*step,dy=Math.round((at.y-d.at.y)/step)*step;
        if(!this.ui.selection.includes(d.id))this.select([d.id],false);
        this.move({x:dx,y:this.ui.editor2d==='side'?0:dy,z:this.ui.editor2d==='side'?-dy:0});
      }}else if(clicked)this.select([],false);else{
        const types=allTypes(this.p),x0=Math.min(at.x,d.at.x),x1=Math.max(at.x,d.at.x),y0=Math.min(at.y,d.at.y),y1=Math.max(at.y,d.at.y);
        this.select(this.visible.filter(i=>{const g=this.geometry(i,types.find(t=>t.id===i.typeId));return g.x>=x0&&g.x+g.w<=x1&&g.y>=y0&&g.y+g.h<=y1;}).map(i=>i.id),d.add);
      }
    }catch(error){this.notice(error.message,true);}finally{this.draw();}
  }
}
