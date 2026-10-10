// Shared, millimetre-based geometry. The illustrative assembly stays outside X=length.
// Hardware dimensions are illustrative, not manufacturer-certified clearances.
export const DOOR_OPEN_ANGLE = 110;
export function doorConfig(c){
  const width=Math.min(c.width,c.doorWidth),height=Math.min(c.height,c.doorHeight);
  const thickness=Math.min(60,width*.04),hardware=thickness*.58;
  return {width,height,thickness,hardware,hingeX:c.length+thickness*(.5+.22),low:(c.width-width)/2,high:(c.width+width)/2,gap:Math.min(3,width*.005)};
}
function bounds(polygon,z,h,extra={}){
  const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
  return {x,y,z,l:Math.max(...xs)-x,w:Math.max(...ys)-y,h,polygon,...extra};
}
export function convexHull(points){
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=points=>{const out=[];for(const p of points){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
export function doorBody(c,side,angle=0){
  const d=doorConfig(c),sign=side==='left'?-1:1,hingeY=sign===1?d.low:d.high,a=angle*Math.PI/180;
  const vertices=[];
  for(const normal of [-d.thickness/2,d.thickness/2+d.hardware])for(const along of [-d.thickness*.22,d.width/2-d.gap])vertices.push([
    d.hingeX+along*Math.sin(a)+normal*Math.cos(a),hingeY+sign*(along*Math.cos(a)-normal*Math.sin(a))
  ]);
  return bounds(convexHull(vertices),0,d.height,{side,angle,hingeX:d.hingeX,hingeY,name:side==='left'?'左柜门':'右柜门',nameEn:side==='left'?'Left door':'Right door'});
}
export function doorFrames(c){
  const d=doorConfig(c),edge=Math.min(60,d.width*.05),depth=d.thickness+d.hardware;
  const box=(y,w,z,h,name,nameEn)=>bounds([[c.length,y],[c.length+depth,y],[c.length+depth,y+w],[c.length,y+w]],z,h,{name,nameEn});
  return [box(-edge,d.low+edge,-edge,d.height+edge*2,'左门框','Left door frame'),box(d.high,c.width-d.high+edge,-edge,d.height+edge*2,'右门框','Right door frame'),box(d.low,d.width,d.height,Math.max(edge,c.height-d.height),'上门框','Top door frame'),box(d.low,d.width,-edge,edge,'门槛','Door sill')];
}
export function doorBodies(c,angles={left:0,right:0}){return [...doorFrames(c),doorBody(c,'left',angles.left),doorBody(c,'right',angles.right)];}
export function sweptDoorBody(c,side,from,to){
  const a=doorBody(c,side,from),b=doorBody(c,side,to),d=doorConfig(c);
  // A convex hull plus the maximum arc sagitta contains the entire angular sweep.
  const radius=Math.hypot(d.width/2,d.thickness/2+d.hardware),margin=radius*(1-Math.cos(Math.abs(to-from)*Math.PI/360))+.001;
  const points=[...a.polygon,...b.polygon].flatMap(([x,y])=>[[-margin,-margin],[-margin,margin],[margin,-margin],[margin,margin]].map(([dx,dy])=>[x+dx,y+dy]));
  return bounds(convexHull(points),a.z,a.h,{side,name:a.name,nameEn:a.nameEn});
}
// Earliest intersection of a segment with a convex prism expanded by camera radius.
export function segmentBodyHit(start,end,body,radius=20){
  const poly=convexHull(body.polygon.flatMap(([x,y])=>[[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]].map(([dx,dy])=>[x+dx,y+dy])));
  let enter=0,leave=1;
  const clip=(f0,f1)=>{const delta=f1-f0;if(Math.abs(delta)<1e-9)return f0>=0;const t=-f0/delta;if(delta>0)enter=Math.max(enter,t);else leave=Math.min(leave,t);return enter<=leave;};
  if(!clip(start.z-body.z+radius,end.z-body.z+radius)||!clip(body.z+body.h+radius-start.z,body.z+body.h+radius-end.z))return null;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],f=p=>(b[0]-a[0])*(p.y-a[1])-(b[1]-a[1])*(p.x-a[0]);if(!clip(f(start),f(end)))return null;}
  return enter>=0&&enter<=1&&leave>=0?enter:null;
}
