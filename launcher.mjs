import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const url='http://127.0.0.1:4173';
async function health(){try{const res=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1500)});return await res.json();}catch{return null;}}
const belongs=h=>h?.app==='container-planner'&&h.dataDir===path.join(root,'data');
function openBrowser(){if(process.argv.includes('--no-browser'))return;execFile(process.env.ComSpec||'cmd.exe',['/d','/c','start','',url],error=>{if(error)console.log('Please open '+url+' in Edge or Chrome.');});}
const existing=await health();
if(process.argv.includes('--stop')){
  if(!existing){console.log('Container Planner is not running.');process.exit(0);}
  if(!belongs(existing)){console.error('Port 4173 belongs to another application; no action taken.');process.exit(1);}
  const res=await fetch(url+'/api/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:'container-planner'})});
  if(!res.ok){console.error('Unable to stop. Close the Container Planner console window.');process.exit(1);}
  console.log('Container Planner stopped. Saved projects are preserved.');
}else if(existing){
  if(!belongs(existing)){console.error('Port 4173 belongs to another application.');process.exit(1);}
  console.log('Container Planner is already running: '+url);openBrowser();
}else{
  console.log('Container Planner - local 3D loading planner');
  console.log('Data: '+path.join(root,'data'));
  console.log('Keep this console open. Press Ctrl+C to stop.');
  await import('./server.mjs');
  for(let i=0;i<30;i++){if(belongs(await health())){openBrowser();break;}await new Promise(resolve=>setTimeout(resolve,100));}
}
