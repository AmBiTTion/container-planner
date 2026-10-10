import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,validateProject,clone} from '../src/model.js';
import {cargoAppearance,containerAppearance} from '../src/appearance.js';

test('appearance defaults are backward compatible and do not alter geometry',()=>{
  const p=emptyProject(),before=clone({container:p.container,type:p.types[0]});
  assert.equal(cargoAppearance(p.types[0]).material,'cardboard');assert.equal(containerAppearance(p.container).condition,10);
  p.container.appearance={companyName:'ACME',containerNo:'MSCU 123456',warningText:'CAUTION',condition:65};
  p.types[0].appearance={material:'metal',pattern:'grid',secondaryColor:'#abcdef',labelText:'FRAGILE',sku:'SKU-1',showArrows:true};
  assert.doesNotThrow(()=>validateProject(p));
  for(const k of ['length','width','height','maxWeight'])assert.equal(p.container[k],before.container[k]);
  for(const k of ['length','width','height','weight'])assert.equal(p.types[0][k],before.type[k]);
});

test('appearance rejects active or malformed metadata',()=>{
  const p=emptyProject();p.container.appearance={companyName:'',containerNo:'',warningText:'',condition:101};assert.throws(()=>validateProject(p),/新旧/);
  p.container.appearance={companyName:'',containerNo:'',warningText:'',condition:10};p.types[0].appearance={material:'html',pattern:'plain',secondaryColor:'#ffffff',labelText:'',sku:'',showArrows:false};assert.throws(()=>validateProject(p),/外观/);
});
