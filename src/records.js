import {allTypes,clone} from './model.js';
import {analyze,consumption} from './engine.js';
export function planFingerprint(p){
  // Structural signature is for stale-record detection, not authentication.
  return JSON.stringify({container:p.container,types:allTypes(p),placements:p.placements,settings:p.settings});
}
export function checklistRows(p){
  const types=allTypes(p),counts={};for(const i of p.placements)counts[i.typeId]=(counts[i.typeId]||0)+1;
  return Object.entries(counts).map(([id,planned])=>{const t=types.find(t=>t.id===id),record=p.loadingRecord?.rows?.[id];const actual=record?.actual??null;return {id,name:t.name,kind:t.kind,planned,actual,weight:t.weight,pieces:t.kind==='pallet'?t.children.length:1,difference:actual===null?null:actual-planned,note:record?.note||''};});
}
export function saveChecklist(p,rows,details){
  const next=clone(p),expected=checklistRows(p),records={};
  for(const r of expected){const v=rows[r.id];if(v?.actual!==null&&(!Number.isInteger(v?.actual)||v.actual<0||v.actual>100000))throw Error('实装数量须为非负整数；未核对请留空');records[r.id]={actual:v?.actual??null,note:String(v?.note||'').slice(0,2000)};}
  next.loadingRecord={...next.loadingRecord,...details,rows:records,fingerprint:planFingerprint(p),updatedAt:new Date().toISOString(),finalizedAt:null};return next;
}
export function finalizeChecklist(p){
  if(!p.loadingRecord||p.loadingRecord.fingerprint!==planFingerprint(p))throw Error('装载方案已变化，请重新核对并保存');
  const rows=checklistRows(p);if(!rows.length||rows.some(r=>r.actual===null))throw Error('请完成所有实装数量核对');
  if(rows.some(r=>r.difference!==0&&!r.note.trim()))throw Error('有数量差异的行请填写原因');
  if(!p.loadingRecord.operator?.trim()||!p.loadingRecord.containerNo?.trim())throw Error('请填写核对人和柜号');
  const next=clone(p);next.loadingRecord.finalizedAt=new Date().toISOString();return next;
}
export function compareProjects(a,b){
  const ra=analyze(a),rb=analyze(b),fields=[['件数',ra.pieces,rb.pieces],['载货 kg',ra.weight,rb.weight],['利用率 %',ra.utilization*100,rb.utilization*100],['错误数',ra.issues.filter(i=>i.level==='error').length,rb.issues.filter(i=>i.level==='error').length]];
  const map=new Map(a.placements.map(i=>[i.id,i]));let added=0,moved=0;
  for(const i of b.placements){const old=map.get(i.id);if(!old)added++;else if(JSON.stringify(old)!==JSON.stringify(i))moved++;}
  return {fields,added,removed:a.placements.filter(i=>!b.placements.some(j=>j.id===i.id)).length,moved,configurationChanged:JSON.stringify([a.container,a.pallet,a.types,a.assemblies,a.templates,a.settings])!==JSON.stringify([b.container,b.pallet,b.types,b.assemblies,b.templates,b.settings])};
}
