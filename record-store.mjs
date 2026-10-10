import {mkdir,readFile,writeFile,readdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateProject} from './src/model.js';
const validId=s=>/^[a-zA-Z0-9_-]{1,100}$/.test(s);
const json=async f=>JSON.parse(await readFile(f,'utf8'));
async function atomic(filename,value){const temp=filename+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),'utf8');await rename(temp,filename);}
function format(bytes,name){
  const ext=path.extname(name).toLowerCase(),sig=bytes.subarray(0,12);
  if(ext==='.png'&&sig.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(['.jpg','.jpeg'].includes(ext)&&sig[0]===255&&sig[1]===216&&sig[2]===255)return 'image/jpeg';
  if(ext==='.webp'&&sig.subarray(0,4).toString()==='RIFF'&&sig.subarray(8,12).toString()==='WEBP')return 'image/webp';
  if(ext==='.pdf'&&sig.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  if(['.xlsx','.docx'].includes(ext)&&sig[0]===80&&sig[1]===75)return 'application/octet-stream';
  if(['.txt','.csv'].includes(ext)&&!bytes.includes(0))return 'text/plain';
  throw Error('附件支持 PNG/JPG/WebP、PDF、XLSX、DOCX、TXT/CSV，文件内容须与扩展名相符');
}
export async function handleRecords(req,res,url,{data,body,send}){
  if(!url.pathname.startsWith('/api/records/'))return false;
  const [projectId,kind,id,...extra]=url.pathname.slice('/api/records/'.length).split('/');
  if(!validId(projectId)||extra.length||(id&&!validId(id))||!['versions','assets'].includes(kind)){send(res,400,{error:'记录路径无效'});return true;}
  const dir=path.join(data,'records',projectId,kind);
  await mkdir(dir,{recursive:true});
  if(req.method==='GET'){
    if(!id){const result=[];for(const f of (await readdir(dir)).filter(f=>f.endsWith('.json'))){const entry=await json(path.join(dir,f));const {project,...meta}=entry;result.push(meta);}send(res,200,result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));return true;}
    try{
      const entry=await json(path.join(dir,id+'.json'));
      if(kind==='versions')send(res,200,entry);
      else{const bytes=await readFile(path.join(dir,id+'.bin'));res.writeHead(200,{'Content-Type':entry.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(entry.name)}`,'Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'no-store'});res.end(bytes);}
    }catch(e){if(e.code==='ENOENT')send(res,404,{error:'找不到记录或附件'});else throw e;}return true;
  }
  if(req.method!=='POST'||id){send(res,405,{error:'不支持此操作'});return true;}
  if(!req.headers['content-type']?.startsWith('application/json'))throw Error('需要 JSON 格式');
  const value=await body(req),recordId=randomUUID(),createdAt=new Date().toISOString();
  if(kind==='versions'){
    if(typeof value.name!=='string'||!value.name.trim()||value.name.length>200)throw Error('请输入 1–200 字版本名称');
    const project=validateProject(value.project);if(project.id!==projectId)throw Error('项目编号不一致');
    const entry={id:recordId,projectId,name:value.name.trim(),createdAt,hash:createHash('sha256').update(JSON.stringify(project)).digest('hex'),project};
    await atomic(path.join(dir,recordId+'.json'),entry);const {project:_,...meta}=entry;send(res,201,meta);
  }else{
    if(typeof value.name!=='string'||!value.name.trim()||value.name.length>200||/[\x00-\x1f]/.test(value.name))throw Error('附件名称无效');
    if(typeof value.base64!=='string'||value.base64.length>8*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.base64))throw Error('附件须小于 6MB，使用有效 Base64');
    const bytes=Buffer.from(value.base64,'base64');if(!bytes.length||bytes.length>6*1024*1024)throw Error('附件须为 1 字节–6MB');
    const entry={id:recordId,projectId,name:value.name,createdAt,size:bytes.length,mime:format(bytes,value.name),sha256:createHash('sha256').update(bytes).digest('hex')};
    await writeFile(path.join(dir,recordId+'.bin'),bytes,{flag:'wx'});await atomic(path.join(dir,recordId+'.json'),entry);send(res,201,entry);
  }return true;
}
