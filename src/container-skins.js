export const CONTAINER_SKINS = {
  classic: {name:'经典海运绿',base:'#527665',floor:'#b8a77f',hardware:'#c6cec8'},
  ocean: {name:'远洋蓝',base:'#356b86',floor:'#b7a77e',hardware:'#d0d5d2'},
  cargo: {name:'货柜红',base:'#974d43',floor:'#b29e76',hardware:'#d1d1c8'},
  reefer: {name:'冷藏白',base:'#d5dcd9',floor:'#aeb8b7',hardware:'#f1f3f1'},
  graphite: {name:'石墨灰',base:'#465052',floor:'#9f967e',hardware:'#c8cecd'},
  sand: {name:'沙漠黄',base:'#a48650',floor:'#aa9670',hardware:'#d8d5c8'},
};

const validHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
const mix=(from,to,amount)=>{
  const parse=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)),a=parse(from),b=parse(to);
  return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*amount).toString(16).padStart(2,'0')).join('');
};

export function resolveContainerSkin(container={}){
  const id=container.skin==='custom'?'custom':Object.hasOwn(CONTAINER_SKINS,container.skin)?container.skin:'classic';
  const entry=id==='custom'?{name:'自定义颜色',base:validHex(container.skinColor)?container.skinColor:'#527665',floor:'#b3a17a',hardware:'#cbd0cc'}:CONTAINER_SKINS[id];
  const base=entry.base;
  return {
    id,name:entry.name,base,
    wall:mix(base,'#ffffff',.18),
    rib:mix(base,'#ffffff',.06),
    edge:mix(base,'#000000',.28),
    frame:mix(base,'#000000',.35),
    door:mix(base,'#ffffff',.11),
    doorRib:mix(base,'#000000',.06),
    rail:mix(base,'#000000',.31),
    cage:mix(base,'#000000',.24),
    label:mix(base,'#000000',.38),
    floor:entry.floor,
    floorLine:mix(entry.floor,'#000000',.18),
    hardware:entry.hardware,
  };
}

export const containerSkinName=container=>resolveContainerSkin(container).name;
