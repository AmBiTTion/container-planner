import readXlsxFile,{readSheetNames} from 'read-excel-file';
import {parseCsv,previewCargoRows,validateXlsxArchive} from './cargo-import.js';
import {clone,validateProject,allTypes} from './model.js';
export function importDialog(api){
  const {dialog,select,esc,get,replace,close}=api;
  let file=null,rows=null,preview=null,generation=0;
  dialog('Excel 批量导入',`<p class="dialog-intro">支持 XLSX 和 UTF-8 CSV（旧 XLS 请先另存 XLSX）。第一行为列名；必需：名称、长、宽、高、单重、数量。可选：类型、有效长/宽/高、最高层数、上方承重、批次、卸货顺序。缺省类型为纸箱，最高层数 8，上方承重 200 kg，卸货顺序 1；默认规则会显示在预览里。公式仅读取保存的计算值，请在 Excel 中重新计算并保存。原始文件不会改动。</p><p><a href="/cargo-import-template.xlsx" download>下载 Excel 导入模板</a></p><label>选择文件（最多 6MB）<input id="cargo-import-file" type="file" accept=".xlsx,.csv"></label><label>工作表<select id="cargo-import-sheet"></select></label><div class="fields">${select('dimensionUnit','表内尺寸单位','mm',[['mm','毫米 mm'],['cm','厘米 cm'],['m','米 m']])}${select('weightUnit','表内重量单位','kg',[['kg','千克 kg'],['g','克 g']])}</div><p id="import-status">尚未选择文件</p><div class="table-scroll" id="cargo-import-preview"></div>`,()=>{
    if(!preview?.valid)throw Error('请先修正表格并通过预览校验');const p=clone(get());p.types.push(...preview.entries.map(e=>e.cargo));validateProject(p);replace(p);close();
  },'确认新增全部规格');
  const submit=document.querySelector('#dialog-submit');submit.disabled=true;
  document.querySelector('#dialog').addEventListener('close',()=>{submit.disabled=false;generation++;},{once:true});
  const render=()=>{
    if(!rows)return;preview=previewCargoRows(rows,{dimensionUnit:document.querySelector('[name="dimensionUnit"]').value,weightUnit:document.querySelector('[name="weightUnit"]').value,existingCount:allTypes(get()).length});
    const errors=[...preview.issues,...preview.entries.flatMap(e=>e.errors.map(error=>`第 ${e.row} 行：${error}`))];
    document.querySelector('#import-status').textContent=preview.valid?`${preview.entries.length} 行可导入。尺寸已明确换算为 mm，重量为 kg；请检查下方预览。`:errors.join('；');
    document.querySelector('#cargo-import-preview').innerHTML=`<table><thead><tr><th>原行</th><th>名称</th><th>有效尺寸 mm</th><th>kg</th><th>数量</th><th>最高层 / 承重 kg</th><th>提示</th></tr></thead><tbody>${preview.entries.map(e=>`<tr><td>${e.row}</td><td>${esc(e.cargo.name)}</td><td>${[e.cargo.effectiveLength,e.cargo.effectiveWidth,e.cargo.effectiveHeight].join(' × ')}</td><td>${e.cargo.weight}</td><td>${e.cargo.quantity}</td><td>${e.cargo.maxLayers} / ${e.cargo.maxLoad}</td><td>${[...e.errors,...e.warnings].map(esc).join('；')||'可导入'}</td></tr>`).join('')}</tbody></table>`;submit.disabled=!preview.valid;
  };
  const read=async()=>{const token=++generation;submit.disabled=true;preview=null;rows=null;document.querySelector('#import-status').textContent='读取中…';try{const result=file.name.toLowerCase().endsWith('.csv')?parseCsv(await file.text()):await readXlsxFile(file,{sheet:document.querySelector('#cargo-import-sheet').value,trim:false});if(token!==generation)return;rows=result;render();}catch(e){if(token===generation)document.querySelector('#import-status').textContent=e.message;}};
  document.querySelector('#cargo-import-file').onchange=async e=>{file=e.target.files[0];if(!file)return;try{if(file.size>6*1024*1024)throw Error('文件最多 6MB');const xlsx=file.name.toLowerCase().endsWith('.xlsx');if(!xlsx&&!file.name.toLowerCase().endsWith('.csv'))throw Error('请选择 XLSX 或 CSV');if(xlsx)validateXlsxArchive(await file.arrayBuffer());const sheets=xlsx?await readSheetNames(file):['CSV'];document.querySelector('#cargo-import-sheet').replaceChildren(...sheets.map(name=>new Option(name,name)));await read();}catch(e){preview=null;submit.disabled=true;document.querySelector('#import-status').textContent=e.message;}};
  document.querySelector('#cargo-import-sheet').onchange=read;for(const k of ['dimensionUnit','weightUnit'])document.querySelector(`[name="${k}"]`).onchange=render;
}
