import {uid,clone} from './model.js';

export const PALLET_DESIGN_PRESETS={
  block:{name:'田字 / 九块式木托',material:'wood',color:'#a9824f'},
  stringer:{name:'川字 / 梁式木托',material:'wood',color:'#a9824f'},
  nine:{name:'九脚塑料托',material:'plastic',color:'#3f7290'},
  plastic:{name:'网格塑料托',material:'plastic',color:'#477d68'},
  steel:{name:'钢制托盘',material:'steel',color:'#697579'},
};
const part=(kind,x,y,z,length,width,height,support=false)=>({id:uid(),kind,x,y,z,length,width,height,support});
const bars=(count,total,ratio)=>Array.from({length:count},(_,i)=>({start:(i+.5)*total/count-total*ratio/2/count,size:total*ratio/count}));

export function createPalletDesign(pallet,preset='block'){
  const L=pallet.length,W=pallet.width,H=pallet.baseHeight,meta=PALLET_DESIGN_PRESETS[preset]||PALLET_DESIGN_PRESETS.block,components=[];
  if(preset==='steel'){
    components.push(part('plate',0,0,H*.72,L,W,H*.28,true));
    for(const y of bars(3,W,.35))components.push(part('beam',0,y.start,0,L,y.size,H*.72));
  }else if(preset==='stringer'){
    for(const y of bars(7,W,.78))components.push(part('board',0,y.start,H*.78,L,y.size,H*.22,true));
    for(const y of bars(3,W,.28))components.push(part('beam',0,y.start,0,L,y.size,H*.78));
  }else if(preset==='nine'){
    for(const y of bars(6,W,.72))components.push(part('board',0,y.start,H*.78,L,y.size,H*.22,true));
    for(const x of [L*.1,L*.5,L*.9])for(const y of [W*.1,W*.5,W*.9])components.push(part('block',x-L*.07,y-W*.07,0,L*.14,W*.14,H*.78));
  }else if(preset==='plastic'){
    for(const y of bars(8,W,.7))components.push(part('board',0,y.start,H*.79,L,y.size,H*.21,true));
    for(const x of bars(6,L,.55))components.push(part('rib',x.start,0,H*.64,x.size,W,H*.15));
    for(const y of bars(3,W,.25))components.push(part('beam',0,y.start,0,L,y.size,H*.64));
  }else{
    for(const y of bars(5,W,.75))components.push(part('board',0,y.start,H*.8,L,y.size,H*.2,true));
    for(const x of [L*.1,L*.5,L*.9])for(const y of [W*.1,W*.5,W*.9])components.push(part('block',x-L*.065,y-W*.075,H*.22,L*.13,W*.15,H*.58));
    for(const x of bars(3,L,.46))components.push(part('runner',x.start,0,0,x.size,W,H*.22));
  }
  return {version:1,preset,name:meta.name,material:meta.material,color:meta.color,secondaryColor:meta.material==='steel'?'#aeb6b8':'#795932',logoText:'',components};
}

export function ensurePalletDesign(pallet){return pallet.design?clone(pallet.design):createPalletDesign(pallet,'block');}
export function resizePalletDesign(design,from,to){
  const d=clone(design),sx=to.length/from.length,sy=to.width/from.width,sz=to.baseHeight/from.baseHeight;
  for(const c of d.components){c.x*=sx;c.length*=sx;c.y*=sy;c.width*=sy;c.z*=sz;c.height*=sz;}
  return d;
}
export function palletComponents(pallet){return pallet.design?.components?.length?pallet.design.components:createPalletDesign(pallet,'block').components;}
export function palletSupportPolygons(pallet){
  if(!pallet.design?.components?.length)return null;
  const o=pallet.overhang||0,H=pallet.baseHeight;
  return pallet.design.components.filter(c=>c.support&&Math.abs(c.z+c.height-H)<.1).map(c=>[[o+c.x,o+c.y],[o+c.x+c.length,o+c.y],[o+c.x+c.length,o+c.y+c.width],[o+c.x,o+c.y+c.width]]);
}
export function validatePalletDesign(pallet,design){
  if(!design||design.version!==1||!Object.hasOwn(PALLET_DESIGN_PRESETS,design.preset)&&design.preset!=='custom')throw Error('托盘设计版本或类型无效');
  if(!['wood','plastic','steel'].includes(design.material)||!/^#[0-9a-f]{6}$/i.test(design.color)||!/^#[0-9a-f]{6}$/i.test(design.secondaryColor))throw Error('托盘材质或颜色无效');
  if(typeof design.logoText!=='string'||design.logoText.length>80||!Array.isArray(design.components)||!design.components.length||design.components.length>120)throw Error('托盘标识或零件数量无效');
  const ids=new Set();
  for(const c of design.components){
    if(!c||typeof c.id!=='string'||ids.has(c.id)||!['board','beam','block','runner','rib','plate'].includes(c.kind))throw Error('托盘零件类型或编号无效');ids.add(c.id);
    for(const k of ['x','y','z'])if(!Number.isFinite(c[k])||c[k]<0)throw Error('托盘零件坐标须为非负数');
    for(const k of ['length','width','height'])if(!Number.isFinite(c[k])||c[k]<=0)throw Error('托盘零件尺寸须大于 0');
    if(c.x+c.length>pallet.length+.05||c.y+c.width>pallet.width+.05||c.z+c.height>pallet.baseHeight+.05)throw Error('托盘零件超出托盘长宽高边界');
    if(typeof c.support!=='boolean')throw Error('托盘承重面标记无效');
    if(c.support&&Math.abs(c.z+c.height-pallet.baseHeight)>.1)throw Error('承重零件顶面必须与托盘顶面齐平');
  }
  if(!design.components.some(c=>c.support))throw Error('至少需要一个顶面承重零件');
  return design;
}
