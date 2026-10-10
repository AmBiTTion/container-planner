import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,cargo,CONTAINERS,uid,clone} from '../src/model.js';
import {rowCandidate,optimize,analyze,physical,remainingReason,AUTO_UNIT_LIMIT} from '../src/engine.js';
import {freeSpaces} from '../src/free-space.js';
import {renderReport} from '../src/report-html.js';
function fixture(){const p=emptyProject();p.container={...CONTAINERS['40HC'],preset:'40HC'};p.types=[cargo({name:'Newspaper cat litter',kind:'soft',length:600,width:400,height:150,effectiveLength:500,effectiveWidth:400,effectiveHeight:152,weight:10.8,quantity:2520,maxLayers:50,maxLoad:400,mustLoad:true})];p.settings.depth='fast';return p;}
test('2520 bag regression: automatic generic packing passes 1500 and mixed rows achieve 2346',()=>{
  const p=fixture(),before=clone(p),r=optimize(p);
  assert.equal(r.candidates[0].items.length,2346);assert(r.candidates.some(c=>c.strategy!== 'rows'&&c.items.length>1500));
  assert.deepEqual(p,before);for(const c of r.candidates)assert(c.report.valid);
  assert.equal(new Set(r.candidates[0].items.map(i=>i.rotation)).size,2);
  assert(Math.abs(r.candidates[0].report.weight-25336.8)<.001);
});
test('rotation permission and aligned layer count are respected',()=>{
  const p=fixture();p.types[0].allowRotate=false;const r=rowCandidate(p);assert.equal(r.items.length,2040);assert(r.items.every(i=>i.rotation===0));
  p.types[0].allowRotate=true;p.types[0].maxLayers=2;assert.equal(rowCandidate(p).items.length,276);
  p.types[0].maxLoad=0;assert.equal(rowCandidate(p).items.length,138);
});
test('row candidates obey mass, quantity, gaps, clearances and pallet rules',()=>{
  const p=fixture();p.container.maxWeight=1000;const r=rowCandidate(p);assert.equal(r.items.length,92);assert(r.report.valid);
  p.container.maxWeight=26500;p.types[0].quantity=7;assert.equal(rowCandidate(p).items.length,7);
  p.types[0].quantity=2520;p.settings.gap=5;p.settings.operations={front:100,door:100,side:20,top:30};assert(rowCandidate(p).report.valid);
  p.settings.gap=0;p.settings.operations=undefined;p.pallet.height=150+152*2;assert(rowCandidate(p,'pallet').report.valid);
});
test('row shortcut never moves locked layouts or bypasses regional limits',()=>{
  const p=fixture();p.placements=[{id:uid(),typeId:p.types[0].id,x:0,y:0,z:0,rotation:0,locked:true}];assert.equal(rowCandidate(p),null);
  p.placements=[];p.settings.operations={limits:{front:1}};assert.equal(rowCandidate(p),null);
});
test('5000 unit cap is explicit and never emits an invalid oversized project',()=>{
  const p=fixture();Object.assign(p.types[0],{effectiveLength:100,effectiveWidth:100,effectiveHeight:100,weight:1,quantity:10000,maxLoad:10000});
  const r=rowCandidate(p);assert.equal(r.items.length,AUTO_UNIT_LIMIT);assert.equal(r.termination,'unit-limit');assert(r.limited);assert(r.report.valid);
});
test('free boxes account for exact remaining orthogonal volume and cannot overlap cargo',()=>{
  const p=fixture(),r=rowCandidate(p);p.placements=r.items;const s=freeSpaces(p,'container',r.report);
  assert.equal(s.regions.length,3);assert(s.regions.some(a=>Math.abs(a.h-114)<.01));assert(s.regions.some(a=>Math.abs(a.w-52)<.01));
  const b=p.container,free=b.length*b.width*b.height-r.report.volume;
  assert(Math.abs(s.regions.reduce((v,a)=>v+a.volume,0)-free)<1);
  for(const a of s.regions)for(const c of physical(p))assert(!(Math.min(a.x+a.l,c.x+c.l)-Math.max(a.x,c.x)>.05&&Math.min(a.y+a.w,c.y+c.w)-Math.max(a.y,c.y)>.05&&Math.min(a.z+a.h,c.z+c.h)-Math.max(a.z,c.z)>.05));
  assert(s.regions.every(a=>a.short==='余隙尺寸不足'));
});
test('large fit-sized holes are hints, not unsupported placement promises; complete stock is explicit',()=>{
  const p=fixture();let r=analyze(p),s=freeSpaces(p,'container',r);assert.match(s.regions[0].reason,/尺寸可容纳/);assert.match(s.regions[0].reason,/检查/);
  p.types[0].quantity=0;r=analyze(p);assert.match(freeSpaces(p,'container',r).regions[0].reason,/全部装入/);
});
test('unloaded diagnostics quantify payload, layers, disabled rotation and English reports',()=>{
  const p=fixture();const r=analyze(p);assert.match(remainingReason(p,p.types[0],r),/2453/);
  p.types[0].allowRotate=false;assert.match(remainingReason(p,p.types[0],r),/转向已关闭/);
  p.types[0].auto=false;assert.match(remainingReason(p,p.types[0],r),/关闭参与/);p.types[0].auto=true;
  p.name='Packing QA';const html=renderReport(p,'container',null,'en');assert.match(html,/2453/);assert.match(html,/Horizontal rotation is disabled/);assert(!/[\u4e00-\u9fff]/.test(html));
});
