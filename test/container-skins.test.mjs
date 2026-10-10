import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTAINER_SKINS,resolveContainerSkin,containerSkinName} from '../src/container-skins.js';
import {emptyProject,validateProject,clone} from '../src/model.js';

test('all container skin presets resolve to complete distinct palettes',()=>{
  const bases=new Set();
  for(const [id,input] of Object.entries(CONTAINER_SKINS)){
    const s=resolveContainerSkin({skin:id});bases.add(s.base);
    assert.equal(s.name,input.name);
    for(const key of ['base','wall','rib','edge','frame','door','doorRib','rail','cage','label','floor','floorLine','hardware'])assert.match(s[key],/^#[0-9a-f]{6}$/i);
  }
  assert.equal(bases.size,Object.keys(CONTAINER_SKINS).length);
});

test('legacy projects default to classic and custom colors derive a stable palette',()=>{
  assert.equal(containerSkinName({}),'经典海运绿');
  const a=resolveContainerSkin({skin:'custom',skinColor:'#123456'}),b=resolveContainerSkin({skin:'custom',skinColor:'#123456'});
  assert.deepEqual(a,b);assert.equal(a.base,'#123456');assert.notEqual(a.door,a.frame);
});

test('skin metadata validates without changing any loading property',()=>{
  const p=emptyProject(),before=clone(p.container);p.container.skin='ocean';assert.doesNotThrow(()=>validateProject(p));
  for(const key of ['length','width','height','doorWidth','doorHeight','maxWeight','tare'])assert.equal(p.container[key],before[key]);
  p.container.skin='custom';p.container.skinColor='#6842a1';assert.doesNotThrow(()=>validateProject(p));
  p.container.skin='unknown';assert.throws(()=>validateProject(p),/集装箱皮肤/);
  p.container.skin='custom';p.container.skinColor='red';assert.throws(()=>validateProject(p),/自定义颜色/);
});
