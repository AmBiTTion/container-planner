import "./style.css";
import {
  createIcons,
  Box,
  Container,
  Package,
  Layers,
  Plus,
  Settings2,
  RotateCcw,
  RotateCw,
  Save,
  FolderOpen,
  Download,
  Upload,
  Move,
  MousePointer2,
  Scan,
  Eye,
  Check,
  ChevronRight,
  Lock,
  Unlock,
  Copy,
  Trash2,
  X,
  ArrowRight,
  ArrowDownToLine,
  SlidersHorizontal,
  TriangleAlert,
  CheckCheck,
  ChartNoAxesCombined,
  FileText,
  HelpCircle,
  Maximize2,
  Undo2,
  Redo2,
  Play,
  Square,
  Grid2X2,
  Target,
  MapPin,
  RefreshCw,
  Pencil,
  Ruler,
} from "lucide";
import {
  uid,
  clone,
  cargo,
  emptyProject,
  sampleProject,
  CONTAINERS,
  PALLETS,
  COLORS,
  RETAILERS,
  makeRetailTemplate,
  allTypes,
  binFor,
  validateProject,
} from "./model.js";
import {
  analyze,
  footprint,
  physical,
  shape,
  collides,
  outside,
  supportsFor,
  groundFor,
  makeAssembly,
  usedCounts,
  consumption,
  remainingReason,
  loadingSequence,
} from "./engine.js";
import { SceneView } from "./scene.js";
import {CargoPreview} from './cargo-preview.js';
import {freeSpaces} from './free-space.js';
import {manualContext,previewManual,snapManual,findManualSlot,heightMessage} from './manual.js';
import { exportReport, exportCsv, download } from "./report.js";
import {batchEdit,selectionBounds,selectionGaps,validateBatch} from './batch-edit.js';
import {Editor2D} from './editor-2d.js';
import {operationDefaults,applyBagScenario} from './operations.js';
import {beginAssemblyEdit,finishAssemblyEdit} from './assembly-edit.js';
import {Workbench,uploadAsset,assetURL} from './workbench.js';
import {CONTAINER_SKINS,containerSkinName,resolveContainerSkin} from './container-skins.js';
import {PALLET_DESIGN_PRESETS,createPalletDesign,ensurePalletDesign,validatePalletDesign,resizePalletDesign} from './pallet-design.js';
import {PalletPreview} from './pallet-preview.js';
import {HEATMAPS,heatSummary} from './heatmap.js';
import {CARGO_MATERIALS,CARGO_PATTERNS,cargoAppearance,containerAppearance} from './appearance.js';
import {checkPaths} from './path-check.js';

const iconSet = {
  Box,
  Container,
  Package,
  Layers,
  Plus,
  Settings2,
  RotateCcw,
  RotateCw,
  Save,
  FolderOpen,
  Download,
  Upload,
  Move,
  MousePointer2,
  Scan,
  Eye,
  Check,
  ChevronRight,
  Lock,
  Unlock,
  Copy,
  Trash2,
  X,
  ArrowRight,
  ArrowDownToLine,
  SlidersHorizontal,
  TriangleAlert,
  CheckCheck,
  ChartNoAxesCombined,
  FileText,
  HelpCircle,
  Maximize2,
  Undo2,
  Redo2,
  Play,
  Square,
  Grid2X2,
  Target,
  MapPin,
  RefreshCw,
  Pencil,
  Ruler,
};
const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const n = (v, d = 0) =>
  Number(v).toLocaleString("zh-CN", { maximumFractionDigits: d });
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const kindName = { box: "纸箱", soft: "软包", woven: "编织袋", pallet: "整托" };
const button = (action, label, ic = "", cls = "", attrs = "") =>
  `<button type="button" data-action="${action}" class="${cls}" ${attrs}>${ic ? icon(ic) : ""}${label}</button>`;
const num = (name, label, value, min = 0, step = "any", extra = "") =>
  `<label>${label}<input type="number" name="${name}" value="${value}" min="${min}" max="100000000" step="${step}" required ${extra}></label>`;
const txt = (name, label, value = "", extra = "") =>
  `<label>${label}<input name="${name}" value="${esc(value)}" maxlength="200" ${extra}></label>`;
const check = (name, label, value) =>
  `<label class="check"><input name="${name}" type="checkbox" ${value ? "checked" : ""}>${label}</label>`;
const select = (name, label, value, opts) =>
  `<label>${label}<select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
let project = sampleProject(),
  history = [],
  future = [],
  revision = 0,
  saveTimer,
  saveQueue = Promise.resolve(),
  scene,
  report,
  worker = null,
  candidates = [],
  candidateIndex = 0,
  dialogSubmit = null,
  dialogPending = false,
  lastSave = "准备就绪",
  toastTimer;
const ui = {
  mode: "container",
  side: "cargo",
  selected: null,
  selection: [],
  editor2d: null,
  toolsOpen: false,
  spaces: false,
  spaceData: null,
  heatmap:'off',
  onlyLayer: false,
  tool: "orbit",
  view: "iso",
  layer: "all",
  walls: true,
  boxes: false,
  center: false,
  right: "plan",
  step: 0,
  pending:null,
  preview:null,
  repeat:true,
  lockNew:true,
  snapping:true,
  allowOverlap:false,
  doorBoxes:false,
  photo:false,
  photoRotate:false,
  photoBackground:'studio',
};
let pathPlayer=null;
let editor2d;
const workbench=new Workbench({get:()=>project,mode:()=>ui.mode,dialog,close:closeDialog,button,esc,txt,num,select,toast,replace:p=>{checkpoint();project=validateProject(p);changed();},mutate:fn=>{const p=clone(project);fn(p);validateProject(p);checkpoint();project=p;changed();},switchProject,focus:id=>{ui.mode='container';ui.layer='all';ui.onlyLayer=false;ui.right='plan';selectGroup([id]);}});
function operationsDialog(){
  const o={...operationDefaults(),...project.settings.operations},limits={...operationDefaults().limits,...o.limits},r=analyze(project).regional;
  dialog('现场余量与区域载重',`<p class="dialog-intro">余量仅作用于集装箱，现有摆放不自动移动；修改后检查并重新计算。区域重量按每件货物外包络均匀分摊估算，不是车轴载荷或结构安全认证。区域上限 0 表示未设置。</p><div class="fields two">${num('door','门口预留 mm',o.door)}${num('front','柜内首端绑扎空间 mm',o.front)}${num('side','两侧各预留 mm',o.side)}${num('top','顶部预留 mm',o.top)}${num('gap','货物水平间距 mm',project.settings.gap)}</div>${check('enforceGap','手动摆放和检查也强制水平间距',o.enforceGap)}<h3 class="subheading">区域重量 / 用户限值 kg</h3><div class="fields two">${Object.entries({front:'前半：柜内深处',rear:'后半：靠柜门',left:'低 Y 半区',right:'高 Y 半区'}).map(([k,l])=>num(k+'Limit',`${l}（当前 ${n(r[k],1)} kg）`,limits[k])).join('')}</div>`,v=>{const next=clone(project);next.settings.operations={door:+v.door,front:+v.front,side:+v.side,top:+v.top,enforceGap:!!v.enforceGap,limits:Object.fromEntries(Object.keys(limits).map(k=>[k,+v[k+'Limit']]))};next.settings.gap=+v.gap;validateProject(next);checkpoint();project=next;changed();closeDialog();});
}
function bagsDialog(){
  const bags=project.types.filter(t=>['soft','woven'].includes(t.kind));
  if(!bags.length)throw Error('请先添加软包或编织袋规格');
  dialog('袋子尺寸容差',`<p class="dialog-intro">理想尺寸是人工确认的装满/压缩后外形；保守尺寸 = 理想尺寸 + 三方向正容差。单件重量不变。应用后原有摆放只重新校验，不会悄悄移动；重新自动计算可获得相应方案。</p>${select('scenario','计算外形',project.settings.bagScenario||'ideal',[['ideal','理想尺寸'],['conservative','保守尺寸（含容差）']])}${bags.map((t,index)=>{const d=t.bagIdeal||[t.effectiveLength,t.effectiveWidth,t.effectiveHeight],tol=t.bagTolerance||[0,0,0];return `<h3 class="subheading">${esc(t.name)}</h3><div class="fields three">${['长','宽','高'].map((k,i)=>num(`b${index}d${i}`,`理想${k} mm`,d[i],.01)).join('')}${['长','宽','高'].map((k,i)=>num(`b${index}t${i}`,`${k}正容差 mm`,tol[i],0)).join('')}</div>`;}).join('')}`,v=>{const entries=Object.fromEntries(bags.map((t,index)=>[t.id,{ideal:[0,1,2].map(i=>+v[`b${index}d${i}`]),tolerance:[0,1,2].map(i=>+v[`b${index}t${i}`])}]));const next=applyBagScenario(project,v.scenario,entries);validateProject(next);checkpoint();project=next;changed();closeDialog();toast('计算外形已更新，请检查现有摆放或重新自动计算');});
}
function selectGroup(ids,add=false){
  const next=new Set(add?ui.selection:[]);
  for(const id of ids){if(add&&next.has(id))next.delete(id);else next.add(id);}
  ui.selection=[...next];ui.selected=ui.selection.at(-1)||null;render();
}
function commitBatch(operation){
  const result=batchEdit(project,ui.mode,ui.selection,operation,{allowOverlap:ui.allowOverlap,doorCheck:ui.mode==='container'?(i,t)=>scene?.doorPlacementIssue(i,t):null});
  checkpoint();setItems(result.items);ui.selection=result.ids;ui.selected=result.ids.at(-1)||null;changed();
}
function batchPanel(){
  const editing=project.assemblyEdit?`<section class="batch-panel"><h3>正在编辑整托内容</h3><p class="hint">使用当前码托区自由调整。完成后选择应用范围；原码托工作区会恢复。</p><div class="row wrap">${button('assembly-apply-one','仅应用这一托')}${button('assembly-apply-all','应用同规格全部')}${button('assembly-cancel','取消编辑')}</div></section>`:'';
  if(!ui.selection.length)return editing;
  const gaps=selectionGaps(project,ui.mode,ui.selection);
  return editing+`<section class="batch-panel"><h3>选中 ${ui.selection.length} 件</h3><p class="hint">Ctrl / Shift 单击多选；框选工具或二维空白处拖框。整组操作失败时全部保留原位。</p><div class="row wrap">${button('group-transform','整组移动 / 旋转')}${button('group-align','对齐 / 间距')}${button('copy-layer','复制整层')}${button('group-unlock','整组解锁')}${button('group-lock','整组锁定')}${button('group-delete','删除选中','','danger')}${ui.mode==='container'&&current()&&type(current().typeId).kind==='pallet'?button('assembly-edit','编辑托内货物'):''}</div><p class="hint">距首端 ${n(gaps.start)} / 门端 ${n(gaps.door)} / 左侧 ${n(gaps.left)} / 右侧 ${n(gaps.right)} / 顶部 ${n(gaps.top)} mm${gaps.nearest===null?'':`；最近外包络间隙 ${n(gaps.nearest)} mm（非通道宽度）`}</p></section>`;
}
function groupDialog(kind){
  if(!ui.selection.length)throw Error('请先选中货物');
  if(kind==='transform')dialog('整组移动与旋转',`<p class="dialog-intro">移动使用相对位移；旋转绕选中组中心。复制保留原组。锁定货物可复制，移动前须解锁。</p>${select('kind','操作','move',[['move','移动整组'],['copy','复制整组'],['rotate','旋转整组']])}<div class="fields three">${num('x','ΔX mm',0,-1e8)}${num('y','ΔY mm',0,-1e8)}${num('z','ΔZ mm',0,-1e8)}${num('angle','旋转角度 °',90,-1e8)}</div>`,v=>{commitBatch({kind:v.kind,x:+v.x,y:+v.y,z:+v.z,angle:+v.angle});closeDialog();});
  if(kind==='align')dialog('对齐与排列',`<p class="dialog-intro">对齐单件边缘可能产生重叠；碰撞、支撑与边界仍检查。居中、贴边保持组内布局。</p>${select('kind','操作','center',[['center','整组在工作区居中'],['edge','整组贴工作区边缘'],['align','组内单件对齐'],['adjacent','按间距连续排列'],['distribute','在现有跨度内等距排列']])}${select('axis','方向','x',[['x','X 长向'],['y','Y 宽向']])}${select('edge','基准边','start',[['start','起始边'],['center','中心'],['end','末端边']])}${num('gap','相邻净间距 mm',project.settings.gap,0)}`,v=>{commitBatch({kind:v.kind,axis:v.axis,edge:v.edge,end:v.edge==='end',gap:+v.gap});closeDialog();});
  if(kind==='layer'){
    const b=selectionBounds(project,ui.mode,ui.selection);
    dialog('复制整层 / 交错码垛',`<p class="dialog-intro">选择同一底部高度的整层货物。源层保留，新增层检查库存、支撑、层数和承重。90°交错需实际尺寸能放下，不会自动缩小货物。</p><div class="fields">${num('count','新增层数',1,1,1)}${num('step','每层上移 mm',b.h,1)}</div>${check('alternate','相邻层交替旋转 90°',false)}`,v=>{commitBatch({kind:'copy-layer',count:+v.count,step:+v.step,alternate:!!v.alternate});closeDialog();});
  }
}
function doorStatus(info){
  const el=$('#door-status');if(!el)return;
  el.dataset.leftAngle=String(info.angles.left);el.dataset.rightAngle=String(info.angles.right);el.dataset.moving=String(info.moving);
  el.textContent=info.blocked||`左门 ${Math.round(info.angles.left)}° / 右门 ${Math.round(info.angles.right)}°${info.moving?' · 开合中':' · 点击门扇单独开关'}`;
  el.classList.toggle('invalid',!!info.blocked);$('#toggle-doors').textContent=info.willClose?'关闭双门':'打开双门';
}
function checkManualCandidate(ctx,item,options={}){
  const result=previewManual(ctx,item,options);
  const reason=result.valid&&ui.mode==='container'?scene?.doorPlacementIssue(item,type(item.typeId)):null;
  return reason?{...result,valid:false,reason}:result;
}
let manualCache=null;
function contextForManual(excludeId=null){
  const key=`${revision}:${ui.mode}:${excludeId||''}`;
  if(!manualCache||manualCache.key!==key)manualCache={key,value:manualContext(project,ui.mode,excludeId)};
  return manualCache.value;
}
function updatePreview(item,excludeId=null,snap=true){
  if(excludeId&&ui.selection.length>1&&ui.selection.includes(excludeId)){
    const old=items().find(i=>i.id===excludeId),step=ui.snapping?(project.settings.snap||1):1;
    const candidate={...item,x:snap?old.x+Math.round((item.x-old.x)/step)*step:item.x,y:snap?old.y+Math.round((item.y-old.y)/step)*step:item.y};
    try{batchEdit(project,ui.mode,ui.selection,{kind:'move',x:candidate.x-old.x,y:candidate.y-old.y,z:candidate.z-old.z},{allowOverlap:ui.allowOverlap});return {valid:true,item:candidate,reason:'整组可移动'};}catch(e){return {valid:false,item:candidate,reason:e.message};}
  }
  const ctx=contextForManual(excludeId),candidate=snap?snapManual(ctx,item,ui.snapping):item,result=checkManualCandidate(ctx,candidate,{allowOverlap:ui.allowOverlap});
  ui.preview=candidate;
  const status=$('#manual-status');if(status){status.textContent=`X ${n(candidate.x)} · Y ${n(candidate.y)} · Z ${n(candidate.z)} mm　${result.reason}`;status.classList.toggle('invalid',!result.valid);status.classList.toggle('overlap-warning',!!result.overlap);}
  return result;
}
function startManual(id){
  const t=type(id);if(!t)return;
  if(ui.mode==='pallet'&&t.kind==='pallet')throw Error('整托请放入集装箱，码托区摆放单件货物');
  ui.pending={id:uid(),typeId:id,rotation:0};ui.preview=null;ui.selected=null;ui.right='plan';ui.layer='all';ui.step=0;ui.tool='move';render();
  if(t.effectiveHeight>binFor(project,ui.mode).height)toast(heightMessage(project,ui.mode,t),true);
}
function cancelManual(){ui.pending=null;ui.preview=null;ui.tool='move';render();}
function commitManual(item){
  if(!ui.pending)return false;
  const candidate={...item,id:ui.pending.id,locked:ui.lockNew},check=checkManualCandidate(contextForManual(),candidate,{complete:true,allowOverlap:ui.allowOverlap});
  if(!check.valid){toast(check.reason,true);return false;}
  checkpoint();items().push(candidate);ui.selected=candidate.id;
  if(ui.repeat){ui.pending={...ui.pending,id:uid()};}else ui.pending=null;
  changed();return true;
}
function manualPanel(){
  if(!ui.pending)return `<section class="manual-panel"><h3>手动摆放</h3><p class="hint">从左侧选择货物的「手动摆放」，移动鼠标预览，点击落位。已有货物可直接用拖动工具调整。</p><div class="row wrap">${button('tool-move','拖动已有货物','move','light')}${button('tool-orbit','旋转查看','mouse-pointer-2')}</div></section>`;
  const t=type(ui.pending.typeId);
  return `<section class="manual-panel"><div class="row between"><h3>正在放置 · ${esc(t.name)}</h3><span class="tag">${ui.pending.rotation}°</span></div><p class="hint">绿框可放，红框显示原因。${ui.allowOverlap?'橙框为临时重叠；指向货物时同层放置，叠层请指定 Z 高度。':''}点击后可连续放下一件；右键平移，滚轮缩放。</p><div class="stack">${check('manual-repeat','连续放置',ui.repeat)}${check('manual-lock','落位后锁定，供自动补位保留',ui.lockNew)}${check('manual-snap','吸附网格与货物边缘',ui.snapping)}</div><div class="row wrap" style="margin-top:12px">${button('manual-rotate','旋转 90° · R','rotate-cw')}${button('manual-coordinates','指定坐标','map-pin')}${button('manual-cancel','结束放置 · Esc','x','ghost')}</div></section>`;
}
function coordinatePlacement(){
  if(!ui.pending)return;
  const t=type(ui.pending.typeId),o=ui.mode==='pallet'?project.pallet.overhang:0,a=ui.preview||{x:o,y:o,z:0,rotation:ui.pending.rotation};
  dialog('手动指定位置',`<p class="dialog-intro">${esc(t.name)} · ${t.effectiveLength} × ${t.effectiveWidth} × ${t.effectiveHeight} mm。Z 从地面或托盘上表面起算。</p><div class="fields three">${num('x','X 长向（mm）',a.x,0)}${num('y','Y 宽向（mm）',a.y,0)}${num('z','Z 高度（mm）',a.z,0)}${num('rotation','水平角度（°）',a.rotation,0)}</div><p id="coordinate-check" class="hint" style="margin-top:12px"></p>`,v=>{
    const next={...ui.pending,x:Number(v.x),y:Number(v.y),z:Number(v.z),rotation:Number(v.rotation)%360};
    const result=checkManualCandidate(contextForManual(),next,{complete:true,allowOverlap:ui.allowOverlap});if(!result.valid)throw Error(result.reason);
    if(commitManual(next))closeDialog();
  },'放到此位置');
  const refresh=()=>{const form=$('#dialog-form'),candidate={...ui.pending};for(const k of ['x','y','z','rotation'])candidate[k]=Number(form.elements.namedItem(k).value);const result=updatePreview(candidate,null,false);$('#coordinate-check').textContent=result.reason;scene?.showGhost(result);};
  $$('#dialog input').forEach(input=>input.addEventListener('input',refresh));refresh();
}
const items = () =>
  ui.mode === "pallet" ? project.palletPlacements : project.placements;
const setItems = (a) => {
  if (ui.mode === "pallet") project.palletPlacements = a;
  else project.placements = a;
};
const type = (id) => allTypes(project).find((t) => t.id === id);
const current = () => items().find((i) => i.id === ui.selected);
const icons = () =>
  createIcons({ icons: iconSet, attrs: { "stroke-width": 1.7 } });
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").className = "toast" + (error ? " error" : "");
  toastTimer = setTimeout(() => ($("#toast").className = "toast hidden"), 6000);
}
function checkpoint() {
  history.push(clone(project));
  if (history.length > 35) history.shift();
  future = [];
}
function refreshAssemblies() {
  for (const a of project.assemblies) {
    a.weight =
      a.tare +
      a.children.reduce((s, c) => s + (type(c.typeId)?.weight || 0), 0);
    a.height = a.effectiveHeight =
      a.baseHeight +
      Math.max(
        0,
        ...a.children.map((c) => c.z + type(c.typeId).effectiveHeight),
      );
  }
}
function changed({ keepCandidates = false, draw = true } = {}) {
  revision++;
  if(ui.pending&&(!type(ui.pending.typeId)||(scene&&scene.mode!==ui.mode))){ui.pending=null;ui.preview=null;}
  if (worker) {
    worker.terminate();
    worker = null;
    $("#progress")?.remove();
    toast("参数已变化，计算已取消，请重新计算");
  }
  if (!keepCandidates) candidates = [];
  refreshAssemblies();
  project.updatedAt = new Date().toISOString();
  scheduleSave();
  render(draw);
}
function transaction(fn) {
  checkpoint();
  try {
    fn();
    validateProject(project);
    changed();
  } catch (e) {
    project = history.pop();
    toast(e.message, true);
    render();
  }
}
function scheduleSave() {
  lastSave = "正在保存…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(), 550);
}
async function saveProject(force = false) {
  clearTimeout(saveTimer);
  const snapshot = clone(project),
    rev = revision;
  const work = async () => {
    try {
      validateProject(snapshot);
      const res = await fetch(
        "/api/projects/" + encodeURIComponent(snapshot.id),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        },
      );
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      localStorage.setItem("container-planner-last", snapshot.id);
      if (project.id === snapshot.id && revision === rev) {
        lastSave =
        "已保存到本机 · " +
          new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          });
        if ($("#save-state")) $("#save-state").textContent = lastSave;
      }
      if (force) toast("方案已保存到程序目录的 data 文件夹");
      return true;
    } catch (e) {
      lastSave = "保存失败，请导出备份";
      if ($("#save-state")) $("#save-state").textContent = lastSave;
      toast("保存失败：" + e.message, true);
      return false;
    }
  };
  saveQueue = saveQueue.then(work, work);
  return saveQueue;
}
async function switchProject(p, mode = "container") {
  if(!(await saveProject()))throw Error('当前方案尚未保存，请先导出备份，再切换方案');
  project = validateProject(p);
  stopPathPlayer();
  ui.allowOverlap=false;
  ui.pending=null;ui.preview=null;
  history = [];
  future = [];
  candidates = [];
  ui.mode = mode;
  ui.selected = null;
  ui.layer = "all";
  ui.step = 0;
  ui.right = "plan";
  changed();
  scene?.fit(ui.view);
}
let cargoPreview=null,palletPreview=null;
function disposeCargoPreview(){cargoPreview?.dispose();cargoPreview=null;palletPreview?.dispose();palletPreview=null;}
function dialog(title, body, submit, label = "保存") {
  disposeCargoPreview();
  dialogPending=false;
  $$('#dialog [data-action="close-dialog"]').forEach(b=>b.disabled=false);
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = body;
  $("#dialog-error").textContent = "";
  $("#dialog-submit").textContent = label;
  $('#dialog-submit').disabled=false;
  $("#dialog-submit").classList.toggle("hidden", !submit);
  dialogSubmit = submit;
  icons();
  $("#dialog").showModal();
}
function closeDialog() {
  disposeCargoPreview();
  $("#dialog").close();
  dialogSubmit = null;
}
function confirmAction(title, body, fn) {
  dialog(
    title,
    `<p class="dialog-intro">${body}</p>`,
    () => {
      fn();
      closeDialog();
    },
    "确定",
  );
}
function stopPathPlayer(){
  if(pathPlayer?.raf)cancelAnimationFrame(pathPlayer.raf);
  pathPlayer=null;scene?.clearPathFrame?.();$('#path-player')?.classList.add('hidden');
}
function paintPathPlayer(){
  if(!pathPlayer)return;const r=pathPlayer.result.results[pathPlayer.index],host=$('#path-player');
  if(!r){stopPathPlayer();return;}
  const blocked=!r.valid;scene?.setPathFrame?.({id:r.id,progress:pathPlayer.progress,direction:pathPlayer.params.direction,approachLength:pathPlayer.params.approachLength,valid:r.valid});
  $('#path-status').textContent=`${pathPlayer.index+1} / ${pathPlayer.result.total} · ${r.name}${blocked?' · 阻挡：'+r.reasons.join('；'):pathPlayer.params.direction==='unload'?' · 卸出':' · 装入'}`;
  $('#path-progress').value=pathPlayer.progress;host.classList.toggle('blocked',blocked);$('[data-action="path-play"]').textContent=pathPlayer.playing?'暂停':'播放';
}
function pathTick(now){
  if(!pathPlayer)return;const dt=Math.min(.08,(now-(pathPlayer.last||now))/1000);pathPlayer.last=now;
  const step=pathPlayer.result.results[pathPlayer.index];
  if(pathPlayer.playing&&step?.valid){pathPlayer.progress+=dt*pathPlayer.speed/1.6;if(pathPlayer.progress>=1){pathPlayer.progress=0;if(pathPlayer.index<pathPlayer.result.results.length-1)pathPlayer.index++;else pathPlayer.playing=false;}}
  if(pathPlayer.result.results[pathPlayer.index]&&!pathPlayer.result.results[pathPlayer.index].valid)pathPlayer.playing=false;
  paintPathPlayer();pathPlayer.raf=requestAnimationFrame(pathTick);
}
function startPathPlayer(result,params){
  stopPathPlayer();pathPlayer={result,params,index:0,progress:0,speed:1,playing:true,last:performance.now(),raf:0};
  $('#path-player').classList.remove('hidden');ui.toolsOpen=false;ui.mode='container';render();paintPathPlayer();pathPlayer.raf=requestAnimationFrame(pathTick);
}
function pathAnimationDialog(){
  if(ui.mode!=='container')throw Error('装卸路径动画只用于集装箱模式');
  const d=project.pathParameters||{equipmentLength:0,equipmentWidth:0,equipmentHeight:0,clearance:0,lift:0,channelWidth:project.container.doorWidth,approachLength:6000,direction:'load'};
  dialog('装卸路径动画',`<p class="dialog-intro">先按设备与通道包络做直线 X 方向几何检查，再播放通过的步骤；遇到柜门、货物或通道障碍会停止。它是装卸演示，不是叉车转弯和现场安全认证。</p><div class="fields two">${select('direction','方向',d.direction,[['load','装入'],['unload','卸出']])}${num('approachLength','柜外直线空间 mm',d.approachLength,1)}${num('equipmentLength','设备长度 mm',d.equipmentLength,0)}${num('equipmentWidth','设备宽度 mm',d.equipmentWidth,0)}${num('equipmentHeight','设备高度 mm',d.equipmentHeight,0)}${num('channelWidth','通道宽度 mm',d.channelWidth,1)}${num('clearance','安全间隙 mm',d.clearance,0)}${num('lift','搬运抬升 mm',d.lift,0)}</div>`,v=>{
    const params={direction:v.direction,...Object.fromEntries(['approachLength','equipmentLength','equipmentWidth','equipmentHeight','channelWidth','clearance','lift'].map(k=>[k,Number(v[k])]))};
    const result=checkPaths(project,params),test=clone(project);test.pathParameters=params;validateProject(test);checkpoint();project=test;closeDialog();changed();startPathPlayer(result,params);toast(result.complete?'路径检查通过，开始播放':`播放将在第 ${result.results.length} 步的障碍处停止`);
  },'检查并播放');
}
function setPhotoMode(enabled){
  ui.photo=enabled;document.body.classList.toggle('photo-mode',enabled);if(!enabled){ui.photoRotate=false;scene?.setAutoRotate?.(false);}scene?.fit(ui.view);render(false);
}
function shell() {
  $("#app").innerHTML =
    `<header class="topbar"><div class="brand"><div class="brandmark">${icon("container")}</div><div><strong>柜里</strong><small>CONTAINER PLANNER</small></div></div><div><input id="project-name" class="project-title" aria-label="方案名称" maxlength="200"><div id="save-state" class="save-state">准备就绪</div></div><div class="top-actions">${button("projects", "方案库", "folder-open")}${button("path-animation", "装卸动画", "play")}${button("photo-mode", "拍照展示", "eye")}${button("save", "保存", "save")}${button("exports", "导出", "download")}${button("help", "", "help-circle", "icon-btn", 'aria-label="使用帮助" title="使用帮助"')}</div></header>
  <div class="appbar"><div class="modes">${button("mode-container", "集装箱配载", "container", "", 'data-mode="container"')}${button("mode-pallet", "托盘码垛", "layers", "", 'data-mode="pallet"')}</div><span class="context">从每一件货物，到整柜装载</span><div class="grow"></div><div class="row">${button("templates", "客户模板", "sliders-horizontal", "ghost")}${button("samples", "示例方案", "grid2-x2", "ghost")}</div></div>
  <main class="workspace"><aside class="sidebar"><div class="side-tabs">${button("side-cargo", "货物清单", "", "active")}${button("side-bin", "装载设置")}${button("side-templates", "客户规则")}</div><div id="side-content" class="side-content"></div></aside>
  <section class="stage"><div class="stage-top"><div><div id="stage-title" class="stage-title"></div><div id="stage-subtitle" class="stage-subtitle"></div></div><div class="view-controls">${[
    ["iso", "立体"],
    ["top", "俯视"],
    ["door", "柜门"],
    ["inside", "柜内"],
  ]
    .map(([v, l]) =>
      button("view", l, "", v === "iso" ? "active" : "", `data-view="${v}"`),
    )
    .join("")}</div></div>
  <div class="stage-tools">${button("tool-orbit", "", "mouse-pointer-2", "icon-btn active", 'aria-label="旋转查看" title="旋转查看"')}${button("tool-move", "", "move", "icon-btn", 'aria-label="拖动摆放" title="拖动摆放（M）"')}${button("rotate", "", "rotate-cw", "icon-btn", 'aria-label="旋转货物90度" title="旋转货物90度（R）"')}${button("drop", "", "arrow-down-to-line", "icon-btn", 'aria-label="落到支撑面" title="落到支撑面"')}${button("boxes", "", "scan", "icon-btn", 'aria-label="显示碰撞箱" title="显示碰撞箱"')}${button("center", "", "target", "icon-btn", 'aria-label="显示重心" title="显示重心"')}${button("fit", "", "maximize-2", "icon-btn", 'aria-label="重置视角" title="重置视角"')}</div>
  <div id="canvas-host" class="canvas-host"></div><div id="path-player" class="path-player hidden"><div class="row between"><strong>装卸路径动画</strong>${button('path-stop','','x','icon-btn ghost','aria-label="关闭路径动画"')}</div><p id="path-status"></p><input id="path-progress" type="range" min="0" max="1" step="0.01" value="0"><div class="row wrap">${button('path-prev','上一步')}${button('path-play','暂停','play')}${button('path-next','下一步')}<label>速度<select id="path-speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label></div></div><div class="photo-controls"><strong>拍照展示</strong><div class="row wrap">${[['iso','立体'],['top','俯视'],['door','柜门'],['inside','柜内']].map(([v,l])=>button('photo-view',l,'','','data-view="'+v+'"')).join('')}</div><div class="row wrap">${button('photo-rotate','自动旋转：关')}${button('photo-walls','墙体：开')}${button('photo-background','背景：影棚')}</div><div class="row wrap">${button('photo-export','下载高清 PNG','download','primary')}${button('exit-photo','退出展示','x')}</div></div><div class="stage-bottom"><div class="scene-help" id="scene-help">拖动旋转 · 滚轮缩放 · 单击选中</div><div class="layer-control">${icon("layers")}<select id="layer-select" aria-label="显示层数"><option value="all">全部层</option></select></div></div><div id="metrics" class="metric-strip"></div></section>
  <aside class="inspector"><div class="side-tabs">${button("right-plan", "配载方案", "", "active")}${button("right-checks", "检查")}${button("right-list", "明细")}</div><div id="inspector-content" class="inspector-content"></div></aside></main>
  <footer class="statusbar"><span><span class="dot"></span> 本地运行 · 无需联网</span><span id="status-bin"></span><span class="grow">单位 mm / kg · 柜门在 X 轴末端</span><span id="status-result"></span>${button("undo", "", "undo-2", "icon-btn ghost", 'aria-label="撤销" title="撤销 Ctrl+Z"')}${button("redo", "", "redo-2", "icon-btn ghost", 'aria-label="重做" title="重做 Ctrl+Y"')}</footer>
  <dialog id="dialog"><form id="dialog-form"><div class="dialog-head"><h2 id="dialog-title"></h2>${button("close-dialog", "", "x", "ghost icon-btn", 'aria-label="关闭对话框"')}</div><div id="dialog-body" class="dialog-body"></div><div id="dialog-error" class="dialog-error" role="alert"></div><div class="dialog-footer">${button("close-dialog", "关闭")}<button type="submit" id="dialog-submit" class="primary">保存</button></div></form></dialog><div id="toast" class="toast hidden" role="status" aria-live="polite"></div><input id="import-file" type="file" accept="application/json,.json" hidden>`;
  try {
    scene = new SceneView($("#canvas-host"), {
      onSelect: (id,add=false) => selectGroup(id?[id]:[],add),
      onMarquee: (ids,add=false) => selectGroup(ids,add),
      onMove: (id, target) => manualMove(id, target),
      onPreview:updatePreview,
      onPlace:commitManual,
      onDoorStatus:doorStatus,
      onNotice:toast,
    });
  } catch (e) {
    $("#canvas-host").innerHTML =
      `<div class="scene-fallback">3D 显示初始化失败：${esc(e.message)}。请在 Edge / Chrome 中启用图形加速后重试。其他计算与保存功能仍可使用。</div>`;
  }
  const manualBar=document.createElement('div');manualBar.className='manual-bar';manualBar.innerHTML=`<div class="row wrap">${button('tool-orbit','浏览视角','mouse-pointer-2')}${button('tool-move','手动调整','move')}${button('toggle-overlap','允许临时重叠：关','layers','','aria-pressed="false" title="仅放宽手动点放、拖动和坐标调整的碰撞限制；关闭不会自动消除已有重叠"')}${button('manual-cancel','结束放置','x','hidden')}</div><div id="overlap-notice" class="overlap-notice hidden" role="status">临时重叠已开启：可同层穿插；碰撞仍标红。关闭不会自动消除重叠，导出仍保留警告。</div><div id="manual-status" role="status" aria-live="polite">选择左侧货物的「手动摆放」，即可点击指定位置。</div>`;$('.stage').append(manualBar);
  const doorBar=document.createElement('div');doorBar.id='door-controls';doorBar.className='door-controls row wrap';doorBar.innerHTML=`<button id="toggle-doors" data-action="toggle-doors">关闭双门</button><button data-action="door-boxes" aria-pressed="false">柜门碰撞箱：关</button><span id="door-status" role="status" aria-live="polite"></span>`;manualBar.append(doorBar);
  const heatBar=document.createElement('label');heatBar.className='heatmap-control';heatBar.innerHTML=`重量与风险热力图<select id="heatmap-select">${Object.entries(HEATMAPS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select>`;manualBar.append(heatBar);
  const batchBar=document.createElement('div');batchBar.className='batch-toolbar row wrap';batchBar.innerHTML=`${button('tool-select','框选')}${button('select-visible','全选可见')}${button('select-layer','选择本层')}${button('editor-top','二维俯视')}${button('editor-side','二维侧视')}${button('editor-off','三维')}${button('only-layer','仅看当前层：关')}`;manualBar.prepend(batchBar);
  manualBar.id='scene-tool-drawer';manualBar.classList.add('hidden');
  manualBar.insertAdjacentHTML('afterbegin',`<div class="row between drawer-heading"><strong>摆放与视图工具</strong>${button('toggle-tools','收起','x')}</div>`);
  // Keep live placement validity visible even while the tools are collapsed.
  const liveStatus=$('#manual-status');liveStatus.classList.add('stage-live-status','hidden');$('.stage').append(liveStatus);
  $('.stage-tools').insertAdjacentHTML('afterbegin',button('toggle-tools','','settings-2','icon-btn','aria-label="展开摆放工具" title="展开 / 收起摆放工具" aria-expanded="false" aria-controls="scene-tool-drawer"'));
  $('.stage-tools').insertAdjacentHTML('beforeend',button('toggle-spaces','','scan','icon-btn','aria-label="显示或隐藏空余空间" title="显示 / 隐藏空余空间" aria-pressed="false"'));
  const spaceLegend=document.createElement('div');spaceLegend.id='space-legend';spaceLegend.className='space-legend hidden';$('.stage').append(spaceLegend);
  const heatLegend=document.createElement('div');heatLegend.id='heatmap-legend';heatLegend.className='heatmap-legend hidden';heatLegend.innerHTML='<strong id="heatmap-title"></strong><div class="heat-gradient"></div><div class="row between"><span>低</span><span>中</span><span>高</span></div><p id="heatmap-summary"></p>';$('.stage').append(heatLegend);
  $('#heatmap-select').addEventListener('change',e=>{ui.heatmap=e.target.value;render();});
  $('#path-speed').addEventListener('change',e=>{if(pathPlayer)pathPlayer.speed=Number(e.target.value);});
  $('#path-progress').addEventListener('input',e=>{if(pathPlayer){pathPlayer.progress=Number(e.target.value);pathPlayer.playing=false;paintPathPlayer();}});
  $('#dialog').addEventListener('close',disposeCargoPreview);
  $('.appbar .row').insertAdjacentHTML('afterbegin',button('workbench','作业工具','settings-2','ghost'));
  const flatHost=document.createElement('div');flatHost.id='editor-2d';flatHost.className='editor-2d hidden';$('#canvas-host').append(flatHost);
  editor2d=new Editor2D(flatHost,{select:selectGroup,move:delta=>commitBatch({kind:'move',...delta}),preview:point=>updatePreview({...ui.pending,...point}),place:point=>{const result=updatePreview({...ui.pending,...point});commitManual(result.item);},notice:toast});
  $("#dialog-form").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const submitted=dialogSubmit,button=$('#dialog-submit'),label=button.textContent;
      const result=submitted?.(Object.fromEntries(new FormData(e.target)), e.target);
      if(result&&typeof result.then==='function'){
        if(dialogSubmit===submitted){dialogPending=true;button.disabled=true;button.textContent='处理中…';$$('#dialog [data-action="close-dialog"]').forEach(b=>b.disabled=true);}
        result.catch(error=>{$('#dialog-error').textContent=error.message;}).finally(()=>{dialogPending=false;$$('#dialog [data-action="close-dialog"]').forEach(b=>b.disabled=false);if(dialogSubmit===submitted){button.disabled=false;button.textContent=label;}});
      }
    } catch (e) {
      $("#dialog-error").textContent = e.message;
    }
  });
  $('#dialog').addEventListener('cancel',e=>{if(dialogPending)e.preventDefault();else disposeCargoPreview();});
  $("#project-name").addEventListener("change", (e) => {
    const name = e.target.value.trim();
    if (name) transaction(() => (project.name = name));
  });
  $("#layer-select").addEventListener("change", (e) => {
    ui.layer = e.target.value;
    render();
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (b && !b.disabled)
      handle(b.dataset.action, b).catch((error) => toast(error.message, true));
  });
  $("#import-file").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 12 * 1024 * 1024) throw Error("文件大于 12MB");
      const p = validateProject(JSON.parse(await f.text()));
      p.id = uid();
      p.name += " · 导入";
      await switchProject(p);
      toast("已导入为新方案，原方案保留");
    } catch (e) {
      toast(e.message, true);
    } finally {
      e.target.value = "";
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input,textarea,select") || $("#dialog").open) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      saveProject(true);
    } else if ((e.ctrlKey || e.metaKey) && key === "z") {
      e.preventDefault();
      handle(e.shiftKey ? "redo" : "undo");
    } else if ((e.ctrlKey || e.metaKey) && key === "y") {
      e.preventDefault();
      handle("redo");
    } else if (key === "r") handle(ui.pending?'manual-rotate':"rotate").catch(e=>toast(e.message,true));
    else if (key === "m")
      handle(ui.tool === "move" ? "tool-orbit" : "tool-move");
    else if (key === "delete") handle("delete-item");
    else if (key === "escape") {
      if(ui.pending){cancelManual();return;}
      ui.selected = null;
      render();
    }
    else if(['arrowleft','arrowright','arrowup','arrowdown','pageup','pagedown'].includes(key)&&current()){
      e.preventDefault();const i=current(),step=(project.settings.snap||1)*(e.shiftKey?10:1),next={...i};
      if(key==='arrowleft')next.x-=step;if(key==='arrowright')next.x+=step;if(key==='arrowup')next.y-=step;if(key==='arrowdown')next.y+=step;
      if(key==='pageup')next.z+=type(i.typeId).effectiveHeight;if(key==='pagedown')next.z=Math.max(0,next.z-type(i.typeId).effectiveHeight);
      manualMove(i.id,next);
    }
  });
}
function render(draw = true) {
  report = analyze(project, ui.mode);
  document.body.classList.toggle('photo-mode',!!ui.photo);
  if (ui.selected && !current()) ui.selected = null;
  if(!ui.selected)ui.selection=[];
  else if(!ui.selection.includes(ui.selected))ui.selection=[ui.selected];
  ui.selection=ui.selection.filter(id=>items().some(i=>i.id===id));
  $("#project-name").value = project.name;
  $("#save-state").textContent = lastSave;
  $$(".modes button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === ui.mode),
  );
  $$(".sidebar .side-tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.action === "side-" + ui.side),
  );
  $$(".inspector .side-tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.action === "right-" + ui.right),
  );
  const b = binFor(project, ui.mode);
  $("#stage-title").textContent =
    ui.mode === "container" ? project.container.name : "托盘码垛工作台";
  $("#stage-subtitle").textContent =
    `${n(b.length)} × ${n(b.width)} × ${n(b.height)} mm　/　${ui.mode === "container" ? "散装 · 整托 · 混装" : "先码托，再整托入柜"}`;
  $("#status-bin").textContent =
    ui.mode === "container"
      ? `${project.container.preset || "自定义"} · ${((b.length * b.width * b.height) / 1e9).toFixed(2)} m³`
      : `托盘 ${project.pallet.preset} · 不含底座可用高度 ${b.height} mm`;
  const errors = report.issues.filter((i) => i.level === "error").length;
  $("#status-result").innerHTML = errors
    ? `<span class="danger">${errors} 项需修正</span>`
    : `<span>${report.units ? n(report.units) + " 个装载单元 · " : ""}规则检查通过</span>`;
  $("#metrics").innerHTML = [
    ["已装货物", n(report.pieces), "件", `${n(report.units)} 个装载单元`],
    [
      "载货重量",
      n(report.weight, 1),
      "kg",
      `含${ui.mode === "container" ? "柜" : "托"}总重 ${n(report.gross, 1)} kg`,
    ],
    ["空间利用率", n(report.utilization * 100, 1), "%", `按有效外形体积估算`],
    ["余量空间", n(report.freeVolume / 1e9, 2), "m³", `不等同于连续可用空间`],
  ]
    .map(
      ([l, v, u, s]) =>
        `<div class="metric"><div class="metric-label">${l}</div><div class="metric-value mono">${v}<span>${u}</span></div><div class="metric-sub">${s}</div></div>`,
    )
    .join("");
  const maxLevel = Math.max(0, ...Object.values(report.levels));
  if (ui.layer !== "all" && Number(ui.layer) > maxLevel) ui.layer = "all";
  $("#layer-select").innerHTML =
    '<option value="all">全部层</option>' +
    Array.from(
      { length: maxLevel },
      (_, i) => `<option value="${i + 1}">第 1–${i + 1} 层</option>`,
    ).join("");
  $("#layer-select").value = ui.layer;
  $("#side-content").innerHTML =
    ui.side === "cargo"
      ? cargoPanel()
      : ui.side === "bin"
        ? binPanel()
        : templatePanel();
  $("#inspector-content").innerHTML =
    ui.right === "plan"
      ? batchPanel()+manualPanel()+planPanel()
      : ui.right === "checks"
        ? checkPanel()
        : listPanel();
  $('[data-action="undo"]').disabled = !history.length;
  $('[data-action="redo"]').disabled = !future.length;
  for (const a of ["rotate", "drop"])
    $(`[data-action="${a}"]`).disabled = !current() || current().locked;
  for (const a of ["boxes", "center"])
    $(`[data-action="${a}"]`).classList.toggle("active", ui[a]);
  $$('[data-action^="tool-"]').forEach((b) =>
    b.classList.toggle("active", !ui.pending && b.dataset.action === "tool-" + ui.tool),
  );
  icons();
  bindPanelInputs();
  for(const [name,key] of [['manual-repeat','repeat'],['manual-lock','lockNew'],['manual-snap','snapping']])$(`[name="${name}"]`)?.addEventListener('change',e=>{ui[key]=e.target.checked;});
  $('.manual-bar [data-action="manual-cancel"]')?.classList.toggle('hidden',!ui.pending);
  $('#manual-status').textContent=ui.pending?'移动鼠标到场景：绿框可放，点击落位；R 旋转，Esc 退出。':ui.tool==='move'?'拖动已有货物；选中后可改坐标，方向键微调，PageUp / PageDown 升降一层。':'选择左侧货物的「手动摆放」，即可点击指定位置。';
  $('#manual-status').classList.remove('invalid','overlap-warning');
  $('#manual-status').classList.toggle('hidden',!ui.pending&&ui.tool!=='move');
  const overlapButton=$('[data-action="toggle-overlap"]');overlapButton.textContent=`允许临时重叠：${ui.allowOverlap?'开':'关'}`;overlapButton.setAttribute('aria-pressed',String(ui.allowOverlap));overlapButton.classList.toggle('overlap-on',ui.allowOverlap);$('#overlap-notice').classList.toggle('hidden',!ui.allowOverlap);
  $('#scene-help').textContent=ui.pending?'点击放置 · R 旋转 · Esc 结束':ui.tool==='move'?'拖动未锁定货物 · 滚轮缩放':'左键旋转 · 滚轮缩放 · 按住中键前后拖动推进 / 后退';
  $('#door-controls').classList.toggle('hidden',ui.mode!=='container');
  const doorBoxButton=$('[data-action="door-boxes"]');doorBoxButton.textContent=`柜门碰撞箱：${ui.doorBoxes?'开':'关'}`;doorBoxButton.setAttribute('aria-pressed',String(ui.doorBoxes));
  $('.manual-bar').classList.toggle('hidden',!ui.toolsOpen);
  $('.stage-tools [data-action="toggle-tools"]').setAttribute('aria-expanded',String(!!ui.toolsOpen));
  $('.stage-tools [data-action="toggle-tools"]').classList.toggle('active',!!ui.toolsOpen);
  const spaceButton=$('[data-action="toggle-spaces"]');spaceButton.classList.toggle('active',!!ui.spaces);spaceButton.setAttribute('aria-pressed',String(!!ui.spaces));
  $('#heatmap-select').value=ui.heatmap;$('#heatmap-legend').classList.toggle('hidden',ui.heatmap==='off');$('#heatmap-title').textContent=HEATMAPS[ui.heatmap];$('#heatmap-summary').textContent=heatSummary(ui.heatmap,report,ui.mode==='pallet'?project.types:allTypes(project));
  if(draw||!ui.spaceData)ui.spaceData=freeSpaces(project,ui.mode,report);
  const spaceData=ui.spaceData;
  $('#space-legend').classList.toggle('hidden',!ui.spaces);
  $('#space-legend').innerHTML=`<div class="row between"><strong>空余空间 · ${ui.editor2d?'二维投影':'三维包络'}</strong>${button('toggle-spaces','隐藏')}</div><p class="hint">按完整布局计算，不随隐藏层变空；最多展示 12 个空区${spaceData.partial?'（部分结果）':''}，并非全部可装。</p>${spaceData.regions.map(a=>`<div><strong>#${a.id} · ${a.dim}</strong><p>${esc(a.reason)}</p></div>`).join('')||'<p>未识别到大于容差的矩形空区。</p>'}`;
  if(ui.right==='plan'){
    const chosen=candidates[candidateIndex];
    const stops={'unit-limit':'达到 5000 个装载单元上限；不是空间已满','time-limit':'达到搜索时间预算；仍可能有可行位置','points-exhausted':'已尝试的候选位置用尽；不是不可再装的证明','stock-or-weight':'当前自动规格受库存或剩余载重限制','row-search':'已比较同规格横竖行组合；不是全局最优证明','pattern-search':'已完成指定软包阵列并通过规则检查；不是全局最优证明'};
    const rejected=Object.entries(chosen?.rejected||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const remaining=(ui.mode==='pallet'?project.types:allTypes(project)).filter(t=>(report.used[t.id]||0)<t.quantity&&!t.isBase);
    $('#inspector-content').insertAdjacentHTML('beforeend',`<section class="packing-explanation"><div class="divider"></div><h3>未装完与空余原因</h3>${chosen?`<p class="hint">${stops[chosen.termination]||'搜索结束'}${rejected.length?`。搜索中常见拒绝：${rejected.map(([k,v])=>`${k} ${v} 次`).join('、')}（尝试次数，不是未装件数）`:''}</p>`:''}${remaining.map(t=>`<div class="remaining-item"><strong>${esc(t.name)} · 剩余 ${t.quantity-(report.used[t.id]||0)} 件</strong><p>${esc(remainingReason(project,t,report,ui.mode))}</p></div>`).join('')||'<p class="hint">库存已装完。</p>'}${button('toggle-spaces',ui.spaces?'隐藏空间提示':'在场景中查看空余空间','scan','full')}<p class="hint">${spaceData.regions.slice(0,3).map(a=>`#${a.id} ${a.dim}：${a.short}`).join('<br>')}</p></section>`);
  }
  if(ui.allowOverlap)$('#scene-help').textContent+=' · 临时重叠已开启（草稿）';
  icons();
  if (draw) scene?.update(project, ui.mode, report, ui);
  scene?.setAutoRotate?.(ui.photoRotate);
  scene?.setBackground?.(ui.photoBackground);
  scene?.setTool(ui.pending?'place':ui.tool);
  scene?.notifyDoors(true);
  editor2d?.update(project,ui.mode,report,ui);
  $('[data-action="only-layer"]').textContent=`仅看当前层：${ui.onlyLayer?'开':'关'}`;
  $('#canvas-host > canvas')?.classList.toggle('hidden',!!ui.editor2d);
  if(ui.editor2d)$('#scene-help').textContent='单击选择 · Ctrl 多选 · 空白拖框 · 右键平移 · 滚轮缩放';
  $('[data-action="photo-rotate"]')?.replaceChildren(document.createTextNode(`自动旋转：${ui.photoRotate?'开':'关'}`));
  $('[data-action="photo-walls"]')?.replaceChildren(document.createTextNode(`墙体：${ui.walls?'开':'关'}`));
  const bg={studio:'影棚',white:'纯白',night:'深色'}[ui.photoBackground];$('[data-action="photo-background"]')?.replaceChildren(document.createTextNode(`背景：${bg}`));
}
function cargoCard(t) {
  const used = report.used[t.id] || 0;
  return `<article class="cargo-card" style="--cargo-color:${t.color}">
    <div class="cargo-top"><div class="cargo-icon">${icon(t.kind==='pallet'?'layers':t.kind==='box'?'box':'package')}</div><div><div class="cargo-name" title="${esc(t.name)}">${esc(t.name)}</div><div class="cargo-dim">${n(t.effectiveLength)} × ${n(t.effectiveWidth)} × ${n(t.effectiveHeight)} mm</div></div></div>
    <div class="cargo-meta"><span>${kindName[t.kind]} · ${n(t.weight,1)} kg</span><span class="mono">${used} / ${t.quantity} ${t.kind==='pallet'?'托':'件'}</span></div>
    <p class="hint" style="margin:0 0 10px">最高第 ${t.maxLayers} 层 · 上方负载 ≤ ${n(t.maxLoad)} kg（铅笔内修改）</p>
    ${t.kind!=='box'&&t.kind!=='pallet'&&t.height!==t.effectiveHeight?`<div class="compressed">高度变化 ${n((1-t.effectiveHeight/t.height)*100,1)}% · 有效尺寸可调</div>`:''}
    <div class="cargo-actions">${button('manual-place','手动摆放','mouse-pointer-2','light grow',`data-id="${t.id}"`)}${button('edit-cargo','','pencil','icon-btn',`data-id="${t.id}" aria-label="编辑 ${esc(t.name)}"`)}</div>
    <div class="cargo-actions secondary">${button('place','自动找一个空位','plus','ghost grow',`data-id="${t.id}"`)}${t.kind==='pallet'?button('edit-assembly','明细','layers','ghost',`data-id="${t.id}"`):''}</div></article>`;
}
function cargoPanel() {
  return `<div class="section-heading"><h3>货物清单 <span class="muted small">${project.types.length}</span></h3>${button("new-cargo", "", "plus", "ghost icon-btn", 'aria-label="新增货物"')}</div>${project.types.map(cargoCard).join("")}${button("new-cargo", "自定义货物规格", "plus", "full add-cargo")}<div class="divider"></div><div class="section-heading"><h3>整托库 <span class="muted small">${project.assemblies.length}</span></h3>${button("mode-pallet", "", "arrow-right", "ghost icon-btn", 'aria-label="前往码托"')}</div>${ui.mode === "container" ? project.assemblies.map(cargoCard).join("") : ""}${!project.assemblies.length ? '<p class="hint">在「托盘码垛」摆好货物，保存成整托后，即可整体放进集装箱。</p>' : ""}${ui.mode === "pallet" ? button("save-assembly", "保存为整托", "layers", "full") : ""}<div class="note-card">${ui.mode === "container" ? "货物和整托共用实际库存。自动配载保留锁定货物，并重新排列未锁定部分。" : "这里是一托货物的工作区，不会重复扣减柜内库存。可手动摆放，也可自动码托。"}</div>`;
}
function customSkinDialog(){
  const current=project.container.skinColor||resolveContainerSkin(project.container).base;
  dialog('自定义集装箱皮肤',`<p class="dialog-intro">选择柜体主色，门板、加强筋、门框和尺寸标注会自动生成协调的深浅层次。仅改变显示效果，不改变尺寸、碰撞箱或配载计算。</p><label class="skin-custom-field">柜体主色<input type="color" name="skinColor" value="${current}"></label><div id="skin-color-preview" class="skin-color-preview" style="--skin-color:${current}"><span></span><span></span><span></span></div>`,v=>{
    const color=String(v.skinColor||'');if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('请选择有效颜色');
    transaction(()=>{project.container.skin='custom';project.container.skinColor=color;});closeDialog();toast('已应用自定义柜体皮肤');
  });
  $('#dialog [name="skinColor"]').addEventListener('input',e=>$('#skin-color-preview').style.setProperty('--skin-color',e.target.value));
}
function skinStudioDialog(){
  const a=containerAppearance(project.container);
  dialog('集装箱皮肤 2.0',`<p class="dialog-intro">把公司名、柜号、警示语和本地 Logo 做成侧壁 / 柜门贴花。新旧程度只增加视觉磨损，不影响柜内尺寸、门碰撞或装载计算。</p><div class="fields two">${txt('companyName','公司名称',a.companyName)}${txt('containerNo','柜号',a.containerNo)}${txt('warningText','警示文字',a.warningText)}${num('condition','新旧 / 锈蚀程度（0新–100旧）',a.condition,0,1,'max="100"')}</div><label>本地 Logo（PNG / JPG / WebP，最多 6MB）<input id="container-logo" type="file" accept="image/png,image/jpeg,image/webp"></label>${a.logo?`<p class="asset-current">当前 Logo：${esc(a.logo.name)}</p>${check('removeLogo','移除当前 Logo',false)}`:''}<div class="skin-decal-preview"><strong>${esc(a.companyName||'YOUR COMPANY')}</strong><span>${esc(a.containerNo||'CONT-000000')}</span><small>${esc(a.warningText||'MAX GROSS / CAUTION')}</small></div>`,async v=>{
    const next={companyName:String(v.companyName||''),containerNo:String(v.containerNo||''),warningText:String(v.warningText||''),condition:Number(v.condition),...(a.logo&&!v.removeLogo?{logo:a.logo}:{})};
    const file=$('#container-logo').files[0];if(file){if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Logo 只支持 PNG/JPG/WebP');next.logo=await uploadAsset(project.id,file);}
    const test=clone(project);test.container.appearance=next;validateProject(test);checkpoint();project=test;closeDialog();changed();toast('集装箱贴花与新旧程度已保存');
  },'应用外观');
}
function containerSkinPanel(c){
  const active=c.skin||'classic';
  return `<div class="divider"></div><div class="section-heading"><h3>集装箱皮肤</h3><span class="tag">${esc(containerSkinName(c))}</span></div><p class="hint" style="margin:8px 0 12px">只改变三维柜体外观；尺寸、碰撞、重量和自动配载不变。</p><div class="skin-grid">${Object.entries(CONTAINER_SKINS).map(([id,s])=>button('container-skin',`<span class="skin-swatch" style="--skin-color:${s.base}"></span><span>${s.name}</span>`,'',`skin-choice ${active===id?'active':''}`,`data-id="${id}" aria-pressed="${active===id}"`)).join('')}${button('custom-skin',`<span class="skin-swatch custom" style="--skin-color:${c.skinColor||'#7a5ea8'}"></span><span>自定义</span>`,'',`skin-choice ${active==='custom'?'active':''}`,`aria-pressed="${active==='custom'}"`)}</div>${button('skin-studio','贴花 / Logo / 新旧程度','pencil','full light skin-studio-button')}`;
}
function binPanel() {
  const c = ui.mode === "container" ? project.container : project.pallet;
  return `<div class="section-heading"><h3>${ui.mode === "container" ? "集装箱规格" : "托盘规格"}</h3><div class="row">${ui.mode==='pallet'?button('pallet-designer','设计外形','pencil','ghost'):''}${button("edit-bin", "修改", "settings-2", "ghost")}</div></div><table class="summary-table"><tbody>${[
    ["长度", c.length + " mm"],
    ["宽度", c.width + " mm"],
    ["高度", c.height + " mm"],
    [ui.mode === "container" ? "最大载货" : "托盘承载", n(c.maxWeight) + " kg"],
    ["自重", n(c.tare) + " kg"],
    ...(ui.mode === "container"
      ? [
          ["柜门宽", c.doorWidth + " mm"],
          ["柜门高", c.doorHeight + " mm"],
        ]
      : [
          ["底座高度", c.baseHeight + " mm"],
          ["每侧超边", c.overhang + " mm"],
        ]),
  ]
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join(
      "",
    )}</tbody></table><div class="note-card">${ui.mode === "container" ? "内置规格用于快速开始。装柜前请按实际柜体、铭牌载重与柜门净尺寸核对。柜门位于 X 轴末端。" : "高度是含托总高；承载是货物净载荷。客户模板限重另按含托重量校验。超边范围只用于空间边界，实际支撑以托盘底面为准。"}</div>${ui.mode==='container'?containerSkinPanel(c):''}<div class="divider"></div><h3>摆放规则</h3><div class="stack" style="margin-top:15px">${num("minSupport", "最低支撑比例（%）", project.settings.minSupport, 1, 1, 'max="100" data-setting="minSupport"')}${num("gap", "自动排列水平间隙（mm）", project.settings.gap, 0, 1, 'data-setting="gap"')}${num("snap", "拖动网格步长（mm）", project.settings.snap, 1, 1, 'data-setting="snap"')}<p class="hint">承重按接触面积比例向下传递；属于静态几何估算。自动排列默认平放和水平 90° 转向。</p></div>`;
}
function templatePanel() {
  const current = project.templates.find(
    (t) => t.id === project.activeTemplate,
  );
  return `<div class="section-heading"><h3>客户规则库</h3>${button("new-template", "", "plus", "ghost icon-btn", 'aria-label="新建客户模板"')}</div><p class="hint" style="margin-bottom:14px">同一商超的地区、配送中心和货类可分别保存规则。初始值不代表官方标准。</p>${project.templates.map((t) => `<div class="template-card"><div class="row between"><strong>${esc(t.name)}</strong><span class="tag ${t.verified ? "good" : "warn"}">${t.verified ? "用户已核实" : "待核实"}</span></div><p class="hint">${esc(t.region || "地区待填")} / ${esc(t.warehouse || "配送中心待填")}</p><div class="row">${button("apply-template", t.id === project.activeTemplate ? "已应用" : "应用码托规则", "check", t.id === project.activeTemplate ? "light" : "", `data-id="${t.id}"`)}${button("edit-template", "", "pencil", "icon-btn", `data-id="${t.id}" aria-label="编辑模板"`)}</div></div>`).join("")}${button("new-template", "新建商超 / 客户模板", "plus", "full add-cargo")}${current ? `<div class="note-card">当前使用：${esc(current.name)}<br>${esc(current.labelDirection)}<br>${esc(current.notes)}${button("clear-template", "取消当前规则", "", "ghost full")}</div>` : ""}`;
}
function bagPatternControls(){
  const hasBag=(ui.mode==='pallet'?project.types:allTypes(project)).some(t=>['soft','woven'].includes(t.kind)&&t.auto!==false&&t.quantity>0);
  if(!hasBag)return '';
  const active=project.settings.bagPattern||'auto',options={auto:'自动比较',straight:'0°直排',rotated:'90°直排',brick:'砖墙错缝',alternating:'交替转向层'};
  return `<div class="control-group"><label>软包高级码放</label><div class="choice wrap bag-pattern-choice">${Object.entries(options).map(([id,label])=>button('bag-pattern',label,'',active===id?'active':'',`data-id="${id}"`)).join('')}</div><p class="hint" style="margin-top:8px">只生成通过边界、支撑、层数、承重和载重检查的候选；压缩尺寸仍由你填写。</p></div>`;
}
function planComparison(){
  if(candidates.length<2)throw Error('请先自动计算，至少生成两个候选方案');
  const b=binFor(project,ui.mode),types=project.types.filter(t=>!t.isBase);
  const stop={"unit-limit":'达到 5000 单元上限',"time-limit":'达到搜索时间预算',"points-exhausted":'候选位置用尽',"stock-or-weight":'库存或载重限制',"row-search":'横竖混排完成',"pattern-search":'指定软包阵列完成'};
  dialog('方案对比台',`<p class="dialog-intro">这些是同一次计算产生并通过当前规则检查的候选。自动结果不是全局最优证明；选择“应用此方案”会形成一个可撤销步骤。</p><div class="comparison-grid">${candidates.map((c,index)=>{const r=c.report,offset=r.center?Math.hypot((r.center.x/b.length-.5)*100,(r.center.y/b.width-.5)*100):0,remaining=types.reduce((sum,t)=>sum+Math.max(0,t.quantity-(r.used?.[t.id]||0)),0);return `<article class="comparison-card ${index===candidateIndex?'active':''}"><div class="row between"><strong>${index===0?'推荐 · ':''}${esc(c.label)}</strong><span class="tag">${r.valid?'通过':'需修正'}</span></div><div class="comparison-metrics"><span><b>${n(r.pieces)}</b> 件</span><span><b>${n(r.utilization*100,1)}%</b> 利用率</span><span><b>${n(r.weight,1)}</b> kg</span><span><b>${n(r.height)}</b> mm 高</span><span><b>${n(remaining)}</b> 原始库存剩余</span><span><b>${n(offset,1)}%</b> 平面偏心</span></div><p class="hint">${stop[c.termination]||'搜索完成'}${c.diagnostics?.perLayer?` · 每层 ${Array.isArray(c.diagnostics.perLayer)?c.diagnostics.perLayer.join(' / '):c.diagnostics.perLayer}`:''}</p>${button('compare-apply',index===candidateIndex?'当前方案':'应用此方案','check',index===candidateIndex?'light':'primary',`data-index="${index}" ${index===candidateIndex?'disabled':''}`)}</article>`;}).join('')}</div>`,null);
}
function planPanel() {
  const i = current(),
    t = i ? type(i.typeId) : null,
    b = binFor(project, ui.mode);
  return `<section>${i ? `<div class="selected-card"><div class="row between"><strong>${esc(t.name)}</strong><span class="tag">${i.locked ? "已锁定" : kindName[t.kind]}</span></div><p>第 ${report.levels[i.id] || 1} 层 · 上方负载 ${n(report.loads[i.id] || 0, 1)} kg</p></div><div class="fields three">${num("x", "X 长向", i.x, -100000, 1, 'data-position="x"')}${num("y", "Y 宽向", i.y, -100000, 1, 'data-position="y"')}${num("z", "Z 高度", i.z, 0, 1, 'data-position="z"')}</div><div class="row wrap" style="margin-top:12px">${button("lock", i.locked ? "解锁" : "锁定", i.locked ? "unlock" : "lock", "", i.locked ? "" : "")}${button("duplicate", "复制", "copy", "", i.locked ? "disabled" : "")}${button("delete-item", "", "trash-2", "icon-btn danger", 'aria-label="删除选中货物"')} ${button("angle", `${n(i.rotation)}°`, "rotate-cw", "", i.locked ? "disabled" : "")}</div><div class="row wrap" style="margin-top:8px">${button("array", "批量阵列", "grid2-x2", "grow")}${t.kind === "pallet" ? button("unpack", "解散整托", "package") : ""}${button("deselect", "取消选择", "", "ghost")}</div><div class="divider"></div>` : ""}<div class="section-label">${ui.mode === "container" ? "LOAD OPTIMIZER" : "PALLET OPTIMIZER"}</div><h3 style="margin-bottom:17px">${ui.mode === "container" ? "自动配载" : "自动码托"}</h3><div class="control-group"><label>优化目标</label><div class="choice">${button("objective-count", "数量优先", "box", project.settings.objective === "count" ? "active" : "")}${button("objective-volume", "空间优先", "maximize-2", project.settings.objective === "volume" ? "active" : "")}</div></div><div class="control-group"><label>计算深度</label><div class="choice">${button("depth-fast", "快速 · 2+ 组", "", project.settings.depth === "fast" ? "active" : "")}${button("depth-deep", "深度 · 4+ 组", "", project.settings.depth === "deep" ? "active" : "")}</div><p class="hint" style="margin-top:8px">常规搜索预算：快速 12 秒、深度 40 秒；同规格额外比较横竖混排，校验与绘制另需时间。</p></div>${bagPatternControls()}${button("optimize", ui.mode === "container" ? "计算装柜方案" : "计算码托方案", "play", "primary full optimize-btn")}<div class="row wrap" style="margin-top:9px">${button("lock-all", "锁定全部", "lock", "ghost grow")}${button("unlock-all", "解锁全部", "unlock", "ghost grow")}</div>${candidates.length ? `<div class="divider"></div><div class="section-heading"><h3>候选方案</h3><span class="tag">${candidates.length} 组</span></div>${candidates.length>1?button("compare-plans","打开方案对比台","chart-no-axes-combined","full light"):""}<div class="candidates">${candidates.map((c, index) => `<button class="candidate ${candidateIndex === index ? "active" : ""}" data-action="candidate" data-index="${index}"><p><span>${index === 0 ? "推荐 · " : ""}${c.label}</span><strong>${c.report.pieces} 件</strong></p><small>${n(c.report.utilization * 100, 1)}% 利用率 · ${n(c.report.weight, 1)} kg${c.limited ? c.termination==='unit-limit'?" · 达到 5000 单元上限":" · 达到搜索时间预算" : ""}${!c.report.valid ? " · 有待修正项" : ""}</small></button>`).join("")}</div>` : ""}${ui.mode === "pallet" ? `<div class="divider"></div>${button("save-assembly", "保存整托，准备入柜", "layers", "full light")}` : ""}</section><section><div class="divider"></div><div class="section-heading"><h3>装载校验</h3><span class="tag ${report.valid ? "good" : "bad"}">${report.valid ? "通过" : "需修正"}</span></div><div class="rule-line"><span>载重使用</span><strong>${n(report.weight)} / ${n(b.maxWeight)} kg</strong></div><div class="bar"><span style="width:${(report.weight / b.maxWeight) * 100}%"></span></div><div class="rule-line"><span>装载高度</span><strong>${n(report.height)} / ${n(b.height)} mm</strong></div><div class="rule-line"><span>锁定单元</span><strong>${items().filter((i) => i.locked).length} 个</strong></div>${report.issues.slice(0, 3).map(issueButton).join("")}${report.issues.length > 3 ? button("right-checks", `查看全部 ${report.issues.length} 项`, "chevron-right", "ghost full") : ""}${!report.issues.length ? '<p class="hint">碰撞、边界、支撑与重量检查通过。</p>' : ""}<div class="divider"></div>${button("clear-items", "清空当前工作区", "trash-2", "ghost full danger")}<p class="footer-tip">自动计算保留锁定货物。数量、体积、压缩尺寸与库存都参与计算；软袋采用可调外形包络。</p></section>`;
}
function issueButton(issue) {
  return `<button class="issue ${issue.level === "warning" ? "warn" : ""}" data-action="focus-issue" data-id="${issue.ids[0] || ""}">${icon("triangle-alert")}<span>${esc(issue.text)}</span></button>`;
}
function checkPanel() {
  const b = binFor(project, ui.mode),
    c = report.center;
  return `<section><div class="section-heading"><h3>规则检查</h3><span class="tag ${report.valid ? "good" : "bad"}">${report.issues.length} 项提示</span></div>${report.issues.map(issueButton).join("") || '<div class="empty-state">✓ 当前装载通过已启用的规则检查</div>'}<div class="divider"></div><h3>重量与重心</h3><div class="rule-line"><span>货物及已装托盘</span><strong>${n(report.weight, 1)} kg</strong></div><div class="rule-line"><span>含${ui.mode === "container" ? "柜" : "工作台托盘"}总重</span><strong>${n(report.gross, 1)} kg</strong></div>${c ? `<div class="rule-line"><span>X / Y / Z</span><strong>${n(c.x)} / ${n(c.y)} / ${n(c.z)} mm</strong></div><p class="hint">长向 ${n((c.x / b.length) * 100, 1)}%，宽向 ${n((c.y / b.width) * 100, 1)}%。这是已装货物重心，不含柜体；码托时 Z 从底座上表面起算。</p>` : ""}${button("center", ui.center ? "隐藏重心" : "在 3D 中显示重心", "target", "full ghost")}<p class="footer-tip">通过规则检查不等同于运输安全认证。未仿真软袋真实受力、车辆振动、叉车轨迹或地板局部载荷。请按现场条件复核。</p></section><section><div class="divider"></div><h3>未装清单</h3>${
    (ui.mode === "pallet" ? project.types : allTypes(project))
      .filter((t) => (report.used[t.id] || 0) < t.quantity)
      .map(
        (t) =>
          `<div class="remaining-item"><div class="row between"><span>${esc(t.name)}</span><strong>${t.quantity - (report.used[t.id] || 0)} ${t.kind === "pallet" ? "托" : "件"}</strong></div><p>${t.mustLoad ? "必须装完 · " : ""}${remainingReason(project, t, report, ui.mode)}</p></div>`,
      )
      .join("") ||
    '<p class="hint" style="margin-top:12px">库存已全部装入。</p>'
  }<p class="footer-tip">整托库的“托数”是允许使用的组合上限，实际还受其中每种货物库存限制。</p></section>`;
}
function listPanel() {
  return `<section><div class="section-heading"><h3>摆放明细</h3><span class="tag">${items().length} 单元</span></div><p class="hint">点击定位货物。坐标按 X 长向、Y 宽向、Z 高度显示。</p>${
    items()
      .slice(0, 250)
      .map(
        (i, index) =>
          `<div class="list-item ${i.id === ui.selected ? "selected" : ""}"><span class="idx">${index + 1}</span><button class="ghost grow" data-action="select-item" data-id="${i.id}" style="justify-content:flex-start;white-space:normal;text-align:left">${esc(type(i.typeId).name)}${i.locked ? icon("lock") : ""}</button><span class="small muted">${n(i.x)}, ${n(i.y)}, ${n(i.z)}</span></div>`,
      )
      .join("") ||
    '<div class="empty-state">从左侧放入货物，或计算自动配载方案</div>'
  }${items().length > 250 ? '<p class="hint">列表仅显示前 250 项；导出包含完整明细。</p>' : ""}</section><section><div class="divider"></div><h3>装载步骤预览</h3><p class="hint" style="margin:10px 0">按柜内深处优先、底部优先排序。用于装载参考，不包含完整搬运路径验证。</p>${button("sequence", "按装载顺序查看", "play", "full")}<label style="margin-top:12px">显示前 <span id="step-count">${ui.step || items().length}</span> 个单元<input type="range" id="sequence-range" min="0" max="${items().length}" value="${ui.step || items().length}" aria-label="装载步骤"></label>${button("show-all", "显示全部", "", "ghost full")}${button("exports", "导出清单和逐层图", "file-text", "full")}</section>`;
}
function bindPanelInputs() {
  $$("[data-setting]").forEach((input) =>
    input.addEventListener("change", () => {
      if (!input.reportValidity()) return;
      transaction(
        () => (project.settings[input.dataset.setting] = Number(input.value)),
      );
    }),
  );
  $$("[data-position]").forEach((input) => {
    input.disabled = current()?.locked;
    input.addEventListener("change", () => {
      if (!input.reportValidity()) return;
      manualMove(
        ui.selected,
        { ...current(), [input.dataset.position]: Number(input.value) },
        false,
      );
    });
  });
  $("#sequence-range")?.addEventListener("input", (e) => {
    ui.step = Number(e.target.value);
    $("#step-count").textContent = e.target.value;
    scene?.update(project, ui.mode, report, {
      ...ui,
      step: ui.step === 0 ? -1 : ui.step,
    });
  });
}

function editCargo(id = null) {
  const existing = id ? type(id) : null,
    t = clone(
      existing ||
        cargo({
          name: "新货物 " + (project.types.length + 1),
          color: COLORS[project.types.length % COLORS.length],
        }),
    );
  const pallet = t.kind === "pallet", appearance=cargoAppearance(t);
  dialog(
    pallet ? "整托属性" : existing ? "编辑货物规格" : "添加货物规格",
    `<p class="dialog-intro">${pallet ? "整托尺寸、重量来自码托明细。库存会同时核对其中的每种货物。" : "请输入装满后的包装外形尺寸。重量为单件毛重；袋子压缩后重量不变。"}</p><div class="fields">${txt("name", "货物名称", t.name, "required")}${
      pallet
        ? "<div></div>"
        : select("kind", "包装类型", t.kind, [
            ["box", "纸箱"],
            ["soft", "软包"],
            ["woven", "编织袋"],
          ])
    }${num("quantity", pallet ? "允许使用托数" : "可用库存（件）", t.quantity, 0, 1)}${num("weight", "单件毛重（kg）", t.weight, 0.001, 0.001, pallet ? "readonly" : "")}${num("priority", "装载优先级（越大越优先）", t.priority || 0, 0, 1)}${num("unload", "卸货顺序（越小越先卸）", t.unload || 1, 1, 1)}${txt("batch", "批次 / 客户", t.batch)}<label>识别颜色<input type="color" name="color" value="${t.color}"></label></div>${!pallet ? `<h3 class="subheading">包装外形 · mm</h3><div class="fields three">${num("length", "原始长", t.length, 1)}${num("width", "原始宽", t.width, 1)}${num("height", "原始高", t.height, 1)}</div><h3 class="subheading">用于计算的外形 · mm</h3><div class="fields three">${num("effectiveLength", "有效长", t.effectiveLength, 1)}${num("effectiveWidth", "有效宽", t.effectiveWidth, 1)}${num("effectiveHeight", "有效高", t.effectiveHeight, 1)}</div><div class="row wrap" style="margin-top:12px">${button("reset-effective", "与原始尺寸相同", "refresh-cw")}<label class="inline-unit" style="flex-direction:row">高度压缩 <input id="compression-input" type="number" min="0" max="60" value="${Math.max(0, Math.round((1 - t.effectiveHeight / t.height) * 100))}" style="width:70px"><span>%</span></label>${button("apply-compression", "应用压缩")}</div><p class="hint" style="margin-top:8px">压扁可能让长、宽变大，请据实调整有效尺寸。压缩比例由你确定，算法不会额外缩小包装。纸箱强制采用原始外形。</p>` : `<div class="note-card">${t.children.length} 件 / 托 · ${n(t.effectiveLength)} × ${n(t.effectiveWidth)} × ${n(t.effectiveHeight)} mm · 托盘自重 ${t.tare} kg</div>`}<h3 class="subheading">堆叠与朝向</h3><div class="fields">${num("maxLayers", "允许位于的最高堆叠层", t.maxLayers, 1, 1)}${num("maxLoad", "允许上方负载（kg）", t.maxLoad, 0)}${check("allowRotate", "允许水平转向", t.allowRotate)}${check("mustLoad", "要求全部装完", t.mustLoad)}</div>${existing ? `<div class="divider"></div>${button("remove-cargo", "删除此规格", "trash-2", "danger ghost", `data-id="${t.id}"`)}` : ""}`,
    async (v) => {
      const updated = { ...t };
      for (const k of ["name", "batch", "color"]) updated[k] = v[k];
      if (!pallet) updated.kind = v.kind;
      for (const k of [
        "quantity",
        "weight",
        "priority",
        "unload",
        "maxLayers",
        "maxLoad",
        ...(!pallet
          ? [
              "length",
              "width",
              "height",
              "effectiveLength",
              "effectiveWidth",
              "effectiveHeight",
            ]
          : []),
      ])
        updated[k] = Number(v[k]);
      updated.allowRotate = !!v.allowRotate;
      updated.mustLoad = !!v.mustLoad;
      updated.auto = !!v.auto;
      if(!pallet){
        updated.appearance={material:v.appearanceMaterial,pattern:v.appearancePattern,secondaryColor:v.appearanceSecondary,labelText:String(v.appearanceLabel||''),sku:String(v.appearanceSku||''),showArrows:!!v.appearanceArrows,...(appearance.logo&&!v.appearanceRemoveLogo?{logo:appearance.logo}:{})};
        const file=$('#cargo-logo').files[0];
        if(file){if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('货物 Logo 只支持 PNG/JPG/WebP');updated.appearance.logo=await uploadAsset(project.id,file);}
      }
      if (!updated.name.trim()) throw Error("请输入货物名称");
      if (updated.kind === "box") {
        updated.effectiveLength = updated.length;
        updated.effectiveWidth = updated.width;
        updated.effectiveHeight = updated.height;
      }
      if(!pallet&&updated.bagIdeal){const tol=updated.bagTolerance||[0,0,0];updated.bagIdeal=['effectiveLength','effectiveWidth','effectiveHeight'].map((k,i)=>updated[k]-(project.settings.bagScenario==='conservative'?tol[i]:0));if(updated.bagIdeal.some(n=>n<=0))throw Error('有效尺寸不能小于已设容差，请先调整袋子容差');}
      const test = clone(project);
      if (existing) {
        const list = pallet ? test.assemblies : test.types;
        list[list.findIndex((x) => x.id === t.id)] = updated;
      } else test.types.push(updated);
      validateProject(test);
      checkpoint();
      project = test;
      closeDialog();
      changed();
      toast(existing ? "规格已更新，已重新检查受影响的摆放" : "货物已添加");
    },
  );
  if(!pallet){
    $('#dialog-body h3.subheading:nth-of-type(3)')?.insertAdjacentHTML('beforebegin',`<h3 class="subheading cargo-appearance-heading">货物外观编辑</h3><div class="fields two cargo-appearance-fields">${select('appearanceMaterial','材质',appearance.material,Object.entries(CARGO_MATERIALS).map(([k,v])=>[k,v.name]))}${select('appearancePattern','表面图案',appearance.pattern,Object.entries(CARGO_PATTERNS))}<label>辅助颜色<input type="color" name="appearanceSecondary" value="${appearance.secondaryColor}"></label>${txt('appearanceSku','SKU',appearance.sku)}${txt('appearanceLabel','标签文字',appearance.labelText)}${check('appearanceArrows','显示向上箭头',appearance.showArrows)}</div><label>货物 Logo（PNG / JPG / WebP）<input id="cargo-logo" type="file" accept="image/png,image/jpeg,image/webp"></label>${appearance.logo?`<p class="asset-current">当前 Logo：${esc(appearance.logo.name)}</p>${check('appearanceRemoveLogo','移除当前 Logo',false)}`:''}<p class="hint">材质、图案、标签与 Logo 仅影响三维展示，不参与碰撞和计算；大量货物只在部分可见件上绘制标签以保持流畅。</p>`);
  }
  $('#dialog-body').insertAdjacentHTML('beforeend',`<div style="margin-top:16px">${check('auto','参与自动摆放（关闭后仅手动放入）',t.auto!==false)}</div>`);
  if(!pallet){
    const host=document.createElement('div');host.id='cargo-preview';host.className='cargo-preview';$('#dialog-body').prepend(host);
    try{cargoPreview=new CargoPreview(host,$('#dialog-form'));}catch(e){disposeCargoPreview();host.textContent='三维预览不可用，请检查浏览器图形加速；尺寸编辑和保存仍可使用。';}
  }
}
function palletDesigner(){
  const pallet=clone(project.pallet);let draft=ensurePalletDesign(pallet);
  const partNames={board:'面板',beam:'横梁',block:'脚墩',runner:'底板',rib:'网格筋',plate:'整面板'};
  dialog('托盘设计器',`<p class="dialog-intro">快速模板可以继续自由修改。零件的 Z 从托盘底部起算；只有勾选“顶面承重”的零件会参与货物底部支撑计算，装饰和 Logo 不参与承重。</p><div id="pallet-preview" class="pallet-preview"></div><div class="fields">${select('designPreset','快速结构',draft.preset,[...Object.entries(PALLET_DESIGN_PRESETS).map(([k,v])=>[k,v.name]),['custom','自由设计']])}${select('designMaterial','材质',draft.material,[['wood','木质'],['plastic','塑料'],['steel','钢制']])}<label>主体颜色<input type="color" name="designColor" value="${draft.color}"></label><label>底部 / 加强件颜色<input type="color" name="designSecondary" value="${draft.secondaryColor}"></label><div class="span">${txt('designLogo','Logo / 托盘文字',draft.logoText,'maxlength="80"')}</div></div><div class="divider"></div><div class="section-heading"><h3>结构零件 <span id="pallet-part-count" class="tag"></span></h3><div class="row">${button('', '添加面板','plus','', 'type="button" data-pallet-action="add-board"')}${button('', '添加脚墩','plus','', 'type="button" data-pallet-action="add-block"')}</div></div><p class="hint">自由设计最多 120 个零件。尺寸和坐标均为 mm；零件不能超出当前托盘 ${pallet.length} × ${pallet.width} × ${pallet.baseHeight} mm。</p><div id="pallet-parts" class="pallet-parts"></div>`,(v,form)=>{
    sync();draft.preset=v.designPreset;draft.material=v.designMaterial;draft.color=v.designColor;draft.secondaryColor=v.designSecondary;draft.logoText=v.designLogo||'';validatePalletDesign(pallet,draft);
    const test=clone(project);test.pallet.design=clone(draft);validateProject(test);checkpoint();project=test;closeDialog();changed();toast(`托盘外形已保存：${draft.components.length} 个结构零件`);
  },'保存托盘设计');
  const form=$('#dialog-form'),parts=$('#pallet-parts');
  const sync=()=>{
    draft.components.forEach((c,i)=>{for(const k of ['x','y','z','length','width','height']){const input=form.elements[`part_${i}_${k}`];if(input)c[k]=Number(input.value);}const kind=form.elements[`part_${i}_kind`];if(kind)c.kind=kind.value;c.support=!!form.elements[`part_${i}_support`]?.checked;});
    draft.material=form.elements.designMaterial.value;draft.color=form.elements.designColor.value;draft.secondaryColor=form.elements.designSecondary.value;draft.logoText=form.elements.designLogo.value;
  };
  const renderParts=()=>{
    parts.innerHTML=draft.components.map((c,i)=>`<details class="pallet-part" ${i<2?'open':''}><summary><span>${i+1}. ${partNames[c.kind]||c.kind}</span><span>${n(c.length)} × ${n(c.width)} × ${n(c.height)}</span></summary><div class="fields three">${select(`part_${i}_kind`,'类型',c.kind,Object.entries(partNames).map(([k,v])=>[k,v]))}${num(`part_${i}_x`,'X',c.x,0,'any')}${num(`part_${i}_y`,'Y',c.y,0,'any')}${num(`part_${i}_z`,'Z',c.z,0,'any')}${num(`part_${i}_length`,'长',c.length,.0001,'any')}${num(`part_${i}_width`,'宽',c.width,.0001,'any')}${num(`part_${i}_height`,'高',c.height,.0001,'any')}</div><div class="row between">${check(`part_${i}_support`,'顶面承重',c.support)}<div class="row"><button type="button" data-pallet-action="duplicate" data-index="${i}">复制</button><button type="button" class="danger ghost" data-pallet-action="delete" data-index="${i}">删除</button></div></div></details>`).join('');
    $('#pallet-part-count').textContent=`${draft.components.length} 个`;palletPreview?.update(pallet,draft);
  };
  palletPreview=new PalletPreview($('#pallet-preview'));renderParts();
  form.addEventListener('input',e=>{if(e.target.closest('#pallet-parts')||['designMaterial','designColor','designSecondary','designLogo'].includes(e.target.name)){sync();palletPreview.update(pallet,draft);}});
  form.elements.designPreset.addEventListener('change',e=>{if(e.target.value==='custom'){sync();draft.preset='custom';return;}draft=createPalletDesign(pallet,e.target.value);form.elements.designMaterial.value=draft.material;form.elements.designColor.value=draft.color;form.elements.designSecondary.value=draft.secondaryColor;form.elements.designLogo.value=draft.logoText;renderParts();});
  parts.addEventListener('click',e=>{const b=e.target.closest('[data-pallet-action]');if(!b)return;e.preventDefault();sync();const i=Number(b.dataset.index);if(b.dataset.palletAction==='delete'){if(draft.components.length===1)return toast('托盘至少保留一个零件',true);draft.components.splice(i,1);}else if(b.dataset.palletAction==='duplicate'){const c=clone(draft.components[i]);c.id=uid();c.x=Math.min(pallet.length-c.length,c.x+20);c.y=Math.min(pallet.width-c.width,c.y+20);draft.components.splice(i+1,0,c);}draft.preset='custom';form.elements.designPreset.value='custom';renderParts();});
  $('#dialog-body').addEventListener('click',e=>{const b=e.target.closest('[data-pallet-action]');if(!b||b.closest('#pallet-parts'))return;e.preventDefault();sync();const board=b.dataset.palletAction==='add-board';draft.components.push({id:uid(),kind:board?'board':'block',x:0,y:0,z:board?pallet.baseHeight-20:0,length:board?pallet.length:120,width:120,height:board?20:pallet.baseHeight,support:board});draft.preset='custom';form.elements.designPreset.value='custom';renderParts();});
}
function editBin() {
  const isContainer = ui.mode === "container",
    c = isContainer ? project.container : project.pallet;
  dialog(
    isContainer ? "集装箱尺寸与载重" : "托盘与码垛边界",
    `<div class="stack">${select('preset','通用规格',c.preset,[['custom','自定义'],...Object.keys(isContainer?CONTAINERS:PALLETS).map(k=>[k,isContainer?CONTAINERS[k].name:k+' mm'])])}
    <p class="hint">${isContainer?'请以实际柜体内尺寸、柜门净尺寸和铭牌载重为准。':'先填写空托盘本身的尺寸，再设置上方最多允许码多少高度的货物。两者相加才是含托总高。'}</p>
    <div class="fields three">${num('length','长度（mm）',c.length,1)}${num('width','宽度（mm）',c.width,1)}${isContainer?num('height','柜内高度（mm）',c.height,1):num('baseHeight','空托盘本身高度（mm）',c.baseHeight,1)}</div>
    ${!isContainer?`<div class="fields">${num('cargoHeight','托盘上方可码货高度（mm）',c.height-c.baseHeight,1)}${num('overhang','每侧允许超边（mm）',c.overhang,0)}</div><div id="pallet-height-result" class="height-result" role="status"></div><p id="pallet-height-warning" class="hint"></p>`:''}
    <div class="fields">${num('maxWeight','最大载货（kg）',c.maxWeight,1)}${num('tare','自重（kg）',c.tare,0)}${isContainer?num('doorWidth','柜门净宽（mm）',c.doorWidth,1)+num('doorHeight','柜门净高（mm）',c.doorHeight,1):''}</div></div>`,
    (v) => {
      const next = { ...c, preset: v.preset };
      for (const k of [
        "length",
        "width",
        "maxWeight",
        "tare",
        ...(isContainer
          ? ["height", "doorWidth", "doorHeight"]
          : ["baseHeight", "overhang"]),
      ])
        next[k] = Number(v[k]);
      if(!isContainer){next.height=next.baseHeight+Number(v.cargoHeight);if(c.design&&(next.length!==c.length||next.width!==c.width||next.baseHeight!==c.baseHeight))next.design=resizePalletDesign(c.design,c,next);}
      if (!isContainer && next.height <= next.baseHeight)
        throw Error("含托总高必须大于底座高度");
      next.name = isContainer
        ? v.preset === "custom"
          ? "自定义集装箱"
          : CONTAINERS[v.preset].name
        : c.name;
      const test = clone(project);
      test[isContainer ? "container" : "pallet"] = next;
      validateProject(test);
      checkpoint();
      project = test;
      closeDialog();
      changed();
      scene?.fit(ui.view);
    },
  );
  const updateHeight=()=>{if(isContainer)return;const form=$('#dialog-form'),base=Number(form.elements.baseHeight.value),cargoHeight=Number(form.elements.cargoHeight.value);$('#pallet-height-result').textContent=`空托盘 ${n(base)} + 货物 ${n(cargoHeight)} = 含托总高 ${n(base+cargoHeight)} mm`;const shortest=Math.min(...project.types.filter(t=>!t.isBase&&t.quantity>0).map(t=>t.effectiveHeight));$('#pallet-height-warning').textContent=Number.isFinite(shortest)&&cargoHeight<shortest?`注意：当前最矮货物也有 ${shortest} mm，可码货高度 ${cargoHeight} mm 连一层也放不下。`:'可码货高度与客户的含托限高需同时满足。';};
  if(!isContainer){for(const name of ['baseHeight','cargoHeight'])$(`#dialog [name="${name}"]`).addEventListener('input',updateHeight);updateHeight();}
  $('#dialog [name="preset"]')?.addEventListener("change", (e) => {
    const v = (isContainer ? CONTAINERS : PALLETS)[e.target.value];
    if (v)
      for (const [k, val] of Object.entries(v)) {
        const input = $(`#dialog [name="${k}"]`);
        if (input) input.value = val;
      }
    if(v&&!isContainer)$('#dialog [name="cargoHeight"]').value=v.height-v.baseHeight;
    updateHeight();
  });
}
function editTemplate(id = null) {
  const t = clone(
    project.templates.find((t) => t.id === id) || makeRetailTemplate(),
  );
  dialog(
    id ? "编辑客户规则" : "新建商超 / 客户规则",
    `<p class="dialog-intro">这些字段用于录入实际客户规范。商超名称仅是分类，不自动附带官方规则。核实状态由你依据来源确认。</p><div class="fields">${txt("name", "客户 / 商超名称", t.name, 'required list="retailers"')}<datalist id="retailers">${RETAILERS.map((n) => `<option value="${n}">`).join("")}</datalist>${txt("region", "国家 / 地区", t.region)}${txt("warehouse", "配送中心", t.warehouse)}${txt("category", "适用货类", t.category)}${txt("source", "规范来源 / 文件编号", t.source)}${txt("revision", "版本 / 日期", t.revision)}${num("palletLength", "托盘长度（mm）", t.palletLength, 1)}${num("palletWidth", "托盘宽度（mm）", t.palletWidth, 1)}${num("maxHeight", "含托最大高度（mm）", t.maxHeight, 1)}${num("maxWeight", "含托最大重量（kg）", t.maxWeight, 1)}${check("allowMixed", "允许混合货物码托", t.allowMixed)}${check("verified", "已按来源人工核实", t.verified)}<div class="span">${txt("labelDirection", "标签 / 朝向要求（人工核对）", t.labelDirection)}</div><label class="span">其他规则与备注<textarea name="notes" rows="3">${esc(t.notes)}</textarea></label></div>`,
    async (v) => {
      const next = {
        ...t,
        ...v,
        verified: !!v.verified,
        allowMixed: !!v.allowMixed,
      };
      delete next.ruleFiles;
      const files=[...$('#rule-files').files];
      if((t.attachments||[]).length+files.length>10)throw Error('每条客户规则最多 10 个附件');
      for (const k of ["palletLength", "palletWidth", "maxHeight", "maxWeight"])
        next[k] = Number(v[k]);
      if (next.verified && (!next.source.trim() || !next.revision.trim()))
        throw Error("标记已核实前，请填写规范来源和版本 / 日期");
      if(next.validFrom&&next.validTo&&next.validFrom>next.validTo)throw Error('失效日期不能早于生效日期');
      next.attachments=[...(t.attachments||[])];for(const file of files)next.attachments.push(await uploadAsset(project.id,file));
      const test = clone(project);
      if (id)
        test.templates[test.templates.findIndex((t) => t.id === id)] = next;
      else test.templates.push(next);
      validateProject(test);
      checkpoint();
      project = test;
      closeDialog();
      ui.side = "templates";
      changed();
    },
  );
  $('#dialog-body').insertAdjacentHTML('beforeend',`<h3 class="subheading">来源文件与有效期</h3><div class="fields"><label>生效日期<input type="date" name="validFrom" value="${esc(t.validFrom||'')}"></label><label>有效至（含当日）<input type="date" name="validTo" value="${esc(t.validTo||'')}"></label></div><label>添加来源附件（每个最多 6MB）<input id="rule-files" name="ruleFiles" type="file" multiple accept=".pdf,.xlsx,.docx,.txt,.csv,.png,.jpg,.jpeg,.webp"></label><p>${(t.attachments||[]).map(a=>`<a href="${assetURL(a)}" download>${esc(a.name)}</a>`).join(' · ')||'暂无附件'}</p><p class="hint">文件保留在本机，不自动读取为官方规则。核实范围以配送中心、货类及来源版本为准。</p>`);
}

function validPlacement(item, t, objects, { support = true } = {}) {
  const a = { item, t, ...shape(item, t) },
    bin = binFor(project, ui.mode);
  if (outside(a, bin)) return "货物超出边界";
  const doorError=ui.mode==='container'?scene?.doorPlacementIssue(item,t):null;if(doorError)return doorError;
  if (objects.some((b) => collides(a, b))) return "与其他货物发生碰撞";
  if (
    support &&
    supportsFor(a, objects, groundFor(project, ui.mode)).ratio * 100 + 0.01 < project.settings.minSupport
  )
    return "底部支撑不足";
  return null;
}
function addItem(id) {
  const t = type(id);
  if (ui.mode === "pallet" && t.kind === "pallet")
    throw Error("码托区不支持嵌套整托，请在集装箱中放入");
  const used = usedCounts(items(), allTypes(project));
  for (const [cid, count] of Object.entries(consumption(t)))
    if ((used[cid] || 0) + count > type(cid).quantity)
      throw Error(type(cid).name + " 库存不足");
  const result=findManualSlot(project,ui.mode,id),i=result.item;
  if(!i)throw Error(result.error);
  checkpoint();
  items().push(i);
  ui.selected = i.id;
  changed();
}
function manualMove(id, next, autoDrop = false) {
  const i = items().find((i) => i.id === id);
  if(i&&ui.selection.length>1&&ui.selection.includes(id)&&!autoDrop){try{commitBatch({kind:'move',x:next.x-i.x,y:next.y-i.y,z:next.z-i.z});}catch(e){toast(e.message+'，已保留整组原位置',true);render();}return;}
  if (!i || i.locked) return;
  const t = type(i.typeId),
    objects = physical(project, ui.mode).filter((o) => o.item.id !== id);
  if (autoDrop) {
    const a = shape(next, t);
    let z = 0;
    for (const o of objects) {
      if (
        o.z + o.h <= i.z + t.effectiveHeight + 0.05 &&
        Math.min(a.x + a.l, o.x + o.l) - Math.max(a.x, o.x) > 0.05 &&
        Math.min(a.y + a.w, o.y + o.w) - Math.max(a.y, o.y) > 0.05
      )
        z = Math.max(z, o.z + o.h);
    }
    next.z = z;
  }
  const result = checkManualCandidate(contextForManual(id),next,{complete:true,allowOverlap:ui.allowOverlap});
  const error = result.valid ? null : result.reason;
  if (error) {
    toast(error + "，已保留原位置", true);
    render();
    return;
  }
  checkpoint();
  Object.assign(i, next);
  ui.selected = id;
  changed();
}
function rotateSelected() {
  if(ui.selection.length>1){commitBatch({kind:'rotate',angle:90});return;}
  const i = current();
  if (!i) return toast("请先选中货物");
  if (i.locked) return toast("请先解锁货物");
  if (!type(i.typeId).allowRotate) return toast("此货物不允许旋转", true);
  manualMove(i.id, { ...i, rotation: (i.rotation + 90) % 360 });
}
function arrayDialog() {
  const i = current();
  if (!i) return toast("请先选择一个货物作为阵列起点");
  const t = type(i.typeId),
    d = footprint(t, i.rotation);
  dialog(
    "批量摆放阵列",
    `<p class="dialog-intro">以选中货物为第一个单元，向长、宽、高三个方向复制。先检查整组碰撞与库存，再一次性加入。</p><div class="fields three">${num("nx", "长向个数", 2, 1, 1)}${num("ny", "宽向个数", 2, 1, 1)}${num("nz", "层数", 1, 1, 1)}${num("dx", "长向步距（mm）", d.l + project.settings.gap, 1)}${num("dy", "宽向步距（mm）", d.w + project.settings.gap, 1)}${num("dz", "层高（mm）", d.h, 1)}</div>`,
    (v) => {
      const [nx, ny, nz, dx, dy, dz] = ["nx", "ny", "nz", "dx", "dy", "dz"].map(
        (k) => Number(v[k]),
      );
      if (nx * ny * nz > 1500) throw Error("单次阵列最多 1500 个单元");
      const arr = clone(items()),
        objects = physical(project, ui.mode);
      for (let z = 0; z < nz; z++)
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            if (!x && !y && !z) continue;
            const next = {
              ...i,
              id: uid(),
              x: i.x + x * dx,
              y: i.y + y * dy,
              z: i.z + z * dz,
              locked: false,
            };
            const error = validPlacement(next, t, objects);
            if (error) throw Error(error + "，请调整数量或步距");
            arr.push(next);
            objects.push({ item: next, t, ...shape(next, t) });
          }
      const r = analyze(project, ui.mode, arr);
      if (!r.valid) throw Error(r.issues.find((i) => i.level === "error").text);
      checkpoint();
      setItems(arr);
      closeDialog();
      changed();
      toast(`阵列已加入 ${nx * ny * nz - 1} 个货物`);
    },
    "生成阵列",
  );
}
async function optimize() {
  if (worker) return;
  if(ui.pending){ui.pending=null;ui.preview=null;render();}
  const snapshot = clone(project),
    rev = revision,
    mode = ui.mode;
  worker = new Worker(new URL("./optimizer.worker.js", import.meta.url), {
    type: "module",
  });
  const overlay = document.createElement("div");
  overlay.id = "progress";
  overlay.className = "progress-panel";
  overlay.innerHTML = `<div class="progress-card"><div class="spinner"></div><h3>正在寻找更合适的摆放</h3><p id="progress-text">检查锁定货物与库存…</p><p class="hint" style="margin:10px 0 18px">考虑尺寸、重量、支撑、朝向与堆叠限制</p>${button("cancel-optimize", "取消计算", "square", "full")}</div>`;
  $(".stage").append(overlay);
  icons();
  worker.onmessage = ({ data }) => {
    if (data.progress) {
      $("#progress-text").textContent = data.progress.phase
        ? `比较第 ${data.progress.phase} / ${data.progress.total} 组排列`
        : `当前方案已放入 ${data.progress.count} 个装载单元`;
      return;
    }
    worker.terminate();
    worker = null;
    overlay.remove();
    if (revision !== rev || ui.mode !== mode) return;
    if (data.error || data.result?.error)
      return toast(data.error || data.result.error, true);
    candidates = data.result.candidates;
    candidateIndex = 0;
    if (!candidates.length) return toast("没有生成候选方案", true);
    checkpoint();
    setItems(clone(candidates[0].items));
    ui.selected = null;
    ui.layer = "all";
    ui.step = 0;
    changed({ keepCandidates: true });
    toast(
      `已生成 ${candidates.length} 组方案，推荐装入 ${candidates[0].report.pieces} 件货物`,
    );
  };
  worker.onerror = (e) => {
    worker?.terminate();
    worker = null;
    overlay.remove();
    toast("计算失败：" + e.message, true);
  };
  worker.postMessage({ project: snapshot, mode });
}

async function handle(action, el = { dataset: {} }) {
  if(await workbench.handle(action,el))return;
  const id = el.dataset.id;
  if (action.startsWith("mode-")) {
    ui.pending=null;ui.preview=null;
    if (worker) {
      worker.terminate();
      worker = null;
      $("#progress")?.remove();
    }
    ui.mode = action.slice(5);
    ui.selected = null;
    ui.layer = "all";
    ui.step = 0;
    candidates = [];
    render();
    return;
  }
  if (action.startsWith("side-")) {
    ui.side = action.slice(5);
    render(false);
    return;
  }
  if (action.startsWith("right-")) {
    ui.right = action.slice(6);
    render(false);
    return;
  }
  if (action.startsWith("tool-")) {
    ui.toolsOpen=false;
    ui.pending=null;ui.preview=null;
    ui.tool = action.slice(5);
    $("#scene-help").textContent =
      ui.tool === "move"
        ? "拖动货物摆放 · 自动吸附支撑面"
        : "拖动旋转 · 滚轮缩放 · 单击选中";
    render(false);
    return;
  }
  if (action.startsWith("objective-")) {
    transaction(() => (project.settings.objective = action.slice(10)));
    return;
  }
  if (action.startsWith("depth-")) {
    transaction(() => (project.settings.depth = action.slice(6)));
    return;
  }
  switch (action) {
    case 'skin-studio':skinStudioDialog();break;
    case 'path-animation':pathAnimationDialog();break;
    case 'path-stop':stopPathPlayer();break;
    case 'path-play':if(pathPlayer){pathPlayer.playing=!pathPlayer.playing;pathPlayer.last=performance.now();paintPathPlayer();}break;
    case 'path-prev':if(pathPlayer){pathPlayer.index=Math.max(0,pathPlayer.index-1);pathPlayer.progress=0;pathPlayer.playing=false;paintPathPlayer();}break;
    case 'path-next':if(pathPlayer){pathPlayer.index=Math.min(pathPlayer.result.results.length-1,pathPlayer.index+1);pathPlayer.progress=0;pathPlayer.playing=false;paintPathPlayer();}break;
    case 'photo-mode':setPhotoMode(true);break;
    case 'photo-view':ui.view=el.dataset.view;scene?.fit(ui.view);break;
    case 'exit-photo':setPhotoMode(false);break;
    case 'photo-rotate':ui.photoRotate=!ui.photoRotate;scene?.setAutoRotate?.(ui.photoRotate);render(false);break;
    case 'photo-walls':ui.walls=!ui.walls;render();break;
    case 'photo-background':{const order=['studio','white','night'];ui.photoBackground=order[(order.indexOf(ui.photoBackground)+1)%order.length];scene?.setBackground?.(ui.photoBackground);render(false);break;}
    case 'photo-export':{if(!scene)throw Error('3D 场景未就绪');const a=document.createElement('a');a.href=scene.screenshot('zh-CN',2);a.download=project.name+'-展示高清.png';a.click();toast('高清展示图已生成');break;}
    case 'bag-pattern':transaction(()=>{project.settings.bagPattern=id;});candidates=[];toast('软包码放策略已更新，请重新计算');break;
    case 'compare-plans':planComparison();break;
    case 'compare-apply':{const index=Number(el.dataset.index);if(!candidates[index])throw Error('候选方案不存在');checkpoint();setItems(clone(candidates[index].items));candidateIndex=index;ui.selected=null;closeDialog();changed({keepCandidates:true});toast(`已应用：${candidates[index].label}`);break;}
    case 'pallet-designer':palletDesigner();break;
    case 'container-skin':
      if(!Object.hasOwn(CONTAINER_SKINS,id))throw Error('皮肤不存在');
      transaction(()=>{project.container.skin=id;});toast(`已切换为${CONTAINER_SKINS[id].name}`);break;
    case 'custom-skin':customSkinDialog();break;
    case 'toggle-tools':ui.toolsOpen=!ui.toolsOpen;render(false);break;
    case 'toggle-spaces':ui.spaces=!ui.spaces;render();break;
    case 'operations':operationsDialog();break;
    case 'bag-tolerance':bagsDialog();break;
    case 'assembly-edit':{const next=beginAssemblyEdit(project,current()?.id);checkpoint();project=next;ui.mode='pallet';ui.selected=null;ui.layer='all';ui.right='plan';changed();break;}
    case 'assembly-apply-one':case 'assembly-apply-all':case 'assembly-cancel':{const next=finishAssemblyEdit(project,action==='assembly-cancel'?'cancel':action.endsWith('one')?'one':'all');checkpoint();project=next;ui.mode='container';ui.selected=null;changed();break;}
    case 'group-transform':groupDialog('transform');break;
    case 'group-align':groupDialog('align');break;
    case 'copy-layer':groupDialog('layer');break;
    case 'group-unlock':commitBatch({kind:'unlock'});break;
    case 'group-lock':commitBatch({kind:'lock'});break;
    case 'group-delete':commitBatch({kind:'delete'});break;
    case 'select-visible':selectGroup(items().filter(i=>ui.layer==='all'||(ui.onlyLayer?report.levels[i.id]===+ui.layer:report.levels[i.id]<=+ui.layer)).map(i=>i.id));break;
    case 'select-layer':{const layer=current()?report.levels[current().id]:ui.layer==='all'?1:+ui.layer;ui.layer=String(layer);ui.onlyLayer=true;selectGroup(items().filter(i=>report.levels[i.id]===layer).map(i=>i.id));break;}
    case 'editor-top':case 'editor-side':ui.toolsOpen=false;ui.editor2d=action.slice(7);render();break;
    case 'editor-off':ui.toolsOpen=false;ui.editor2d=null;render();scene?.fit(ui.view);break;
    case 'only-layer':ui.onlyLayer=!ui.onlyLayer;if(ui.onlyLayer&&ui.layer==='all')ui.layer='1';render();break;
    case 'toggle-doors':scene?.toggleDoor();break;
    case 'door-boxes':ui.doorBoxes=!ui.doorBoxes;render();break;
    case 'toggle-overlap':ui.allowOverlap=!ui.allowOverlap;render();scene?.refreshPointer();toast(ui.allowOverlap?'仅临时放宽手动碰撞限制，边界、支撑、库存和载重仍检查':'已恢复禁止重叠；已有重叠不会自动移走，请按检查提示调整');break;
    case 'manual-place':startManual(id);break;
    case 'manual-cancel':cancelManual();break;
    case 'manual-coordinates':coordinatePlacement();break;
    case 'manual-rotate':if(ui.pending){if(!type(ui.pending.typeId).allowRotate)throw Error('此货物不允许旋转');ui.pending.rotation=(ui.pending.rotation+90)%360;render();scene?.refreshPointer();}break;
    case "view":
      ui.view = el.dataset.view;
      scene?.fit(ui.view);
      $$('[data-action="view"]').forEach((b) =>
        b.classList.toggle("active", b.dataset.view === ui.view),
      );
      break;
    case "fit":
      scene?.fit(ui.view);
      break;
    case "boxes":
    case "center":
      ui[action] = !ui[action];
      render();
      break;
    case "new-cargo":
      editCargo();
      break;
    case "edit-cargo":
      editCargo(id);
      break;
    case "place":
      addItem(id);
      break;
    case "reset-effective":
      for (const k of ["Length", "Width", "Height"])
        $(`#dialog [name="effective${k}"]`).value = $(
          `#dialog [name="${k.toLowerCase()}"]`,
        ).value;
      $("#compression-input").value = 0;
      cargoPreview?.update();
      break;
    case "apply-compression": {
      const value = Number($("#compression-input").value);
      if (value < 0 || value > 60 || !Number.isFinite(value))
        throw Error("高度压缩请输入 0–60%");
      $('#dialog [name="effectiveHeight"]').value =
        Math.round(
          Number($('#dialog [name="height"]').value) * (1 - value / 100) * 100,
        ) / 100;
      cargoPreview?.update();
      break;
    }
    case "edit-bin":
      editBin();
      break;
    case "templates":
      ui.side = "templates";
      render(false);
      break;
    case "new-template":
      editTemplate();
      break;
    case "edit-template":
      editTemplate(id);
      break;
    case "apply-template": {
      const t = project.templates.find((t) => t.id === id);
      if (
        t.maxHeight <= project.pallet.baseHeight ||
        t.maxWeight <= project.pallet.tare
      )
        throw Error("模板高度 / 重量小于当前托盘底座 / 自重，请先调整");
      transaction(() => {
        project.activeTemplate = id;
        Object.assign(project.pallet, {
          length: t.palletLength,
          width: t.palletWidth,
          height: t.maxHeight,
          maxWeight: t.maxWeight - project.pallet.tare,
          overhang: 0,
          preset: "客户模板",
        });
      });
      ui.mode = "pallet";
      ui.selected = null;
      render();
      toast(
        t.verified
          ? "已应用客户码托规则"
          : "已应用待核实模板，请根据实际规范复核",
      );
      break;
    }
    case "clear-template":
      transaction(() => (project.activeTemplate = null));
      break;
    case "save":
      await saveProject(true);
      break;
    case "projects":
      await projectsDialog();
      break;
    case "new-project":
      closeDialog();
      await switchProject(emptyProject());
      break;
    case "load-project": {
      const res = await fetch("/api/projects/" + encodeURIComponent(id));
      const p = await res.json();
      if (!res.ok) throw Error(p.error);
      closeDialog();
      await switchProject(p);
      break;
    }
    case "copy-project":
      closeDialog();
      {
        const p = clone(project);
        p.id = uid();
        p.name += " · 副本";
        await switchProject(p);
      }
      break;
    case "samples":
      dialog(
        "示例方案",
        `<p class="dialog-intro">打开示例会创建新方案，当前工作会先保存。示例参数用于演示操作。</p><div class="stack">${button("sample-boxes", "纸箱散装 · 20GP", "box", "full")}${button("sample-bags", "编织袋 · 人工压缩码托", "package", "full")}${button("sample-mixed", "纸箱与软包 · 混装", "layers", "full")}</div>`,
        null,
      );
      break;
    case "sample-boxes":
    case "sample-bags":
    case "sample-mixed":
      closeDialog();
      {
        const key = action.slice(7),
          p = sampleProject(key);
        await switchProject(p, key === "bags" ? "pallet" : "container");
        await optimize();
      }
      break;
    case "undo":
      if (history.length) {
        future.push(clone(project));
        project = history.pop();
        changed();
      }
      break;
    case "redo":
      if (future.length) {
        history.push(clone(project));
        project = future.pop();
        changed();
      }
      break;
    case "rotate":
      rotateSelected();
      break;
    case "angle": {
      const i = current();
      if (!i) return;
      if (!type(i.typeId).allowRotate) throw Error("此货物不允许旋转");
      dialog(
        "设置水平旋转角度",
        `<p class="dialog-intro">支持任意水平角度，碰撞按旋转包络检测。自动排列仅使用 0° / 90°。</p>${num("angle", "角度（°）", i.rotation, 0, 1)}`,
        (v) => {
          manualMove(i.id, { ...i, rotation: Number(v.angle) % 360 });
          closeDialog();
        },
      );
      break;
    }
    case "lock":
      if (current()) transaction(() => (current().locked = !current().locked));
      break;
    case "lock-all":
    case "unlock-all":
      transaction(() =>
        items().forEach((i) => (i.locked = action === "lock-all")),
      );
      break;
    case "delete-item":
      if(ui.selection.length>1){commitBatch({kind:'delete'});break;}
      if (current()) {
        if (current().locked) throw Error("请先解锁后删除");
        transaction(() =>
          setItems(items().filter((i) => i.id !== ui.selected)),
        );
        ui.selected = null;
      }
      break;
    case "duplicate":
      if (current()) addItem(current().typeId);
      break;
    case "deselect":
      ui.selected = null;
      render();
      break;
    case "select-item":
    case "focus-issue":
      ui.selected = id || null;
      ui.layer = "all";
      ui.step = 0;
      ui.right = "plan";
      render();
      break;
    case "drop":
      if (current()) manualMove(current().id, { ...current() }, true);
      break;
    case "array":
      arrayDialog();
      break;
    case "clear-items":
      confirmAction(
        "清空当前工作区",
        "清空当前工作区的全部摆放（包括已锁定货物）。货物规格和其他工作区保留，操作后可撤销。",
        () =>
          transaction(() => {
            setItems([]);
            ui.selected = null;
          }),
      );
      break;
    case "remove-cargo": {
      const referenced = [
        ...project.placements,
        ...project.palletPlacements,
        ...project.assemblies.flatMap((a) => a.children),
      ].some((i) => i.typeId === id);
      if (referenced)
        throw Error(
          "此规格正在被摆放或整托使用，请先删除关联摆放后再移除此规格",
        );
      closeDialog();
      transaction(() => {
        project.types = project.types.filter((t) => t.id !== id);
        project.assemblies = project.assemblies.filter((t) => t.id !== id);
      });
      break;
    }
    case "save-assembly": {
      const a = makeAssembly(project);
      dialog(
        "保存整托",
        `<p class="dialog-intro">${a.children.length} 件货物 / 托 · 含托 ${n(a.weight, 1)} kg · ${a.length} × ${a.width} × ${a.height} mm。整托与散件共用货物库存。</p><div class="fields">${txt("name", "整托名称", a.name, "required")}${num("quantity", "最多使用托数", 20, 1, 1)}</div>`,
        (v) => {
          a.name = v.name;
          a.quantity = Number(v.quantity);
          checkpoint();
          project.assemblies.push(a);
          closeDialog();
          ui.mode = "container";
          ui.selected = null;
          changed();
          toast("整托已保存，可从左侧整托库放入集装箱");
        },
      );
      break;
    }
    case "edit-assembly": {
      const a = type(id);
      confirmAction(
        "打开整托明细",
        "将这份整托复制到码托工作区编辑。当前码托草稿将被替换，可撤销；已入柜的整托保持原组合。编辑后另存一份整托。",
        () => {
          checkpoint();
          project.palletPlacements = clone(a.children);
          project.pallet = {
            length: a.deckLength,
            width: a.deckWidth,
            baseHeight: a.baseHeight,
            height: a.effectiveHeight,
            maxWeight: a.weight - a.tare,
            tare: a.tare,
            overhang: a.overhang,
            preset: "自定义",
            ...(a.palletDesign?{design:clone(a.palletDesign)}:{}),
          };
          project.activeTemplate = a.templateId;
          ui.mode = "pallet";
          ui.selected = null;
          changed();
        },
      );
      break;
    }
    case "unpack":
      unpackSelected();
      break;
    case "optimize":
      await optimize();
      break;
    case "cancel-optimize":
      worker?.terminate();
      worker = null;
      $("#progress")?.remove();
      toast("计算已取消，原摆放保留");
      break;
    case "candidate": {
      const index = Number(el.dataset.index);
      checkpoint();
      setItems(clone(candidates[index].items));
      candidateIndex = index;
      ui.selected = null;
      changed({ keepCandidates: true });
      break;
    }
    case "sequence":
      checkpoint();
      if (ui.mode === "container")
        project.placements = loadingSequence(project).map(
          ({ step, name, ...i }) => i,
        );
      else
        project.palletPlacements.sort(
          (a, b) => a.z - b.z || a.x - b.x || a.y - b.y,
        );
      ui.step = 1;
      changed();
      break;
    case "show-all":
      ui.step = 0;
      ui.layer = "all";
      render();
      break;
    case "exports":
      exportsDialog();
      break;
    case "export-json":
      download(
        JSON.stringify(project, null, 2),
        project.name + ".json",
        "application/json",
      );
      toast("完整项目已导出，可重新导入编辑");
      break;
    case "export-csv":
      exportCsv(project, ui.mode);
      break;
    case "export-report":
      exportReport(project, ui.mode, scene?.screenshot());
      break;
    case "export-report-en":
      exportReport(project, ui.mode, scene?.screenshot('en'), 'en');
      break;
    case "export-image":
      if (!scene) throw Error("3D 场景未就绪");
      {
        const a = document.createElement("a");
        a.href = scene.screenshot();
        a.download = project.name + "-3D.png";
        a.click();
      }
      break;
    case "import":
      $("#import-file").click();
      break;
    case "close-dialog":
      closeDialog();
      break;
    case "help":
      helpDialog();
      break;
  }
}
function unpackSelected() {
  const i = current(),
    a = i && type(i.typeId);
  if (!i || a.kind !== "pallet") return;
  if (i.locked) throw Error("请先解锁整托");
  confirmAction(
    "解散为可单独编辑的货物",
    "保留空托盘底座，把整托内的每件货物恢复成独立摆放。库存与总重量保持一致，操作可撤销。",
    () => {
      checkpoint();
      const base = cargo({
        name: a.name + " · 空托盘",
        kind: "box",
        isBase: true,
        auto: false,
        length: a.length,
        width: a.width,
        height: a.baseHeight,
        effectiveLength: a.length,
        effectiveWidth: a.width,
        effectiveHeight: a.baseHeight,
        weight: a.tare,
        quantity: 1,
        maxLayers: 1,
        maxLoad: a.weight - a.tare,
        color: "#a98b5a",
      });
      project.types.push(base);
      const d = footprint(a, i.rotation),
        rad = (i.rotation * Math.PI) / 180,
        cx = i.x + d.l / 2,
        cy = i.y + d.w / 2;
      const children = a.children.map((ch) => {
        const t = type(ch.typeId),
          cd = footprint(t, ch.rotation),
          nd = footprint(t, ch.rotation + i.rotation),
          x = ch.x + cd.l / 2 - a.length / 2,
          y = ch.y + cd.w / 2 - a.width / 2;
        return {
          ...ch,
          id: uid(),
          x: cx + x * Math.cos(rad) - y * Math.sin(rad) - nd.l / 2,
          y: cy + x * Math.sin(rad) + y * Math.cos(rad) - nd.w / 2,
          z: i.z + a.baseHeight + ch.z,
          rotation: (i.rotation + ch.rotation) % 360,
          locked: false,
        };
      });
      setItems(
        items()
          .filter((x) => x.id !== i.id)
          .concat(
            { ...i, id: uid(), typeId: base.id, locked: false },
            children,
          ),
      );
      ui.selected = null;
      changed();
    },
  );
}
async function projectsDialog() {
  const res = await fetch("/api/projects");
  if (!res.ok) throw Error("无法读取本地方案库");
  const list = await res.json();
  dialog(
    "本地方案库",
    `<p class="dialog-intro">所有方案保存在程序目录的 data 文件夹，每个方案另保留上一版备份。</p><div class="row wrap">${button("new-project", "空白方案", "plus", "primary")}${button("copy-project", "另存当前副本", "copy")}${button("import", "导入项目", "upload")}</div><div style="margin-top:14px">${list.map((p) => `<div class="project-row row between"><div><strong>${esc(p.name)}</strong><p>${new Date(p.updatedAt).toLocaleString("zh-CN")} · ${p.count} 个柜内单元</p></div>${button("load-project", "打开", "arrow-right", "", `data-id="${esc(p.id)}"`)}</div>`).join("") || '<div class="empty-state">还没有已保存方案</div>'}</div>`,
    null,
  );
}
function exportsDialog() {
  dialog(
    "导出与备份",
    `<p class="dialog-intro">当前导出工作区：${ui.mode === "container" ? "集装箱" : "托盘"}。项目文件同时包含两个工作区、货物规格、整托和客户模板。</p><div class="stack">${button("export-json", "完整项目 · JSON，可重新编辑", "download", "full")}${button("export-csv", "装载明细 · CSV，可用 Excel 打开", "file-text", "full")}${button("export-report", "装载报告 · 逐层图与清单，可打印为 PDF", "layers", "full")}${button("export-report-en", "English HTML Report · 英文版报告", "file-text", "full")}${button("export-image", "当前 3D 视图 · PNG", "scan", "full")}</div><p class="footer-tip">文件下载位置遵循浏览器设置。报告是离线 HTML，打开后使用浏览器打印即可保存 PDF。中英文报告都保留违规提示；英文版中的货名、客户名及备注保留原文。</p>`,
    null,
  );
}
function helpDialog() {
  dialog(
    "使用帮助",
    `<div class="stack"><p class="dialog-intro">先设置实际柜体与货物 → 选择散装或码托 → 手动摆放 / 自动计算 → 检查违规 → 保存并导出。</p>
    <h3>手动与自动配合</h3><p class="hint">左侧「手动摆放」进入点放模式：移动鼠标查看绿 / 红预览，点击落位；指向已有货物可叠到上方。「指定坐标」可精确填写 X / Y / Z 与角度，坐标对应旋转后外接框的最小角。推荐俯视摆放，右键平移、滚轮缩放。默认连续放置并锁定，可在右侧关闭。结束放置后，选中货物先解锁，再用「手动调整」拖动或输入坐标；碰撞、越界或规则不满足时保留原位置。「自动找一个空位」仍可一键找位；锁定的货物在自动补位时保留。</p>
    <h3>柜门动画与前后移动视角</h3><p class="hint">集装箱默认双门外开 110°；直接点击一扇门可独立开关，也可用「打开 / 关闭双门」按钮。点击「柜门碰撞箱」显示随动蓝色包络。门扇扫过货物会停下，临时重叠开关不会放宽柜门碰撞。柜门为示意结构，不占用填写的柜内尺寸；开合角度属于当前浏览状态，不改变货物及重量。浏览视角下按住滚轮中键：向前拖动推进，向后拖动后退；摄像机和观察目标一起移动。关闭的柜门及门框会阻挡中键推进。滚动滚轮仍为缩放，右键仍为平移。「适应视图」可恢复全景。</p>
    <h3>临时重叠与英文报告</h3><p class="hint">场景上方「允许临时重叠」只放宽手动点放、拖动与坐标调整的碰撞限制；橙框可临时落位，已有碰撞仍标红。边界、支撑、库存、载重及自动计算规则保持不变。关闭开关不会自动移走货物；刷新或打开另一个方案后开关恢复关闭。导出 → English HTML Report 可下载英文版，含层图、重量及英文校验提示；货名、客户名和用户备注保留原文。中英文报告都会明确标记未解决的重叠草稿。</p>
    <h3>托盘高度与堆叠层数</h3><p class="hint">装载设置 → 修改：空托盘本身高度 + 托盘上方可码货高度 = 含托总高。货物清单 → 规格铅笔 → 堆叠与朝向：「允许位于的最高堆叠层」设为 2 才允许该规格出现在第二层，下层「允许上方负载」也要足够。叠整托改整托规格，托盘上叠袋子改袋子规格。图中的「显示层数」只是显示筛选，不改变堆叠限制。</p>
    <h3>袋子与托盘</h3><p class="hint">袋子按人工填写的有效尺寸计算，重量不因压缩改变。托盘码垛是独立工作区，保存整托后才能入柜。整托内部空隙保守视为占用；「解散整托」恢复独立货物并保留底座。删除支撑物后可能悬空，请查看检查面板。</p>
    <h3>快捷键</h3><div class="shortcuts"><span><kbd>M</kbd></span><span>切换查看 / 拖动</span><span><kbd>R</kbd></span><span>待放或选中货物旋转 90°</span><span><kbd>Esc</kbd></span><span>结束连续放置</span><span>方向键</span><span>微调选中货物；Shift 加速十倍</span><span>PageUp / Down</span><span>升降一个货物高度，仍须满足支撑</span><span><kbd>Delete</kbd></span><span>删除未锁定货物</span><span>Ctrl+Z / Y</span><span>撤销 / 重做</span><span>Ctrl+S</span><span>保存本地方案</span></div>
    <h3>结果如何理解</h3><p class="hint">空间利用率采用有效包装外形体积；剩余体积不代表连续可用空间。必须装完是优先目标，未完成会在检查中列出；自动计算不是全局最优证明。标签朝向需人工核对。</p><p class="note-card">自动与手动项目最多 5000 个装载单元。检查采用静态几何和简化载荷分摊，不替代现场尺寸、包装受力和装卸条件验证。</p></div>`,
    null,
  );
}
async function boot() {
  try {
    const last = localStorage.getItem("container-planner-last");
    if (last) {
      const res = await fetch("/api/projects/" + encodeURIComponent(last));
      if (res.ok) project = validateProject(await res.json());
    } else {
      project.name = "示例 · 纸箱装柜";
      const t = project.types[0];
      for (let z = 0; z < 3; z++)
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 6; x++)
            project.placements.push({
              id: uid(),
              typeId: t.id,
              x: x * 600,
              y: y * 400,
              z: z * 300,
              rotation: 0,
              locked: false,
            });
    }
  } catch (e) {
    console.warn("Unable to restore last project", e.message);
  }
  shell();
  render();
  await saveProject();
}
boot().catch((e) => {
  document.body.textContent = "启动失败：" + e.message;
  console.error(e);
});
