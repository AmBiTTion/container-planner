import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {emptyProject,cargo,CONTAINERS} from '../src/model.js';
const dir='D:/ContainerPlanner/work/packing-upgrade-qa',url='http://127.0.0.1:4179';await mkdir(dir+'/data',{recursive:true});
const child=spawn(process.execPath,['server.mjs'],{cwd:'D:/ContainerPlanner',env:{...process.env,PORT:'4179',CONTAINER_DATA_DIR:dir+'/data'},windowsHide:true,stdio:'pipe'});
let browser,page;const errors=[],results=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
const p=emptyProject();p.name='Packing Upgrade QA';p.container={...CONTAINERS['40HC'],preset:'40HC'};p.types=[cargo({name:'NEWSPAPER CAT LITTER',kind:'soft',length:600,width:400,height:150,effectiveLength:500,effectiveWidth:400,effectiveHeight:152,weight:10.8,quantity:2520,maxLayers:50,maxLoad:400,mustLoad:true})];
const click=async a=>{const target=page.locator(`[data-action="${a}"]`).first();if(!await target.isVisible()&&await page.locator(`.manual-bar [data-action="${a}"]`).count())await page.locator('.stage-tools [data-action="toggle-tools"]').click();await target.click();};
const fill=async(k,v)=>page.locator(`#dialog [name="${k}"]`).fill(String(v));
const close=async()=>page.locator('#dialog [data-action="close-dialog"]').first().click();
const saved=async()=>{await click('save');await page.waitForFunction(()=>document.querySelector('#save-state').textContent.startsWith('已保存'));return fetch(url+'/api/projects/'+p.id).then(r=>r.json());};
const step=async(name,fn)=>{await fn();results.push(name);console.log('PASS '+name);};
try{
  for(let i=0;i<100;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await wait(100);}
  assert((await fetch(url+'/api/projects/'+p.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})).ok);
  browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(id=>localStorage.setItem('container-planner-last',id),p.id);await page.goto(url);await page.waitForSelector('#canvas-host canvas');
  await step('toolbar is collapsed by default and toggles without changing project',async()=>{
    assert(!await page.locator('.manual-bar').isVisible());await click('toggle-tools');assert(await page.locator('.manual-bar').isVisible());await page.screenshot({path:dir+'/01-tools.png'});await click('toggle-tools');assert(!await page.locator('.manual-bar').isVisible());assert.equal((await saved()).placements.length,0);
  });
  await step('existing bag live preview responds to dimensions, compression and original reset',async()=>{
    await click('edit-cargo');await page.waitForSelector('#cargo-preview canvas');assert.equal(await page.locator('#cargo-preview').getAttribute('data-dimensions'),'500x400x152');
    await fill('effectiveWidth',450);assert.equal(await page.locator('#cargo-preview').getAttribute('data-dimensions'),'500x450x152');
    await page.locator('#compression-input').fill('20');assert.equal(await page.locator('#cargo-preview').getAttribute('data-dimensions'),'500x450x120');
    await page.screenshot({path:dir+'/02-preview.png'});await click('reset-effective');assert.equal(await page.locator('#cargo-preview').getAttribute('data-dimensions'),'600x400x150');
    await close();assert.equal(await page.locator('#cargo-preview canvas').count(),0);assert.equal((await saved()).types[0].effectiveHeight,152);
  });
  await step('new product preview and repeated close/Escape release preview canvas',async()=>{
    await click('new-cargo');await page.waitForSelector('#cargo-preview canvas');await page.locator('#dialog [name="kind"]').selectOption('woven');await fill('length',700);await click('reset-effective');assert.match(await page.locator('#cargo-preview').getAttribute('data-dimensions'),/^700x/);await close();
    for(let i=0;i<4;i++){await click('edit-cargo');assert.equal(await page.locator('canvas').count(),2);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal(await page.locator('canvas').count(),1);}
  });
  await step('real worker loads 2346 bags, mixed rotations and detailed remaining reasons',async()=>{
    await click('optimize');await page.locator('#progress').waitFor({state:'hidden',timeout:60000});const q=await saved();assert.equal(q.placements.length,2346);assert.equal(new Set(q.placements.map(i=>i.rotation)).size,2);assert.match(await page.locator('.packing-explanation').innerText(),/剩余 174 件/);assert.match(await page.locator('.packing-explanation').innerText(),/107 件/);assert.match(await page.locator('#status-result').innerText(),/通过/);await page.screenshot({path:dir+'/03-packed.png'});
  });
  await step('optional free space labels show measured gaps and 2D projection without changing placements',async()=>{
    const before=await saved();await click('toggle-spaces');assert(await page.locator('#space-legend').isVisible());assert.match(await page.locator('#space-legend').innerText(),/114 mm/);assert.match(await page.locator('#space-legend').innerText(),/52 ×/);await page.screenshot({path:dir+'/04-spaces.png'});
    await click('editor-top');assert(!await page.locator('.manual-bar').isVisible());assert.equal(await page.locator('[data-free-region]').count(),3);await click('toggle-spaces');assert(!await page.locator('#space-legend').isVisible());assert.equal(await page.locator('[data-free-region]').count(),0);assert.deepEqual((await saved()).placements,before.placements);await click('editor-off');
  });
  await step('preview saves a valid edit and survives reopen',async()=>{
    await click('edit-cargo');await fill('length',610);await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.querySelector('#dialog').open);assert.equal((await saved()).types[0].length,610);await click('edit-cargo');assert.equal(await page.locator('#cargo-preview').getAttribute('data-dimensions'),'500x400x152');await close();
  });
  await step('collapsed and expanded toolbar fit narrow viewports with clean runtime',async()=>{
    for(const width of [1100,768,390]){await page.setViewportSize({width,height:960});await click('toggle-tools');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await click('toggle-tools');}
    assert.deepEqual(errors,[]);
  });
}catch(e){console.error(e);process.exitCode=1;await page?.screenshot({path:dir+'/failure.png'}).catch(()=>{});}finally{await writeFile(dir+'/results.json',JSON.stringify({results,errors},null,2));await browser?.close();child.kill();}
