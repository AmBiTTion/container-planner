import {allTypes,binFor} from './model.js';
import {physical,footprint} from './engine.js';
import {workingSpace} from './operations.js';

const volume=a=>a.l*a.w*a.h;
// Disjoint empty boxes outside cargo AABBs. Arbitrarily rotated cargo is
// conservatively enclosed: omitted triangular gaps are never called usable.
function subtract(a,b){
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),z=Math.max(a.z,b.z),
    X=Math.min(a.x+a.l,b.x+b.l),Y=Math.min(a.y+a.w,b.y+b.w),Z=Math.min(a.z+a.h,b.z+b.h);
  if(X-x<=.05||Y-y<=.05||Z-z<=.05)return [a];
  return [
    {x:a.x,y:a.y,z:a.z,l:x-a.x,w:a.w,h:a.h},
    {x:X,y:a.y,z:a.z,l:a.x+a.l-X,w:a.w,h:a.h},
    {x,y:a.y,z:a.z,l:X-x,w:y-a.y,h:a.h},
    {x,y:Y,z:a.z,l:X-x,w:a.y+a.w-Y,h:a.h},
    {x,y,z:a.z,l:X-x,w:Y-y,h:z-a.z},
    {x,y,z:Z,l:X-x,w:Y-y,h:a.z+a.h-Z},
  ].filter(v=>v.l>.05&&v.w>.05&&v.h>.05);
}
function merge(boxes){
  for(let pass=0;pass<2;pass++)for(const [axis,size] of [['x','l'],['y','w'],['z','h']]){
    const keys=['x','y','z','l','w','h'].filter(k=>k!==axis&&k!==size),groups=new Map();
    for(const a of boxes){const key=keys.map(k=>Math.round(a[k]*100)).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
    boxes=[];
    for(const list of groups.values()){
      list.sort((a,b)=>a[axis]-b[axis]);let prev=null;
      for(const a of list){if(prev&&Math.abs(prev[axis]+prev[size]-a[axis])<.01)prev[size]+=a[size];else{prev={...a};boxes.push(prev);}}
    }
  }
  return boxes;
}
export function freeSpaces(p,mode,report,{limit=12,budget=3000}={}){
  const b=binFor(p,mode),work=workingSpace(p,mode);
  let boxes=[{x:0,y:0,z:0,l:b.length,w:b.width,h:b.height}],partial=false;
  for(const a of physical(p,mode)){
    boxes=boxes.flatMap(v=>subtract(v,a));
    if(boxes.length>budget){boxes.sort((a,b)=>volume(b)-volume(a));boxes.length=budget;partial=true;}
  }
  boxes=merge(boxes).sort((a,b)=>volume(b)-volume(a));
  const remaining=(mode==='pallet'?p.types:allTypes(p)).filter(t=>(report.used[t.id]||0)<t.quantity&&!t.isBase);
  const regions=boxes.slice(0,limit).map((a,index)=>{
    const dim=`${Math.round(a.l)} × ${Math.round(a.w)} × ${Math.round(a.h)} mm`;
    let reason='',short='';
    const fits=[];
    for(const t of remaining)for(const r of t.allowRotate?[0,90]:[0]){
      const d=footprint(t,r);
      if(d.l<=a.l+.05&&d.w<=a.w+.05&&d.h<=a.h+.05){fits.push({t,r,d});break;}
    }
    if(!remaining.length){short='库存已装完';reason='当前工作区可用库存已全部装入，无需填满所有空间。';}
    else if(!fits.length){short='余隙尺寸不足';reason='此空区按允许的水平 0°/90° 朝向，放不下任何剩余规格的完整有效包络；相邻空区可能需合并重排。';}
    else if(fits.every(({t})=>t.weight>b.maxWeight-report.weight+.05)){short='载重不足';reason=`尺寸虽能容纳，但剩余载重只有 ${Math.max(0,b.maxWeight-report.weight).toFixed(1)} kg。`;}
    else if(a.x+a.l<=work.minX+.05||a.x>=work.maxX-.05||a.y+a.w<=work.minY+.05||a.y>=work.maxY-.05||a.z>=work.maxZ-.05){short='预留空间';reason='位于门口、绑扎、侧边或顶部预留区，不参与配载。';}
    else {
      const f=fits.find(({t})=>t.weight<=b.maxWeight-report.weight+.05);
      short='尺寸可容纳，待校验';reason=`尺寸可容纳「${f.t.name}」水平 ${f.r}°；${a.z>.05?'此处不是地面，需检查底部支撑、层数和下层承重。':'需再检查间距、区域限重及锁定布局。'}自动搜索可能漏放，可尝试手动补位或解锁重排。`;
    }
    return {...a,id:index+1,dim,short,reason,volume:volume(a)};
  });
  return {regions,partial:partial||boxes.length>limit,totalRegions:boxes.length};
}
