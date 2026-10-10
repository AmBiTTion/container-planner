import {clone,uid,validateProject} from './model.js';
import {makeAssembly,analyze} from './engine.js';
export function beginAssemblyEdit(project,itemId){
  if(project.assemblyEdit)throw Error('请先完成或取消当前整托编辑');
  const p=clone(project),item=p.placements.find(i=>i.id===itemId),t=p.assemblies.find(t=>t.id===item?.typeId);
  if(!t)throw Error('请在集装箱中选中一托');
  p.assemblyEdit={itemId,typeId:t.id,pallet:clone(p.pallet),placements:clone(p.palletPlacements),activeTemplate:p.activeTemplate};
  p.pallet={length:t.deckLength,width:t.deckWidth,baseHeight:t.baseHeight,height:Math.max(t.height,p.pallet.height),tare:t.tare,overhang:t.overhang,maxWeight:t.payloadLimit??1e8,preset:'编辑整托'};
  p.palletPlacements=clone(t.children).map(i=>({...i,locked:false}));p.activeTemplate=t.templateId??null;return p;
}
export function finishAssemblyEdit(project,scope='cancel'){
  const p=clone(project),s=p.assemblyEdit;if(!s)throw Error('没有正在编辑的整托');
  if(!['cancel','one','all'].includes(scope))throw Error('应用范围无效');
  const original=p.assemblies.find(t=>t.id===s.typeId),target=p.placements.find(i=>i.id===s.itemId);
  if(scope!=='cancel'){
    if(!original||!target)throw Error('原整托已不存在，请取消编辑');
    const next={...original,...makeAssembly(p,original.name),id:scope==='one'?uid():original.id,quantity:scope==='one'?1:original.quantity};
    for(const k of ['maxLayers','maxLoad','allowRotate','mustLoad','priority','unload','auto','batch','color'])next[k]=original[k];
    if(scope==='one'){next.name=original.name+' · 单托调整';p.assemblies.push(next);target.typeId=next.id;}else p.assemblies[p.assemblies.indexOf(original)]=next;
  }
  p.pallet=s.pallet;p.palletPlacements=s.placements;p.activeTemplate=s.activeTemplate;delete p.assemblyEdit;validateProject(p);
  if(scope!=='cancel'){
    const before=new Set(analyze(project).issues.filter(i=>i.level==='error').map(i=>i.code+':'+i.ids.join(',')+':'+i.text));
    const issue=analyze(p).issues.find(i=>i.level==='error'&&!before.has(i.code+':'+i.ids.join(',')+':'+i.text));
    if(issue)throw Error('应用后装柜校验不通过：'+issue.text+'。原整托保持不变，请继续调整。');
  }return p;
}
