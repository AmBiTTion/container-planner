import {collides} from './engine.js';
import {doorBody,sweptDoorBody,DOOR_OPEN_ANGLE} from './doors.js';
export function advanceDoor(c,side,from,target,objects,otherAngle){
  target=Math.min(DOOR_OPEN_ANGLE,Math.max(0,target));
  const steps=Math.max(1,Math.ceil(Math.abs(target-from)/.5)),other=doorBody(c,side==='left'?'right':'left',otherAngle);
  let angle=from;
  for(let i=1;i<=steps;i++){
    const next=from+(target-from)*i/steps,sweep=sweptDoorBody(c,side,angle,next);
    const obstacle=objects.find(o=>collides(sweep,o))||(collides(sweep,other)?other:null);
    if(obstacle)return {angle,blocked:true,obstacle};
    angle=next;
  }
  return {angle:target,blocked:false};
}
