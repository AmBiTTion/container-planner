import {allTypes,binFor,uid} from './model.js';
import {clearanceIssue,workingSpace,regionalIssue} from './operations.js';
import {analyze,physical,shape,footprint,collides,supportsFor,groundFor,consumption} from './engine.js';

export function manualContext(project,mode,excludeId=null){
  const items=(mode==='pallet'?project.palletPlacements:project.placements).filter(i=>i.id!==excludeId);
  const objects=physical(project,mode,items),report=analyze(project,mode,items,{skipOrder:true});
  return {project,mode,excludeId,items,objects,report,baseline:excludeId?analyze(project,mode,undefined,{skipOrder:true}):report,types:allTypes(project),bin:binFor(project,mode),byId:new Map(objects.map(o=>[o.item.id,o]))};
}
export function heightMessage(project,mode,t){
  const b=binFor(project,mode);
  return mode==='pallet'?`可码货高度只有 ${b.height} mm（含托总高 ${project.pallet.height} − 底座 ${project.pallet.baseHeight}）；${t.name} 高 ${t.effectiveHeight} mm。请在装载设置中调整可码货高度。`:`柜内高度 ${b.height} mm，小于货物高度 ${t.effectiveHeight} mm。`;
}
export function previewManual(ctx,item,{complete=false,allowOverlap=false}={}){
  const {project,mode,bin,types,objects,report}=ctx,t=types.find(t=>t.id===item.typeId);
  const fail=reason=>({valid:false,reason,item});
  if(!t)return fail('货物规格不存在');
  if(['x','y','z','rotation'].some(k=>!Number.isFinite(item[k])))return fail('坐标与角度必须是有效数字');
  if(mode==='pallet'&&t.kind==='pallet')return fail('请在集装箱中放入整托，码托区只放货物');
  if(!t.allowRotate&&Math.abs(item.rotation%360)>.05)return fail('此货物不允许旋转');
  const a={item,t,...shape(item,t)};
  const clearance=clearanceIssue(project,mode,a,objects);if(clearance)return fail(clearance.text);
  const regional=mode==='container'?regionalIssue(project,[...objects,a]):null;if(regional)return fail(regional.text);
  if(a.h>bin.height+.05)return fail(heightMessage(project,mode,t));
  if(a.x<-.05||a.y<-.05||a.z<-.05)return fail('超出起始边界，请移回托盘或柜内');
  if(a.x+a.l>bin.length+.05)return fail(`长向超出 ${Math.ceil(a.x+a.l-bin.length)} mm，请向内移动或旋转`);
  if(a.y+a.w>bin.width+.05)return fail(`宽向超出 ${Math.ceil(a.y+a.w-bin.width)} mm，请向内移动或旋转`);
  if(a.z+a.h>bin.height+.05)return fail(`叠放后超高 ${Math.ceil(a.z+a.h-bin.height)} mm`);
  if(mode==='container'&&(a.w>bin.doorWidth+.05||a.h>bin.doorHeight+.05))return fail('当前朝向的宽高无法通过柜门');
  for(const [id,n] of Object.entries(consumption(t)))if((report.used[id]||0)+n>types.find(t=>t.id===id).quantity)return fail(`${types.find(t=>t.id===id).name} 库存不足`);
  if(report.weight+t.weight>bin.maxWeight+.05)return fail(`超出载货上限 ${(report.weight+t.weight-bin.maxWeight).toFixed(1)} kg`);
  const collision=objects.find(b=>collides(a,b));if(collision&&!allowOverlap)return fail(`与「${collision.t.name}」重叠，请移动到空位`);
  const support=supportsFor(a,objects,groundFor(project,mode));
  if(support.ratio*100+.01<project.settings.minSupport)return fail(`底部支撑 ${Math.round(support.ratio*100)}%，要求至少 ${project.settings.minSupport}%`);
  const level=(t.isBase?0:1)+Math.max(0,...support.under.map(u=>report.levels[u.id]||0));
  if(level>t.maxLayers)return fail(`将位于第 ${level} 层，超过 ${t.maxLayers} 层限制`);
  const queue=support.under.map(u=>({id:u.id,weight:t.weight*u.share})),delta=new Map();
  while(queue.length){const q=queue.shift(),b=ctx.byId.get(q.id);delta.set(q.id,(delta.get(q.id)||0)+q.weight);if((report.loads[q.id]||0)+delta.get(q.id)>b.t.maxLoad+.05)return fail(`下方「${b.t.name}」承重不足`);for(const u of supportsFor(b,objects).under)queue.push({id:u.id,weight:q.weight*u.share});}
  const rt=mode==='pallet'&&project.templates.find(t=>t.id===project.activeTemplate);
  if(rt){if(!rt.allowMixed&&objects.some(o=>o.t.id!==t.id))return fail('客户规则不允许混托');if(report.weight+t.weight+project.pallet.tare>rt.maxWeight+.05)return fail('超过客户规则的含托总重量');if(a.z+a.h+project.pallet.baseHeight>rt.maxHeight+.05)return fail('超过客户规则的含托总高度');}
  if(complete){const after=analyze(project,mode,[...ctx.items,item],{skipOrder:true});const prior=new Set(ctx.baseline.issues.filter(i=>i.level==='error').map(i=>i.code+':'+i.ids.join(',')));
    const issue=after.issues.find(i=>i.level==='error'&&!(allowOverlap&&i.code==='collision')&&(i.ids.includes(item.id)||!prior.has(i.code+':'+i.ids.join(','))));if(issue)return fail(issue.text);}
  return {valid:true,overlap:!!collision,reason:collision?'临时重叠可落位 · 仍属碰撞，完成调整后请消除重叠':`可放置 · 支撑 ${Math.round(support.ratio*100)}% · 第 ${level} 层`,item};
}
export function snapManual(ctx,item,enabled=true){
  if(!enabled)return {...item,x:Math.round(item.x),y:Math.round(item.y)};
  const d=footprint(ctx.types.find(t=>t.id===item.typeId),item.rotation),step=ctx.project.settings.snap||1,tolerance=Math.max(6,step*.65);
  const snapAxis=(value,axis,size,max)=>{const nearby=ctx.objects.filter(o=>Math.abs(o.z-item.z)<.05||Math.abs(o.z+o.h-item.z)<.05),candidates=[0,max-size];
    for(const o of nearby){const start=o[axis],extent=axis==='x'?o.l:o.w,gap=ctx.project.settings.gap; candidates.push(start,start+extent-size,start+extent+gap,start-size-gap);}
    const edge=candidates.filter(x=>x>=-.05&&x<=max-size+.05).sort((a,b)=>Math.abs(a-value)-Math.abs(b-value))[0];return Math.abs(edge-value)<=tolerance?edge:Math.round(value/step)*step;};
  return {...item,x:snapAxis(item.x,'x',d.l,ctx.bin.length),y:snapAxis(item.y,'y',d.w,ctx.bin.width)};
}
export function findManualSlot(project,mode,typeId){
  const ctx=manualContext(project,mode),t=ctx.types.find(t=>t.id===typeId);if(!t)return {error:'货物规格不存在'};if(t.effectiveHeight>ctx.bin.height+.05)return {error:heightMessage(project,mode,t)};
  const o=mode==='pallet'?project.pallet.overhang:0,gap=project.settings.gap;
  const work=workingSpace(project,mode);
  for(const rotation of t.allowRotate?[0,90]:[0]){const d=footprint(t,rotation),xs=new Set([0,o,ctx.bin.length-d.l]),ys=new Set([0,o,ctx.bin.width-d.w]),zs=new Set([0]);
    for(const a of ctx.objects){xs.add(a.x);xs.add(a.x+a.l+gap);xs.add(a.x-d.l-gap);ys.add(a.y);ys.add(a.y+a.w+gap);ys.add(a.y-d.w-gap);zs.add(a.z);zs.add(a.z+a.h);}
    xs.add(work.minX);xs.add(work.maxX-d.l);ys.add(work.minY);ys.add(work.maxY-d.w);
    let attempts=0;search:for(const z of [...zs].sort((a,b)=>a-b))for(const x of [...xs].sort((a,b)=>a-b))for(const y of [...ys].sort((a,b)=>a-b)){
      if(++attempts>20000)break search;const item={id:uid(),typeId,x,y,z,rotation,locked:false};if(previewManual(ctx,item).valid&&previewManual(ctx,item,{complete:true}).valid)return {item};
    }
  }
  return {error:'自动找位未找到符合约束的位置。可用「手动摆放」指定位置，预览会显示具体限制。'};
}
