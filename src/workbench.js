import {clone,uid,validateProject,allTypes} from './model.js';
import {analyze} from './engine.js';
import {compareProjects,checklistRows,saveChecklist,finalizeChecklist,planFingerprint} from './records.js';
import {download} from './report.js';
import {importDialog} from './import-ui.js';

export async function recordRequest(projectId,route,value){
  const response=await fetch(`/api/records/${encodeURIComponent(projectId)}/${route}`,value===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'本地记录访问失败');return result;
}
export async function uploadAsset(projectId,file){
  if(file.size>6*1024*1024)throw Error('每个附件最多 6MB');
  const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('无法读取附件'));r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(file);});
  return recordRequest(projectId,'assets',{name:file.name,base64});
}
export function assetURL(a){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(a.projectId)||!/^[a-zA-Z0-9_-]{1,100}$/.test(a.id))throw Error('附件引用无效');
  return `/api/records/${a.projectId}/assets/${a.id}`;
}
export class Workbench{
  constructor(api){this.a=api;this.results=null;this.running=null;}
  home(){const {dialog,button}=this.a;dialog('作业工具',`<p class="dialog-intro">先做方案，再做现场核对。命名版本和附件独立保存在本机 data/records；JSON 方案备份不包含附件文件，请同时备份 data 文件夹。</p><div class="workbench-grid">${[['operations','现场余量 / 区域重量'],['bag-tolerance','袋子容差设置'],['compare-bags','比较理想 / 保守装量'],['cargo-import','Excel 批量导入'],['fleet-dialog','多柜分配 / 运费比较'],['fleet-last','查看已保存的分柜结果'],['versions','版本历史 / 对比恢复'],['checklist','现场装柜核对'],['path-dialog','几何装卸路径检查']].map(([k,l])=>button(k,l)).join('')}</div>`,null);}
  async versions(){
    const {get,dialog,button,esc,txt}=this.a,p=get(),versions=await recordRequest(p.id,'versions');
    dialog('命名版本与恢复',`<p class="dialog-intro">命名版本独立保存，不受撤销次数限制。恢复前自动保存当前版本。比较以集装箱布局为主，并标记配置变化。</p>${txt('versionName','新版本名称','装柜调整 '+new Date().toLocaleString('zh-CN'))}${button('version-create','保存命名版本')}<div class="stack">${versions.map(v=>`<div class="note-card"><strong>${esc(v.name)}</strong><p>${esc(v.createdAt)}</p><div class="row">${button('version-compare','与当前比较','','',`data-id="${v.id}"`)}${button('version-restore','恢复此版本','','',`data-id="${v.id}"`)}</div></div>`).join('')||'<p>尚无命名版本</p>'}</div>`,null);
  }
  async createVersion(){const name=document.querySelector('[name="versionName"]').value;await recordRequest(this.a.get().id,'versions',{name,project:clone(this.a.get())});await this.versions();}
  async version(id,restore){
    const {get,dialog,esc,replace,close}=this.a,p=get(),v=await recordRequest(p.id,'versions/'+id),c=compareProjects(v.project,p);
    const content=`<p>历史版本：${esc(v.name)}</p><div class="table-scroll"><table><thead><tr><th>指标</th><th>历史版本</th><th>当前</th></tr></thead><tbody>${c.fields.map(([n,a,b])=>`<tr><td>${n}</td><td>${a.toFixed(2)}</td><td>${b.toFixed(2)}</td></tr>`).join('')}</tbody></table></div><p>相对历史：新增 ${c.added} / 删除 ${c.removed} / 调整 ${c.moved} 个；配置${c.configurationChanged?'有变化':'未变化'}。</p>`;
    dialog(restore?'确认恢复版本':'版本对比',content+(restore?'<p>当前内容将先留存为“恢复前自动备份”，然后切换到所选版本。</p>':''),restore?async()=>{
      await recordRequest(p.id,'versions',{name:'恢复前自动备份 '+new Date().toLocaleString('zh-CN'),project:clone(get())});replace(validateProject(clone(v.project)));close();
    }:null,'备份当前并恢复');
  }
  checklist(){
    const {get,dialog,button,esc,txt}=this.a,p=get(),r=p.loadingRecord||{},rows=checklistRows(p);
    dialog('现场装柜核对',`<p class="dialog-intro">按装载单元核对：整托填实装托数，散货填件数。空白 = 未核对，0 = 确认未装。计划变更后须重新核对。</p>${r.fingerprint&&r.fingerprint!==planFingerprint(p)?'<p class="danger">方案已变化，旧记录已过期，请重新核对。</p>':''}<div class="fields">${txt('operator','核对人',r.operator)}${txt('containerNo','柜号',r.containerNo)}${txt('sealNo','封条号',r.sealNo)}</div><div class="table-scroll"><table><thead><tr><th>货物 / 单位</th><th>计划</th><th>实装</th><th>差异说明</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(r.name)}（${r.kind==='pallet'?'托':'件'}）</td><td>${r.planned}</td><td><input aria-label="实装 ${esc(r.name)}" name="actual${i}" type="number" min="0" max="100000" step="1" value="${r.actual??''}"></td><td><input name="note${i}" maxlength="2000" value="${esc(r.note)}"></td></tr>`).join('')}</tbody></table></div><label>装柜备注<textarea name="loadingNotes" maxlength="10000">${esc(r.notes||'')}</textarea></label><label>添加现场照片（PNG / JPG / WebP，每张最多 6MB）<input id="loading-photos" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><div>${(r.photos||[]).map(a=>`<a href="${assetURL(a)}" download>${esc(a.name)}</a>`).join(' · ')}</div><div class="row wrap">${button('checklist-finalize','确认完成核对')}${button('checklist-export','下载装柜记录 HTML')}</div><p>${r.finalizedAt?'已完成核对：'+esc(r.finalizedAt):'未完成；先保存数量和照片，再确认完成。'}</p>`,async v=>{
      const source=clone(get()),photos=[...(source.loadingRecord?.photos||[])],files=[...document.querySelector('#loading-photos').files];if(photos.length+files.length>30)throw Error('每份记录最多 30 张照片');
      for(const f of files){if(!/^image\/(png|jpeg|webp)$/.test(f.type))throw Error('现场照片只支持 PNG/JPG/WebP');photos.push(await uploadAsset(source.id,f));}
      const data=Object.fromEntries(rows.map((r,i)=>[r.id,{actual:v['actual'+i]===''?null:+v['actual'+i],note:v['note'+i]}]));
      this.a.replace(saveChecklist(source,data,{operator:v.operator,containerNo:v.containerNo,sealNo:v.sealNo,notes:v.loadingNotes,photos}));this.checklist();
    },'保存核对与照片');
  }
  async exportChecklist(){
    const {get,esc}=this.a,p=get(),r=p.loadingRecord;if(!r)throw Error('请先保存核对记录');
    const rows=checklistRows(p),stale=r.fingerprint!==planFingerprint(p),photos=[];
    for(const a of r.photos||[]){const response=await fetch(assetURL(a));if(!response.ok)throw Error('无法读取照片：'+a.name);const blob=await response.blob();const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});if(!/^data:image\/(png|jpeg|webp);base64,/.test(data))throw Error('照片格式无效');photos.push(`<figure><img src="${data}"><figcaption>${esc(a.name)}</figcaption></figure>`);}
    const actualWeight=rows.reduce((s,row)=>s+(row.actual??0)*row.weight,0),unknown=rows.some(r=>r.actual===null);
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>现场装柜记录</title><style>body{font:15px sans-serif;margin:32px;color:#203529}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:10px;text-align:left}img{max-width:100%;max-height:550px}figure{break-inside:avoid}.warning{color:#b34228}</style><h1>${esc(p.name)} · 现场装柜记录</h1><p class="warning">${stale?'方案已变更，记录过期':r.finalizedAt?'已完成人工数量核对':'草稿，尚未完成核对'}。数量核对不替代实物称重和安全验收。</p><p>柜号 ${esc(r.containerNo)} / 封条 ${esc(r.sealNo)} / 核对人 ${esc(r.operator)}</p><p>保存 ${esc(r.updatedAt)} / 完成 ${esc(r.finalizedAt||'未完成')}</p><table><tr><th>货物</th><th>计划</th><th>实装</th><th>差异</th><th>说明</th></tr>${rows.map(r=>`<tr><td>${esc(r.name)}（${r.kind==='pallet'?'托':'件'}）</td><td>${r.planned}</td><td>${r.actual??'未核对'}</td><td>${r.difference??'未核对'}</td><td>${esc(r.note)}</td></tr>`).join('')}</table><p>${unknown?'已核对部分':'实装'}估算载货重量 ${actualWeight.toFixed(1)} kg，含柜自重 ${(actualWeight+p.container.tare).toFixed(1)} kg。</p><p>${esc(r.notes||'')}</p>${photos.join('')}</html>`;
    download(html,p.name+'-现场装柜记录.html','text/html');
  }
  fleetDialog(){const {get,dialog,num,txt,select}=this.a;dialog('多柜分配与参考运费',`<p class="dialog-intro">从全部可自动装载库存重新分柜，不沿用当前摆放和锁定位置，原方案保留。逐柜扣减散货和托内库存。柜外费用、税费不含；未填单柜运费则不估价。启发式比较不保证全局最少柜数。</p>${select('strategy','比較柜型','all',[['all','分别比较 20GP / 40GP / 40HC'],['mixed','自定义混合柜型序列']])}${txt('schedule','混合顺序，逗号分隔；最后一种重复','40HC,20GP')}${num('maxContainers','每组最多柜数',5,1,1)}<div class="fields three">${['20GP','40GP','40HC'].map(k=>`<label>${k} 单柜参考运费<input type="number" name="price${k}" min="0" step="any" placeholder="未填写"></label>`).join('')}</div>${txt('currency','运费币种','CNY')}`,v=>{
      const schedules=v.strategy==='all'?[['20GP'],['40GP'],['40HC']]:[v.schedule.split(/[,，]/).map(s=>s.trim()).filter(Boolean)],prices={};for(const k of ['20GP','40GP','40HC'])if(v['price'+k]!=='')prices[k]=+v['price'+k];
      this.run({kind:'fleet',schedules,options:{maxContainers:+v.maxContainers,prices}},result=>{const source=clone(get());delete source.fleet;this.fleetResult={source,result,currency:v.currency};this.a.mutate(p=>{p.fleet={result,currency:v.currency,fingerprint:planFingerprint(source)};});this.showFleet();});
    },'计算分柜比较');}
  run(data,done){
    if(this.running)throw Error('已有计算在进行');const {get,dialog,button,toast}=this.a,source=clone(get());
    dialog('正在计算',`<p id="work-progress">正在检查参数…</p>${button('work-cancel','取消计算')}`,null);
    const w=new Worker(new URL('./planning.worker.js',import.meta.url),{type:'module'});this.running=w;
    w.onmessage=({data:result})=>{
      if(result.progress){const el=document.querySelector('#work-progress');if(el)el.textContent=result.progress.container?`正在计算第 ${result.progress.container} 柜 · ${result.progress.preset}`:result.progress.scenario==='ideal'?'正在计算理想尺寸方案':'正在计算保守尺寸方案';return;}
      w.terminate();this.running=null;
      if(result.error){toast(result.error,true);this.home();return;}
      if(get().id!==source.id||get().updatedAt!==source.updatedAt){toast('方案已变化，请重新计算',true);this.home();return;}
      try{done(result.result);}catch(e){toast('结果未应用：'+e.message,true);this.home();}
    };
    w.onerror=e=>{w.terminate();this.running=null;toast('计算失败：'+e.message,true);this.home();};w.postMessage({...data,project:source,mode:this.a.mode()});
  }
  showFleet(){
    const {dialog,button,esc}=this.a,{result,currency}=this.fleetResult;
    dialog('多柜分配结果',`<p class="dialog-intro">未装完的结果不能与完整方案直接按总运费比较。每柜可另存为独立方案查看；原方案不变。结果已随方案保存。</p>${result.map((r,index)=>`<section class="note-card"><h3>${esc(r.schedule.join(' → '))}</h3><p>${r.containers.length} 柜 · ${r.complete?'全部可自动装载库存已分配':`尚余 ${r.remaining.reduce((s,t)=>s+t.count,0)} 件`} · ${r.cost===null?'未提供运费':`${r.cost.toFixed(2)} ${esc(currency)}`}${r.limited?' · 达到计算预算，非最优保证':''}</p><p>${r.remaining.map(t=>`${esc(t.name)}：${t.count}`).join('；')}</p><div class="stack">${r.containers.map((c,j)=>button('fleet-open',`第 ${j+1} 柜 ${c.container.preset} · ${c.pieces} 件 · ${(c.utilization*100).toFixed(1)}%`,'','',`data-index="${index}" data-container-index="${j}"`)).join('')}</div></section>`).join('')}`,null);
  }
  pathDialog(){const {get,dialog,num,select}=this.a,d=get().pathParameters||{equipmentLength:0,equipmentWidth:0,equipmentHeight:0,clearance:0,lift:0,channelWidth:2352,approachLength:6000,direction:'load'};
    dialog('几何装卸路径检查',`<p class="dialog-intro">仅检查固定朝向沿 X 方向直进/直退、在目标处升降的包络。设备长/宽/高填 0 表示人工搬运，仅查货物；有设备时须实测填写。柜外空间和通道宽由你确认，不模拟转弯、叉齿、地坪承载、倾覆或驾驶安全。检查假设柜门完全打开。</p>${select('direction','作业方向',d.direction,[['load','按装载顺序检查'],['unload','按卸货批次检查']])}<div class="fields two">${Object.entries({equipmentLength:'货物后方设备长度',equipmentWidth:'设备宽度',equipmentHeight:'设备高度',clearance:'额外安全包络',lift:'途中比目标高度抬升',channelWidth:'有效直线通道宽度',approachLength:'柜外直线进退空间'}).map(([k,l])=>num(k,l+' mm',d[k],0)).join('')}</div>`,v=>{
      const params={direction:v.direction};for(const k of ['equipmentLength','equipmentWidth','equipmentHeight','clearance','lift','channelWidth','approachLength'])params[k]=+v[k];
      this.a.mutate(p=>{p.pathParameters=params;});this.run({kind:'path',params},result=>{this.pathResult=result;this.showPath();});
    },'检查几何路径');
  }
  showPath(){const {dialog,button,esc}=this.a,r=this.pathResult;dialog('几何路径结果',`<p class="${r.complete?'':'danger'}">${r.complete?'全部步骤通过本次几何检查':'在阻挡处停止，后续步骤未验证'} · 已查 ${r.results.length} / ${r.total} 步。</p><p>仅代表所填参数下的直线包络检查，不代表真实叉车作业安全。未验证 ${r.untested} 步。</p><div class="stack">${r.results.map((s,i)=>`<div class="note-card"><strong>${i+1}. ${esc(s.name)} · ${s.valid?'通过':'阻挡'}</strong><p>${s.reasons.map(esc).join('；')}</p>${button('path-focus','在场景中定位','','',`data-id="${s.id}"`)}</div>`).join('')}</div>`,null);}
  async handle(action,el){
    switch(action){
      case 'workbench':this.home();break;
      case 'cargo-import':importDialog(this.a);break;
      case 'versions':await this.versions();break;
      case 'version-create':await this.createVersion();break;
      case 'version-compare':case 'version-restore':await this.version(el.dataset.id,action==='version-restore');break;
      case 'checklist':this.checklist();break;
      case 'checklist-finalize':this.a.replace(finalizeChecklist(this.a.get()));this.checklist();break;
      case 'checklist-export':await this.exportChecklist();break;
      case 'fleet-dialog':this.fleetDialog();break;
      case 'fleet-last':{const p=this.a.get();if(!p.fleet)throw Error('尚无已保存的分柜结果');if(p.fleet.fingerprint!==planFingerprint(p))throw Error('当前参数或布局已变化，请重新计算分柜');const source=clone(p);delete source.fleet;this.fleetResult={source,result:p.fleet.result,currency:p.fleet.currency};this.showFleet();break;}
      case 'fleet-open':{const c=this.fleetResult.result[+el.dataset.index].containers[+el.dataset.containerIndex],p=clone(this.fleetResult.source);p.id=uid();p.name+=` · 第 ${+el.dataset.containerIndex+1} 柜 ${c.container.preset}`;p.container=c.container;p.placements=clone(c.items);delete p.loadingRecord;delete p.assemblyEdit;this.a.close();await this.a.switchProject(p);break;}
      case 'compare-bags':this.run({kind:'bags'},results=>{this.bagResults=results;const {dialog,button}=this.a;dialog('理想 / 保守装量比较',`<p>按全部可用库存重新排放，不保留锁定摆放。应用前保留当前方案副本。</p>${results.map((r,index)=>`<div class="note-card">${r.scenario==='ideal'?'理想尺寸':'保守尺寸'}：${r.candidate?`${r.candidate.report.pieces} 件 · ${(r.candidate.report.utilization*100).toFixed(1)}%`:'无法生成合规方案'}${r.candidate?button('bag-result-open','另存并打开','','',`data-index="${index}"`):''}</div>`).join('')}`,null);});break;
      case 'bag-result-open':{const r=this.bagResults[+el.dataset.index],p=clone(r.project);p.id=uid();p.name+=' · '+(r.scenario==='ideal'?'理想':'保守');p[this.a.mode()==='pallet'?'palletPlacements':'placements']=clone(r.candidate.items);delete p.loadingRecord;delete p.assemblyEdit;this.a.close();await this.a.switchProject(p,this.a.mode());break;}
      case 'work-cancel':this.running?.terminate();this.running=null;this.home();break;
      case 'path-dialog':this.pathDialog();break;
      case 'path-focus':this.a.close();this.a.focus(el.dataset.id);break;
      default:return false;
    }return true;
  }
}
