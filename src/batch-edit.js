import {allTypes, binFor, clone, uid, validateProject} from './model.js';
import {analyze, physical, footprint, shape} from './engine.js';

export const workspaceItems=(p,mode)=>mode==='pallet'?p.palletPlacements:p.placements;
export function selectionBounds(p,mode,ids){
  const objects=physical(p,mode).filter(o=>ids.includes(o.item.id));
  if(!objects.length)throw Error('请先选中货物');
  const out={};
  for(const [axis,size] of [['x','l'],['y','w'],['z','h']]){
    out[axis]=Math.min(...objects.map(o=>o[axis]));
    out[size]=Math.max(...objects.map(o=>o[axis]+o[size]))-out[axis];
  }
  return out;
}
export function rotateGroup(items,types,degrees,pivot){
  const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return items.map(i=>{
    const t=types.find(t=>t.id===i.typeId),d=footprint(t,i.rotation),rotation=((i.rotation+degrees)%360+360)%360,next=footprint(t,rotation);
    if(!t.allowRotate&&Math.abs(degrees%360)>.05)throw Error(`${t.name} 不允许旋转`);
    const x=i.x+d.l/2-pivot.x,y=i.y+d.w/2-pivot.y;
    return {...i,rotation,x:pivot.x+x*c-y*s-next.l/2,y:pivot.y+x*s+y*c-next.w/2};
  });
}
// Validate a complete proposed layout. No caller-owned objects are mutated.
export function validateBatch(p,mode,next,{allowOverlap=false,changedIds=[],doorCheck}={}){
  const cp=clone(p);cp[mode==='pallet'?'palletPlacements':'placements']=next;
  validateProject(cp);
  const before=analyze(p,mode,undefined,{skipOrder:true}),after=analyze(cp,mode,undefined,{skipOrder:true});
  const key=i=>i.code+':'+[...i.ids].sort().join(',')+':'+i.text;
  const prior=new Set(before.issues.filter(i=>i.level==='error').map(key));
  const error=after.issues.find(i=>i.level==='error'&&!(allowOverlap&&i.code==='collision')&&(!prior.has(key(i))||i.ids.some(id=>changedIds.includes(id))));
  if(error)throw Error(error.text);
  if(doorCheck)for(const i of next.filter(i=>changedIds.includes(i.id))){const reason=doorCheck(i,allTypes(cp).find(t=>t.id===i.typeId));if(reason)throw Error(reason);}
  return next;
}
export function batchEdit(p,mode,ids,operation,options={}){
  const original=workspaceItems(p,mode),selected=original.filter(i=>ids.includes(i.id)),types=allTypes(p);
  if(!selected.length)throw Error('请先选中货物');
  if(!['copy-layer','copy','lock','unlock'].includes(operation.kind)&&selected.some(i=>i.locked))throw Error('选中组包含锁定货物，请先解锁整组');
  const bounds=selectionBounds(p,mode,ids),bin=binFor(p,mode);
  let result=clone(selected),copies=false;
  const number=(v,name)=>{if(!Number.isFinite(v)||Math.abs(v)>1e8)throw Error(name+' 必须为有效数字');return v;};
  switch(operation.kind){
    case 'move':case 'copy':
      result=result.map(i=>({...i,x:i.x+number(operation.x??0,'X'),y:i.y+number(operation.y??0,'Y'),z:i.z+number(operation.z??0,'Z')}));
      copies=operation.kind==='copy';break;
    case 'rotate':result=rotateGroup(result,types,number(operation.angle??90,'角度'),{x:bounds.x+bounds.l/2,y:bounds.y+bounds.w/2});break;
    case 'align':{
      const axis=operation.axis,size=axis==='x'?'l':'w';if(!['x','y'].includes(axis))throw Error('对齐轴错误');
      const end=operation.edge==='end',middle=operation.edge==='center';
      result=result.map(i=>({...i,[axis]:bounds[axis]+(middle?(bounds[size]-footprint(types.find(t=>t.id===i.typeId),i.rotation)[size])/2:end?bounds[size]-footprint(types.find(t=>t.id===i.typeId),i.rotation)[size]:0)}));break;
    }
    case 'center':case 'edge':{
      const axis=operation.axis,size=axis==='x'?'l':'w',extent=axis==='x'?bin.length:bin.width;
      if(!['x','y'].includes(axis))throw Error('对齐轴错误');
      const delta=(operation.kind==='center'?(extent-bounds[size])/2:operation.end?extent-bounds[size]:0)-bounds[axis];
      result=result.map(i=>({...i,[axis]:i[axis]+delta}));break;
    }
    case 'distribute':case 'adjacent':{
      const axis=operation.axis,size=axis==='x'?'l':'w';if(!['x','y'].includes(axis))throw Error('排列轴错误');
      if(result.length<2)throw Error('至少选择两件');
      result.sort((a,b)=>a[axis]-b[axis]);
      const total=result.reduce((s,i)=>s+footprint(types.find(t=>t.id===i.typeId),i.rotation)[size],0);
      const gap=operation.kind==='adjacent'?number(operation.gap??p.settings.gap,'间距'):(bounds[size]-total)/(result.length-1);
      if(gap<-.05)throw Error('现有跨度不足以等距排列，请扩大范围');
      let cursor=bounds[axis];result=result.map(i=>{const next={...i,[axis]:cursor};cursor+=footprint(types.find(t=>t.id===i.typeId),i.rotation)[size]+gap;return next;});break;
    }
    case 'copy-layer':{
      if(Math.max(...selected.map(i=>i.z))-Math.min(...selected.map(i=>i.z))>.05)throw Error('整层复制要求源货物底部位于同一高度');
      const count=operation.count??1;if(!Number.isInteger(count)||count<1||count>100)throw Error('新增层数须为 1–100 的整数');
      const step=number(operation.step??bounds.h,'层高');if(step<bounds.h-.05)throw Error('层高不能小于源层货物高度');
      if(selected.length*count+original.length>5000)throw Error('超过 5000 个装载单元');
      result=[];
      for(let layer=1;layer<=count;layer++){
        let layerItems=clone(selected);
        if(operation.alternate&&layer%2)layerItems=rotateGroup(layerItems,types,90,{x:bounds.x+bounds.l/2,y:bounds.y+bounds.w/2});
        result.push(...layerItems.map(i=>({...i,z:i.z+step*layer})));
      }
      copies=true;break;
    }
    case 'delete':result=[];break;
    case 'lock':case 'unlock':result=result.map(i=>({...i,locked:operation.kind==='lock'}));break;
    default:throw Error('未知批量操作');
  }
  if(copies)result=result.map(i=>({...i,id:uid(),locked:false}));
  const next=[...original.filter(i=>copies||!ids.includes(i.id)),...result],changedIds=result.map(i=>i.id);
  if(!['lock','unlock'].includes(operation.kind))validateBatch(p,mode,next,{...options,changedIds});
  return {items:next,ids:changedIds};
}

export function selectionGaps(p,mode,ids){
  const b=selectionBounds(p,mode,ids),bin=binFor(p,mode),out={start:b.x,door:bin.length-b.x-b.l,left:b.y,right:bin.width-b.y-b.w,top:bin.height-b.z-b.h};
  const others=physical(p,mode).filter(o=>!ids.includes(o.item.id));
  let nearest=Infinity;
  for(const a of physical(p,mode).filter(o=>ids.includes(o.item.id)))for(const o of others){
    if(Math.min(a.z+a.h,o.z+o.h)<=Math.max(a.z,o.z)+.05)continue;
    const dx=Math.max(0,o.x-a.x-a.l,a.x-o.x-o.l),dy=Math.max(0,o.y-a.y-a.w,a.y-o.y-o.w);
    nearest=Math.min(nearest,Math.hypot(dx,dy));
  }
  return {...out,nearest:Number.isFinite(nearest)?nearest:null};
}
