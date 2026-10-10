import {clone,validateProject} from './model.js';
export const operationDefaults=()=>({door:0,front:0,side:0,top:0,enforceGap:true,limits:{front:0,rear:0,left:0,right:0}});
export function workingSpace(p,mode){
  const b=mode==='pallet'?{length:p.pallet.length+2*p.pallet.overhang,width:p.pallet.width+2*p.pallet.overhang,height:p.pallet.height-p.pallet.baseHeight}:p.container;
  const o=mode==='container'?{...operationDefaults(),...p.settings.operations}:operationDefaults();
  return {minX:o.front,minY:o.side,maxX:b.length-o.door,maxY:b.width-o.side,maxZ:b.height-o.top};
}
export function clearanceIssue(p,mode,a,objects=[]){
  if(mode!=='container'||!p.settings.operations)return null;
  const c=workingSpace(p,mode);
  if(a.x<c.minX-.05||a.y<c.minY-.05||a.x+a.l>c.maxX+.05||a.y+a.w>c.maxY+.05||a.z+a.h>c.maxZ+.05)return {code:'clearance',text:'侵入门口、顶部或绑扎预留空间',textEn:'Cargo intrudes into the reserved door, top or securing clearance.'};
  const gap=p.settings.operations.enforceGap?p.settings.gap:0;
  if(gap>0&&objects.some(b=>b.item.id!==a.item.id&&Math.min(a.z+a.h,b.z+b.h)>Math.max(a.z,b.z)+.05&&a.x<b.x+b.l+gap-.05&&a.x+a.l>b.x-gap+.05&&a.y<b.y+b.w+gap-.05&&a.y+a.w>b.y-gap+.05))return {code:'clearance-gap',text:`货物水平包络间距不足 ${gap} mm`,textEn:`Horizontal cargo envelope spacing is less than ${gap} mm.`};
  return null;
}
// Regional mass is apportioned by a uniformly loaded bounding footprint, not axle loads.
export function regionalWeight(objects,bin){
  const totals={front:0,rear:0,left:0,right:0};
  for(const a of objects){const front=Math.max(0,Math.min(1,(bin.length/2-a.x)/a.l)),left=Math.max(0,Math.min(1,(bin.width/2-a.y)/a.w));totals.front+=a.t.weight*front;totals.rear+=a.t.weight*(1-front);totals.left+=a.t.weight*left;totals.right+=a.t.weight*(1-left);}return totals;
}
export function regionalIssue(p,objects){
  const totals=regionalWeight(objects,p.container),limits=p.settings.operations?.limits||{},names={front:'前半（柜内深处）',rear:'后半（靠柜门）',left:'低 Y 半区',right:'高 Y 半区'};
  const key=Object.keys(totals).find(k=>limits[k]>0&&totals[k]>limits[k]+.05);
  return key?{code:'regional-weight',text:`${names[key]}估算重量 ${totals[key].toFixed(1)} kg 超过区域限值 ${limits[key]} kg`,textEn:`Estimated ${key} half weight ${totals[key].toFixed(1)} kg exceeds the regional limit of ${limits[key]} kg.`}:null;
}
export function applyBagScenario(project,scenario,entries){
  if(!['ideal','conservative'].includes(scenario))throw Error('尺寸方案无效');const p=clone(project);
  for(const t of p.types.filter(t=>['soft','woven'].includes(t.kind))){
    const entry=entries?.[t.id],ideal=entry?.ideal||t.bagIdeal||[t.effectiveLength,t.effectiveWidth,t.effectiveHeight],tolerance=entry?.tolerance||t.bagTolerance||[0,0,0];
    if(ideal.length!==3||tolerance.length!==3||ideal.some(n=>!Number.isFinite(n)||n<=0)||tolerance.some(n=>!Number.isFinite(n)||n<0||n>1000))throw Error('袋子理想尺寸必须大于 0，容差须为 0–1000 mm');
    t.bagIdeal=[...ideal];t.bagTolerance=[...tolerance];['effectiveLength','effectiveWidth','effectiveHeight'].forEach((k,i)=>t[k]=ideal[i]+(scenario==='conservative'?tolerance[i]:0));
  }p.settings.bagScenario=scenario;return validateProject(p);
}
