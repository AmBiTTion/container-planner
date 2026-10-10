import {physical,shape,collides,loadingSequence,overlaps2D} from './engine.js';
export function checkPaths(p,params){
  for(const k of ['equipmentLength','equipmentWidth','equipmentHeight','clearance','lift','channelWidth','approachLength'])if(!Number.isFinite(params[k])||params[k]<0||params[k]>100000)throw Error('请明确填写有效设备与通道参数（mm）');
  if(params.channelWidth<=0||params.approachLength<=0)throw Error('通道宽度和柜外进退空间必须大于 0');
  const objects=physical(p),b=p.container,unload=params.direction==='unload';
  const sequence=unload?[...objects].sort((a,c)=>a.t.unload-c.t.unload||c.x-a.x||c.z-a.z).map(o=>o.item):loadingSequence(p);
  const placed=unload?[...objects]:[],results=[];
  const box=(x,y,z,l,w,h)=>({x,y,z,l,w,h,polygon:[[x,y],[x+l,y],[x+l,y+w],[x,y+w]]});
  for(const item of sequence){
    const a=objects.find(o=>o.item.id===item.id),w=Math.max(a.w,params.equipmentWidth)+2*params.clearance,cy=a.y+a.w/2,doorLow=(b.width-b.doorWidth)/2;
    const reasons=[],blockers=new Set(),active=placed.filter(o=>o.item.id!==item.id);
    if(a.x<-.05||a.y<-.05||a.z<-.05||a.x+a.l>b.length+.05||a.y+a.w>b.width+.05||a.z+a.h>b.height+.05)reasons.push('目标位置超出柜内边界');
    if(w>params.channelWidth+.05)reasons.push('货物/设备包络宽度超过声明通道');
    if(cy-w/2<doorLow-.05||cy+w/2>doorLow+b.doorWidth+.05)reasons.push('直线行进时无法通过居中门洞（需横移或改位）');
    if(Math.max(a.z+a.h+params.lift,params.equipmentHeight)+params.clearance>b.doorHeight+.05)reasons.push('货物抬升或设备高度超过门洞');
    if(a.l+params.equipmentLength+params.clearance>params.approachLength+.05)reasons.push('声明柜外直线进退空间不足');
    const cargoSweep=box(a.x,a.y-params.clearance,a.z+params.lift,b.length-a.x+params.approachLength,a.w+2*params.clearance,a.h+params.clearance);
    const lowering=box(a.x,a.y,a.z,a.l,a.w,a.h+params.lift);
    const equipmentSweep=box(a.x+a.l+params.clearance,cy-params.equipmentWidth/2-params.clearance,0,Math.max(0,b.length-a.x-a.l)+params.equipmentLength,params.equipmentWidth+2*params.clearance,params.equipmentHeight);
    for(const other of active)if(collides(cargoSweep,other)||collides(lowering,other)||(params.equipmentLength>0&&params.equipmentWidth>0&&params.equipmentHeight>0&&collides(equipmentSweep,other)))blockers.add(other.item.id);
    if(unload&&active.some(o=>Math.abs(o.z-a.z-a.h)<.05&&overlaps2D(a,o)))reasons.push('仍支撑上方货物，须先卸上层');
    if(blockers.size)reasons.push(`路径与 ${blockers.size} 件已在柜内的货物包络相交`);
    const valid=!reasons.length;results.push({id:item.id,name:a.t.name,valid,reasons,blockers:[...blockers],sweep:cargoSweep});
    if(valid){if(unload)placed.splice(placed.findIndex(o=>o.item.id===item.id),1);else placed.push(a);}
    else break; // Later steps depend on completing this movement; do not label them passed.
  }
  return {results,total:sequence.length,complete:results.length===sequence.length&&results.every(r=>r.valid),untested:sequence.length-results.length,params,checkedAt:new Date().toISOString()};
}
