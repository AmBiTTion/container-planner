import {cargo,COLORS} from './model.js';
export const importColumns={name:['名称','货物名称','name'],kind:['类型','包装类型','kind'],length:['长','长度','length'],width:['宽','宽度','width'],height:['高','高度','height'],weight:['单重','单件重量','重量','weight'],quantity:['数量','库存','quantity'],effectiveLength:['有效长','effectivelength'],effectiveWidth:['有效宽','effectivewidth'],effectiveHeight:['有效高','effectiveheight'],maxLayers:['最高层数','maxlayers'],maxLoad:['上方承重','maxload'],batch:['批次','batch'],unload:['卸货顺序','unload']};
export function parseCsv(text){
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else if(!quote&&cell.length)throw Error('CSV 引号位置错误');else quote=!quote;}
    else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;
    if(rows.length>5000||row.length>200||cell.length>10000)throw Error('表格超过 5000 行、200 列或单格 10000 字限制');
  }if(quote)throw Error('CSV 引号未闭合');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function previewCargoRows(rows,{dimensionUnit='mm',weightUnit='kg',existingCount=0}={}){
  const factor={mm:1,cm:10,m:1000}[dimensionUnit],mass={kg:1,g:.001}[weightUnit];if(!factor||!mass)throw Error('单位无效');
  if(!Array.isArray(rows)||rows.length>5000||!rows.length)throw Error('表格为空或超过 5000 行');
  const headers=rows[0].map(s=>String(s??'').replace(/^\uFEFF/,'').trim().toLowerCase()),mapping={},issues=[];
  for(const [key,names] of Object.entries(importColumns)){const indices=headers.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);if(indices.length>1)issues.push(`列「${key}」重复`);if(indices.length)mapping[key]=indices[0];}
  for(const k of ['name','length','width','height','weight','quantity'])if(mapping[k]===undefined)issues.push(`缺少必需列：${importColumns[k][0]}`);
  const entries=[],names=new Set();
  for(let index=1;index<rows.length;index++){
    const source=rows[index];if(Object.values(mapping).every(column=>source[column]===null||source[column]===undefined||source[column]===''))continue;
    const errors=[],value=k=>source[mapping[k]],text=k=>String(value(k)??'').trim();
    const numeric=(k,{optional=false,defaultValue=0,integer=false,min=0,scale=1}={})=>{const v=value(k);if((v===null||v===undefined||v==='')&&optional)return defaultValue;const n=typeof v==='number'?v:typeof v==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(v.trim())?Number(v):NaN;if(!Number.isFinite(n)||n<min||n*scale>1e8||(integer&&!Number.isInteger(n)))errors.push(`${importColumns[k][0]}数值无效`);return n*scale;};
    const name=text('name');if(!name||name.length>200)errors.push('名称须为 1–200 字');
    const kind=({'箱子':'box','纸箱':'box','box':'box','软包':'soft','soft':'soft','编织袋':'woven','woven':'woven','袋子':'woven','':'box'})[text('kind')];if(!kind)errors.push('类型须为纸箱/软包/编织袋');
    const length=numeric('length',{min:.001,scale:factor}),width=numeric('width',{min:.001,scale:factor}),height=numeric('height',{min:.001,scale:factor});
    const t=cargo({name,kind:kind||'box',length,width,height,weight:numeric('weight',{min:.000001,scale:mass}),quantity:numeric('quantity',{integer:true}),effectiveLength:numeric('effectiveLength',{optional:true,defaultValue:length,min:.001,scale:factor}),effectiveWidth:numeric('effectiveWidth',{optional:true,defaultValue:width,min:.001,scale:factor}),effectiveHeight:numeric('effectiveHeight',{optional:true,defaultValue:height,min:.001,scale:factor}),maxLayers:numeric('maxLayers',{optional:true,defaultValue:8,min:1,integer:true}),maxLoad:numeric('maxLoad',{optional:true,defaultValue:200,scale:mass}),unload:numeric('unload',{optional:true,defaultValue:1,min:1,integer:true}),batch:text('batch'),color:COLORS[(index-1)%COLORS.length]});
    if(t.quantity>100000)errors.push('库存不能超过 100000');
    if(t.kind==='box'&&(t.effectiveLength!==length||t.effectiveWidth!==width||t.effectiveHeight!==height))errors.push('纸箱有效尺寸须与原始尺寸一致');
    const warnings=[];if(names.has(name))warnings.push('重名，将作为独立规格新增');names.add(name);
    entries.push({row:index+1,source:[...source],cargo:t,errors,warnings});
  }
  if(entries.length+existingCount>200)issues.push('导入后超过 200 种规格');if(!entries.length)issues.push('没有可导入数据行');
  return {headers,entries,issues,valid:!issues.length&&entries.every(e=>!e.errors.length),units:{dimensionUnit,weightUnit}};
}
export function validateXlsxArchive(buffer){
  const v=new DataView(buffer);let end=-1;
  for(let i=v.byteLength-22;i>=Math.max(0,v.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('不是有效 XLSX ZIP 文件');const count=v.getUint16(end+10,true);if(count>2000)throw Error('工作簿包含过多压缩条目');let pos=v.getUint32(end+16,true),total=0;
  for(let i=0;i<count;i++){if(pos+46>v.byteLength||v.getUint32(pos,true)!==0x02014b50)throw Error('工作簿压缩目录损坏');total+=v.getUint32(pos+24,true);if(total>50*1024*1024)throw Error('工作簿解压后超过 50MB');if(v.getUint16(pos+8,true)&1)throw Error('不支持加密工作簿');pos+=46+v.getUint16(pos+28,true)+v.getUint16(pos+30,true)+v.getUint16(pos+32,true);}
}
