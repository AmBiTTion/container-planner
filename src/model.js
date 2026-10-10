export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clone = (x) => structuredClone(x);
import {validateAppearance,validateContainerAppearance} from './appearance.js';
export const COLORS = [
  "#c9a36b",
  "#548f86",
  "#6f8cac",
  "#b87e6a",
  "#9b8ab1",
  "#a0a769",
  "#d3a345",
];
export const CONTAINERS = {
  "20GP": {
    name: "20GP · 标准柜",
    length: 5898,
    width: 2352,
    height: 2393,
    doorWidth: 2340,
    doorHeight: 2280,
    maxWeight: 28000,
    tare: 2300,
  },
  "40GP": {
    name: "40GP · 标准柜",
    length: 12032,
    width: 2352,
    height: 2393,
    doorWidth: 2340,
    doorHeight: 2280,
    maxWeight: 26500,
    tare: 3750,
  },
  "40HC": {
    name: "40HC · 高柜",
    length: 12032,
    width: 2352,
    height: 2698,
    doorWidth: 2340,
    doorHeight: 2585,
    maxWeight: 26500,
    tare: 3900,
  },
};
export const PALLETS = {
  "1200×1000": {
    length: 1200,
    width: 1000,
    baseHeight: 150,
    height: 1600,
    maxWeight: 1000,
    tare: 25,
  },
  "1200×800": {
    length: 1200,
    width: 800,
    baseHeight: 144,
    height: 1600,
    maxWeight: 1000,
    tare: 25,
  },
  "1100×1100": {
    length: 1100,
    width: 1100,
    baseHeight: 150,
    height: 1600,
    maxWeight: 1000,
    tare: 25,
  },
};
export function cargo(overrides = {}) {
  return {
    id: uid(),
    name: "新货物",
    kind: "box",
    length: 600,
    width: 400,
    height: 300,
    effectiveLength: 600,
    effectiveWidth: 400,
    effectiveHeight: 300,
    weight: 12,
    auto: true,
    quantity: 100,
    allowRotate: true,
    maxLayers: 8,
    maxLoad: 200,
    priority: 0,
    mustLoad: false,
    batch: "",
    unload: 1,
    color: COLORS[0],
    ...overrides,
  };
}
export function emptyProject() {
  return {
    version: 1,
    id: uid(),
    name: "我的装柜方案",
    updatedAt: new Date().toISOString(),
    container: { ...CONTAINERS["20GP"], preset: "20GP", skin: "classic" },
    pallet: { ...PALLETS["1200×1000"], preset: "1200×1000", overhang: 0 },
    types: [cargo({ name: "标准纸箱", quantity: 180 })],
    placements: [],
    palletPlacements: [],
    assemblies: [],
    templates: [],
    activeTemplate: null,
    settings: {
      objective: "count",
      depth: "fast",
      minSupport: 80,
      gap: 0,
      snap: 50,
    },
    notes: "",
  };
}
export function sampleProject(key = "boxes") {
  const p = emptyProject();
  if (key === "bags") {
    p.name = "编织袋 · 压缩码托";
    p.types = [
      cargo({
        name: "25kg 编织袋",
        kind: "woven",
        length: 600,
        width: 400,
        height: 180,
        effectiveLength: 610,
        effectiveWidth: 410,
        effectiveHeight: 150,
        weight: 25,
        quantity: 240,
        maxLayers: 8,
        maxLoad: 200,
        color: COLORS[1],
      }),
    ];
  } else if (key === "mixed") {
    p.name = "混装 · 箱 / 袋 / 整托";
    p.types = [
      cargo({ name: "A · 纸箱", quantity: 100, weight: 12, color: COLORS[0] }),
      cargo({
        name: "B · 软包",
        kind: "soft",
        length: 500,
        width: 350,
        height: 250,
        effectiveLength: 500,
        effectiveWidth: 350,
        effectiveHeight: 220,
        weight: 8,
        quantity: 120,
        maxLoad: 70,
        maxLayers: 5,
        color: COLORS[1],
      }),
    ];
  } else {
    p.name = "纸箱 · 20GP 装柜";
    p.types[0].name = "600 × 400 纸箱";
  }
  return p;
}
export const RETAILERS = [
  "沃尔玛",
  "山姆会员商店",
  "Costco 开市客",
  "麦德龙",
  "永辉超市",
  "大润发",
  "盒马",
  "华润万家",
];
export function makeRetailTemplate(name = "自定义客户") {
  return {
    id: uid(),
    name,
    region: "",
    warehouse: "",
    category: "",
    source: "",
    revision: "",
    verified: false,
    palletLength: 1200,
    palletWidth: 1000,
    maxHeight: 1600,
    maxWeight: 1000,
    allowMixed: true,
    labelDirection: "未指定",
    notes:
      "待填写客户实际规范；此处尺寸为用户可修改的初始值，不代表该商超官方要求。",
  };
}
export function binFor(p, mode) {
  if (mode === "pallet")
    return {
      length: p.pallet.length + 2 * p.pallet.overhang,
      width: p.pallet.width + 2 * p.pallet.overhang,
      height: p.pallet.height - p.pallet.baseHeight,
      maxWeight: p.pallet.maxWeight,
      doorWidth: 1e9,
      doorHeight: 1e9,
    };
  return p.container;
}
export function allTypes(p) {
  return [...p.types, ...p.assemblies];
}
export function validateProject(p) {
  const fail = (m) => {
    throw Error("项目文件无效：" + m);
  };
  if (
    !p ||
    p.version !== 1 ||
    !Array.isArray(p.types) ||
    !Array.isArray(p.placements) ||
    !Array.isArray(p.palletPlacements) ||
    !Array.isArray(p.assemblies) ||
    !Array.isArray(p.templates) ||
    !p.settings
  )
    fail("缺少必需字段或版本不支持");
  const safeId = (id) =>
    typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
  const checkAsset=a=>{if(!a||!safeId(a.id)||!safeId(a.projectId)||typeof a.name!=='string'||a.name.length>200)fail('附件引用');};
  if (!safeId(p.id)) fail("方案编号");
  if (typeof p.name !== "string" || p.name.length > 200) fail("方案名称");
  const positive = (obj, keys) =>
    keys.forEach((k) => {
      if (!Number.isFinite(obj?.[k]) || obj[k] <= 0 || obj[k] > 1e8)
        fail(k + " 必须是有限正数");
    });
  const nonnegative = (obj, keys) =>
    keys.forEach((k) => {
      if (!Number.isFinite(obj?.[k]) || obj[k] < 0 || obj[k] > 1e8)
        fail(k + " 必须是非负数");
    });
  positive(p.container, [
    "length",
    "width",
    "height",
    "doorWidth",
    "doorHeight",
    "maxWeight",
  ]);
  nonnegative(p.container, ["tare"]);
  if(p.container.skin!==undefined&&p.container.skin!=='custom'&&!['classic','ocean','cargo','reefer','graphite','sand'].includes(p.container.skin))fail('集装箱皮肤');
  if(p.container.skinColor!==undefined&&!/^#[0-9a-f]{6}$/i.test(p.container.skinColor))fail('集装箱自定义颜色');
  if(p.container.appearance)try{validateContainerAppearance(p.container.appearance,checkAsset);}catch(e){fail(e.message);}
  positive(p.pallet, ["length", "width", "height", "baseHeight", "maxWeight"]);
  nonnegative(p.pallet, ["tare", "overhang"]);
  if (p.pallet.height <= p.pallet.baseHeight)
    fail("托盘总高度必须大于底座高度");
  if(p.pallet.design){
    const d=p.pallet.design;if(d.version!==1||!['block','stringer','nine','plastic','steel','custom'].includes(d.preset)||!['wood','plastic','steel'].includes(d.material)||!/^#[0-9a-f]{6}$/i.test(d.color)||!/^#[0-9a-f]{6}$/i.test(d.secondaryColor)||typeof d.logoText!=='string'||d.logoText.length>80||!Array.isArray(d.components)||!d.components.length||d.components.length>120)fail('托盘设计');
    const partIds=new Set();for(const c of d.components){if(!c||!safeId(c.id)||partIds.has(c.id)||!['board','beam','block','runner','rib','plate'].includes(c.kind)||typeof c.support!=='boolean')fail('托盘零件');partIds.add(c.id);nonnegative(c,['x','y','z']);positive(c,['length','width','height']);if(c.x+c.length>p.pallet.length+.05||c.y+c.width>p.pallet.width+.05||c.z+c.height>p.pallet.baseHeight+.05||c.support&&Math.abs(c.z+c.height-p.pallet.baseHeight)>.1)fail('托盘零件边界或承重面');}if(!d.components.some(c=>c.support))fail('托盘缺少承重面');
  }
  const types = allTypes(p),
    ids = new Set();
  if (
    types.length > 200 ||
    p.placements.length > 5000 ||
    p.palletPlacements.length > 5000
  )
    fail("超过 200 种规格或 5000 个装载单元");
  for (const t of types) {
    if (!safeId(t.id) || ids.has(t.id)) fail("货物编号重复或格式错误");
    ids.add(t.id);
    if (
      typeof t.name !== "string" ||
      t.name.length > 200 ||
      !["box", "soft", "woven", "pallet"].includes(t.kind)
    )
      fail("货物名称或类型");
    positive(t, [
      "length",
      "width",
      "height",
      "effectiveLength",
      "effectiveWidth",
      "effectiveHeight",
    ]);
    nonnegative(t, ["quantity", "maxLoad", "priority"]);
    if(t.isBase) nonnegative(t,["weight"]); else positive(t,["weight"]);
    positive(t, ["maxLayers", "unload"]);
    if (
      !Number.isInteger(t.quantity) ||
      !Number.isInteger(t.maxLayers) ||
      t.quantity > 100000
    )
      fail("库存和层数必须为整数");
    if (!/^#[0-9a-f]{6}$/i.test(t.color)) fail("货物颜色");
    if(t.appearance)try{validateAppearance(t.appearance,checkAsset);}catch(e){fail(e.message);}
    if (typeof t.allowRotate !== "boolean" || typeof t.mustLoad !== "boolean")
      fail("货物规则开关");
  }
  const checkPlacements = (arr) => {
    const seen = new Set();
    for (const a of arr) {
      if (!a || !ids.has(a.typeId) || !safeId(a.id) || seen.has(a.id))
        fail("摆放引用错误");
      seen.add(a.id);
      for (const k of ["x", "y", "z", "rotation"])
        if (!Number.isFinite(a[k]) || Math.abs(a[k]) > 1e8)
          fail("摆放坐标错误");
    }
  };
  checkPlacements(p.placements);
  checkPlacements(p.palletPlacements);
  for (const a of p.assemblies) {
    if (
      !Array.isArray(a.children) ||
      !a.children.length ||
      a.children.length > 5000
    )
      fail("整托明细错误");
    checkPlacements(a.children);
    if (a.children.some((c) => p.assemblies.some((t) => t.id === c.typeId)))
      fail("不支持嵌套整托");
    positive(a, ["baseHeight", "deckLength", "deckWidth"]);
    nonnegative(a, ["tare", "overhang"]);
    a.weight =
      a.tare +
      a.children.reduce(
        (s, c) => s + p.types.find((t) => t.id === c.typeId).weight,
        0,
      );
    a.height = a.effectiveHeight =
      a.baseHeight +
      Math.max(
        ...a.children.map(
          (c) => c.z + p.types.find((t) => t.id === c.typeId).effectiveHeight,
        ),
      );
    if(a.palletDesign){const pallet={length:a.deckLength,width:a.deckWidth,baseHeight:a.baseHeight,design:a.palletDesign};const d=a.palletDesign;if(d.version!==1||!Array.isArray(d.components)||!d.components.length||d.components.length>120)fail('整托外观设计');for(const c of d.components){positive(c,['length','width','height']);nonnegative(c,['x','y','z']);if(c.x+c.length>pallet.length+.05||c.y+c.width>pallet.width+.05||c.z+c.height>pallet.baseHeight+.05)fail('整托外观零件边界');}}
  }
  for (const t of p.templates) {
    if (!safeId(t.id) || typeof t.name !== "string" || t.name.length > 200)
      fail("模板错误");
    positive(t, ["palletLength", "palletWidth", "maxHeight", "maxWeight"]);
    for(const k of ['validFrom','validTo'])if(t[k]&&(typeof t[k]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t[k])||!Number.isFinite(Date.parse(t[k]))||new Date(t[k]).toISOString().slice(0,10)!==t[k]))fail('规则有效期');
    if(t.validFrom&&t.validTo&&t.validFrom>t.validTo)fail('规则有效期先后顺序');
  }
  if (
    !["count", "volume"].includes(p.settings.objective) ||
    !["fast", "deep"].includes(p.settings.depth)
  )
    fail("优化设置");
  nonnegative(p.settings, ["gap", "snap", "minSupport"]);
  if (p.settings.minSupport > 100) fail("支撑比例");
  if(p.settings.operations){const o=p.settings.operations;nonnegative(o,['door','front','side','top']);nonnegative(o.limits,['front','rear','left','right']);if(typeof o.enforceGap!=='boolean')fail('间距规则开关');if(o.front+o.door>=p.container.length||o.side*2>=p.container.width||o.top>=p.container.height)fail('作业余量不能占满柜内空间');}
  if(p.settings.bagScenario&&!['ideal','conservative'].includes(p.settings.bagScenario))fail('袋子尺寸方案');
  if(p.settings.bagPattern&&!['auto','straight','rotated','brick','alternating'].includes(p.settings.bagPattern))fail('软包码放策略');
  for(const t of p.types)for(const k of ['bagIdeal','bagTolerance'])if(t[k]&&(!Array.isArray(t[k])||t[k].length!==3||t[k].some(n=>!Number.isFinite(n)||n<0||n>1e8)))fail('袋子尺寸容差');
  const checkAssets=arr=>{if(!Array.isArray(arr)||arr.length>30)fail('附件列表');for(const a of arr)checkAsset(a);};
  for(const t of p.templates)if(t.attachments)checkAssets(t.attachments);
  if(p.loadingRecord){const r=p.loadingRecord;if(!r.rows||typeof r.rows!=='object'||Array.isArray(r.rows)||Object.keys(r.rows).length>200)fail('现场核对记录');for(const [id,row] of Object.entries(r.rows))if(!safeId(id)||!row||(row.actual!==null&&(!Number.isInteger(row.actual)||row.actual<0||row.actual>100000))||typeof row.note!=='string'||row.note.length>2000)fail('实装数量或备注');if(r.photos)checkAssets(r.photos);for(const k of ['operator','containerNo','sealNo','notes','fingerprint'])if(r[k]!==undefined&&(typeof r[k]!=='string'||r[k].length>6*1024*1024))fail('现场记录字段');}
  if(p.assemblyEdit){const s=p.assemblyEdit;if(!safeId(s.itemId)||!safeId(s.typeId)||!Array.isArray(s.placements)||s.placements.length>5000)fail('整托编辑恢复信息');checkPlacements(s.placements);positive(s.pallet,['length','width','baseHeight','height','maxWeight']);nonnegative(s.pallet,['overhang','tare']);}
  if(p.fleet){
    if(new TextEncoder().encode(JSON.stringify(p)).byteLength>11*1024*1024)fail('保存分柜结果后项目超过 11MB，请减少单组柜数');
    if(typeof p.fleet.fingerprint!=='string'||typeof p.fleet.currency!=='string'||p.fleet.currency.length>200||!Array.isArray(p.fleet.result)||p.fleet.result.length>3)fail('分柜结果');
    for(const r of p.fleet.result){
      if(!Array.isArray(r.schedule)||r.schedule.length>100||r.schedule.some(k=>!Object.hasOwn(CONTAINERS,k))||!Array.isArray(r.containers)||r.containers.length>20||!Array.isArray(r.remaining)||r.remaining.length>200)fail('分柜结果格式');
      for(const c of r.containers){positive(c.container,['length','width','height','doorWidth','doorHeight','maxWeight']);nonnegative(c.container,['tare']);if(!Array.isArray(c.items)||c.items.length>5000)fail('分柜摆放');
        // Old results can retain former spec ids and are shown only while their fingerprint matches.
        const seen=new Set();for(const i of c.items){if(!safeId(i.id)||seen.has(i.id)||!safeId(i.typeId))fail('分柜货物编号');seen.add(i.id);for(const k of ['x','y','z','rotation'])if(!Number.isFinite(i[k])||Math.abs(i[k])>1e8)fail('分柜坐标');}
        nonnegative(c,['pieces','weight','utilization']);if(c.cost!==null)nonnegative(c,['cost']);
      }
      for(const t of r.remaining)if(!safeId(t.id)||typeof t.name!=='string'||!Number.isInteger(t.count)||t.count<0)fail('分柜余量');if(r.cost!==null)nonnegative(r,['cost']);
    }
  }
  return p;
}
