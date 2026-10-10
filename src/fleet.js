import {clone,CONTAINERS,allTypes} from './model.js';
import {optimize,usedCounts,analyze} from './engine.js';
import {applyBagScenario} from './operations.js';
export function allocateFleet(project,schedule,{maxContainers=10,prices={},budgetMs=90000}={},progress){
  if(!Array.isArray(schedule)||!schedule.length||schedule.length>100||schedule.some(k=>!Object.hasOwn(CONTAINERS,k)))throw Error('请选择有效柜型');
  if(!Number.isInteger(maxContainers)||maxContainers<1||maxContainers>20)throw Error('每组最多计算 1–20 个柜');
  for(const value of Object.values(prices))if(!Number.isFinite(value)||value<0)throw Error('参考运费须为非负数');
  const start=Date.now(),p=clone(project),consumed={},containers=[];
  p.placements=[];delete p.fleet;delete p.loadingRecord;
  for(let index=0;index<maxContainers;index++){
    if(Date.now()-start>=budgetMs)break;
    const key=schedule[Math.min(index,schedule.length-1)];p.container={...CONTAINERS[key],preset:key,skin:project.container.skin||'classic',...(project.container.skinColor?{skinColor:project.container.skinColor}:{})};
    for(const t of allTypes(p))t.quantity=Math.max(0,allTypes(project).find(a=>a.id===t.id).quantity-(consumed[t.id]||0));
    if(!allTypes(p).some(t=>t.quantity>0&&t.auto!==false&&!t.isBase))break;
    progress?.({container:index+1,preset:key});
    const result=optimize(p,'container'),best=result.candidates?.find(c=>c.report.valid);
    if(!best?.items.length)break;
    const used=usedCounts(best.items,allTypes(p));for(const [id,n] of Object.entries(used))consumed[id]=(consumed[id]||0)+n;
    containers.push({container:clone(p.container),items:best.items,pieces:best.report.pieces,weight:best.report.weight,utilization:best.report.utilization,cost:prices[key]??null,limited:best.limited});
  }
  const remaining=project.types.filter(t=>!t.isBase&&t.auto!==false).map(t=>({id:t.id,name:t.name,count:Math.max(0,t.quantity-(consumed[t.id]||0))})).filter(t=>t.count>0);
  return {schedule,containers,consumed,remaining,complete:!remaining.length,cost:containers.every(c=>c.cost!==null)?containers.reduce((s,c)=>s+c.cost,0):null,limited:Date.now()-start>=budgetMs||containers.some(c=>c.limited),createdAt:new Date().toISOString()};
}
export function compareBagPlans(project,mode,progress){
  return ['ideal','conservative'].map(scenario=>{progress?.({scenario});const p=applyBagScenario(project,scenario);p[mode==='pallet'?'palletPlacements':'placements']=[];const result=optimize(p,mode);return {scenario,project:p,candidate:result.candidates?.find(c=>c.report.valid)||null,error:result.error};});
}
