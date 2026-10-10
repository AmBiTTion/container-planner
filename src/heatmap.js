const clamp=n=>Math.max(0,Math.min(1,n));
const hexToRgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
const rgbToHex=a=>'#'+a.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const mix=(a,b,t)=>rgbToHex(hexToRgb(a).map((v,i)=>v+(hexToRgb(b)[i]-v)*clamp(t)));
export const HEATMAPS={off:'关闭热力图',weight:'单件重量',bearing:'下层承压',support:'底部支撑',risk:'综合风险'};
export function heatColor(mode,item,type,report,types){
  if(mode==='off'||!mode)return type.color;
  const error=report.issues.some(issue=>issue.level==='error'&&issue.ids.includes(item.id));
  const maxWeight=Math.max(1,...types.map(t=>t.weight||0));
  const load=report.loads[item.id]||0,bearing=type.maxLoad>0?load/type.maxLoad:load>0?1:0;
  const support=report.supports?.[item.id]?.ratio??1,supportRisk=clamp((1-support)/Math.max(.01,1-(report.minSupport??.8)));
  let value=0,palette=['#3d8bc4','#f0cc55','#c74f43'];
  if(mode==='weight'){value=type.weight/maxWeight;palette=['#5aa7d7','#efcf58','#c34d43'];}
  if(mode==='bearing')value=bearing;
  if(mode==='support')value=supportRisk;
  if(mode==='risk')value=Math.max(error?1:0,bearing,supportRisk);
  return value<.5?mix(palette[0],palette[1],value*2):mix(palette[1],palette[2],(value-.5)*2);
}
export function heatSummary(mode,report,types){
  if(mode==='weight')return `蓝色较轻，红色较重；本方案最重单元 ${Math.max(0,...types.map(t=>t.weight||0)).toFixed(1)} kg。`;
  if(mode==='bearing')return '颜色表示当前上方负载 ÷ 规格允许上方负载；红色接近或超过限制。';
  if(mode==='support')return '蓝色支撑完整，黄色或红色表示底部有效接触面积降低。';
  if(mode==='risk')return `综合碰撞、规则错误、支撑和承重比例；当前 ${report.issues.filter(i=>i.level==='error').length} 项错误。`;
  return '';
}
