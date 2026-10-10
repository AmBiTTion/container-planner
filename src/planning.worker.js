import {allocateFleet,compareBagPlans} from './fleet.js';
import {checkPaths} from './path-check.js';
self.onmessage=({data})=>{
  try{let result;
    if(data.kind==='fleet')result=data.schedules.map(schedule=>allocateFleet(data.project,schedule,data.options,progress=>self.postMessage({progress})));
    else if(data.kind==='bags')result=compareBagPlans(data.project,data.mode,progress=>self.postMessage({progress}));
    else if(data.kind==='path')result=checkPaths(data.project,data.params);
    else throw Error('未知计算任务');
    self.postMessage({result});
  }catch(e){self.postMessage({error:e.message});}
};
