export const CARGO_MATERIALS={
  cardboard:{name:'瓦楞纸箱',roughness:.92,metalness:0},
  woven:{name:'编织纤维',roughness:.82,metalness:0},
  plastic:{name:'塑料膜',roughness:.38,metalness:0},
  foil:{name:'覆膜袋',roughness:.24,metalness:.08},
  wood:{name:'木质包装',roughness:.88,metalness:0},
  metal:{name:'金属包装',roughness:.3,metalness:.58},
};
export const CARGO_PATTERNS={plain:'纯色',stripe:'条带',grid:'网格',label:'标签面'};

export function defaultAppearance(kind='box',color='#c9a36b'){
  return {
    material:kind==='box'?'cardboard':kind==='woven'?'woven':'plastic',
    pattern:'plain',secondaryColor:'#f0e3bd',labelText:'',sku:'',showArrows:false,
  };
}

export function cargoAppearance(type={}){
  return {...defaultAppearance(type.kind,type.color),...(type.appearance||{})};
}

export function validateAppearance(value,assetCheck){
  if(!value||typeof value!=='object'||!Object.hasOwn(CARGO_MATERIALS,value.material)||!Object.hasOwn(CARGO_PATTERNS,value.pattern))throw Error('货物外观材质或图案无效');
  if(!/^#[0-9a-f]{6}$/i.test(value.secondaryColor))throw Error('货物外观辅助颜色无效');
  for(const key of ['labelText','sku'])if(typeof value[key]!=='string'||value[key].length>80)throw Error('货物标签或 SKU 过长');
  if(typeof value.showArrows!=='boolean')throw Error('货物朝上标记无效');
  if(value.logo)assetCheck(value.logo);
  return value;
}

export function containerAppearance(container={}){
  return {companyName:'',containerNo:'',warningText:'MAX GROSS / CAUTION',condition:10,...(container.appearance||{})};
}

export function validateContainerAppearance(value,assetCheck){
  if(!value||typeof value!=='object')throw Error('集装箱外观无效');
  for(const key of ['companyName','containerNo','warningText'])if(typeof value[key]!=='string'||value[key].length>80)throw Error('集装箱贴花文字过长');
  if(!Number.isFinite(value.condition)||value.condition<0||value.condition>100)throw Error('集装箱新旧程度须为 0–100');
  if(value.logo)assetCheck(value.logo);
  return value;
}
