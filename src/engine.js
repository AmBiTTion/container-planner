import { uid, allTypes, binFor, clone } from "./model.js";
import {doorBodies} from './doors.js';
import {clearanceIssue,workingSpace,regionalIssue,regionalWeight} from './operations.js';
import {palletSupportPolygons} from './pallet-design.js';
const EPS = 0.05;
export function dimensions(t) {
  return [t.effectiveLength, t.effectiveWidth, t.effectiveHeight];
}
export function footprint(t, rotation = 0) {
  const [l, w, h] = dimensions(t),
    a = (rotation * Math.PI) / 180,
    c = Math.abs(Math.cos(a)),
    s = Math.abs(Math.sin(a));
  return { l: l * c + w * s, w: l * s + w * c, h };
}
export function shape(item, t) {
  const d = footprint(t, item.rotation),
    cx = item.x + d.l / 2,
    cy = item.y + d.w / 2,
    a = (item.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    [l, w] = dimensions(t);
  return {
    x: item.x,
    y: item.y,
    z: item.z,
    l: d.l,
    w: d.w,
    h: d.h,
    polygon: [
      [-l / 2, -w / 2],
      [l / 2, -w / 2],
      [l / 2, w / 2],
      [-l / 2, w / 2],
    ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]),
  };
}
const cross = (a, b, p) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
export function polygonArea(p) {
  return (
    Math.abs(
      p.reduce((s, a, i) => {
        const b = p[(i + 1) % p.length];
        return s + a[0] * b[1] - a[1] * b[0];
      }, 0),
    ) / 2
  );
}
export function intersectionArea(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length],
      input = out;
    out = [];
    if (!input.length) break;
    let prev = input.at(-1),
      pc = cross(a, b, prev);
    for (const cur of input) {
      const cc = cross(a, b, cur);
      if (cc >= 0 !== pc >= 0) {
        const f = pc / (pc - cc);
        out.push([
          prev[0] + f * (cur[0] - prev[0]),
          prev[1] + f * (cur[1] - prev[1]),
        ]);
      }
      if (cc >= 0) out.push(cur);
      prev = cur;
      pc = cc;
    }
  }
  return out.length >= 3 ? polygonArea(out) : 0;
}
export function collides(a, b) {
  if (
    a.x + a.l <= b.x + EPS ||
    b.x + b.l <= a.x + EPS ||
    a.y + a.w <= b.y + EPS ||
    b.y + b.w <= a.y + EPS ||
    a.z + a.h <= b.z + EPS ||
    b.z + b.h <= a.z + EPS
  )
    return false;
  return intersectionArea(a.polygon, b.polygon) > 1;
}
export function overlaps2D(a, b) {
  if (
    a.x + a.l <= b.x + EPS ||
    b.x + b.l <= a.x + EPS ||
    a.y + a.w <= b.y + EPS ||
    b.y + b.w <= a.y + EPS
  )
    return 0;
  return intersectionArea(a.polygon, b.polygon);
}
export function outside(a, bin) {
  return (
    a.x < -EPS ||
    a.y < -EPS ||
    a.z < -EPS ||
    a.x + a.l > bin.length + EPS ||
    a.y + a.w > bin.width + EPS ||
    a.z + a.h > bin.height + EPS
  );
}
export function consumption(t) {
  if (t.kind !== "pallet") return { [t.id]: 1 };
  const counts = { [t.id]: 1 };
  for (const c of t.children) counts[c.typeId] = (counts[c.typeId] || 0) + 1;
  return counts;
}
export function pieceCount(t) {
  return t.isBase ? 0 : t.kind === "pallet" ? t.children.length : 1;
}
export function itemVolume(t, types) {
  if (t.kind !== "pallet")
    return t.effectiveLength * t.effectiveWidth * t.effectiveHeight;
  return (
    t.length * t.width * t.baseHeight +
    t.children.reduce(
      (s, c) =>
        s +
        itemVolume(
          types.find((t) => t.id === c.typeId),
          types,
        ),
      0,
    )
  );
}
export function usedCounts(items, types) {
  const out = {};
  for (const p of items) {
    const t = types.find((t) => t.id === p.typeId);
    if (t)
      for (const [id, n] of Object.entries(consumption(t)))
        out[id] = (out[id] || 0) + n;
  }
  return out;
}
export function physical(p, mode = "container", items = null) {
  const types = allTypes(p),
    map = new Map(types.map((t) => [t.id, t]));
  return (items ?? (mode === "pallet" ? p.palletPlacements : p.placements)).map(
    (i) => ({ item: i, t: map.get(i.typeId), ...shape(i, map.get(i.typeId)) }),
  );
}
export function groundFor(p, mode) {
  if (mode !== "pallet") return null;
  const surfaces=palletSupportPolygons(p.pallet);if(surfaces?.length)return surfaces;
  const { length: l, width: w, overhang: o } = p.pallet;
  return [
    [o, o],
    [o + l, o],
    [o + l, o + w],
    [o, o + w],
  ];
}
export function supportsFor(a, objects, ground = null) {
  if (a.z <= EPS)
    return {
      ratio: ground
        ? Math.min(1,(typeof ground?.[0]?.[0]==='number'?[ground]:ground).reduce((sum,polygon)=>sum+intersectionArea(a.polygon,polygon),0) / polygonArea(a.polygon))
        : 1,
      under: [],
    };
  const area = polygonArea(a.polygon),
    under = [];
  let total = 0;
  for (const b of objects) {
    if (b.item.id === a.item.id || Math.abs(b.z + b.h - a.z) > EPS) continue;
    const overlap = overlaps2D(a, b);
    if (overlap > 1) {
      under.push({ id: b.item.id, area: overlap });
      total += overlap;
    }
  }
  return {
    ratio: Math.min(1, total / area),
    under: under.map((x) => ({ ...x, share: x.area / total })),
  };
}
export function analyze(
  p,
  mode = "container",
  items = null,
  { skipOrder = false, skipAssemblies = false } = {},
) {
  const types = allTypes(p),
    objects = physical(p, mode, items),
    bin = binFor(p, mode),
    issues = [],
    support = new Map(),
    loads = new Map(objects.map((x) => [x.item.id, 0])),
    levels = new Map();
  const closedDoors=mode==='container'?doorBodies(bin):[];
  const add = (code, text, ids = [], level = "error", textEn = code) =>
    issues.push({ code, text, ids, level, textEn });
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    const clearance=clearanceIssue(p,mode,a,objects);if(clearance)add(clearance.code,`${a.t.name}：${clearance.text}`,[a.item.id],'error',`${a.t.name}: ${clearance.textEn}`);
    if (outside(a, bin)) add("bounds", `${a.t.name} 超出装载边界`, [a.item.id], 'error', `${a.t.name} exceeds the loading boundaries.`);
    if(a.x+a.l>bin.length+.05)for(const door of closedDoors)if(collides(a,door))add('door-collision',`${a.t.name} 与闭合位置的${door.name}重叠，柜门不能正常关闭`,[a.item.id],'error',`${a.t.name} overlaps the ${door.nameEn.toLowerCase()} in the closed position; the door cannot close normally.`);
    if (
      !a.t.allowRotate &&
      Math.abs(((a.item.rotation % 360) + 360) % 360) > EPS
    )
      add("orientation", `${a.t.name} 不允许旋转`, [a.item.id], 'error', `${a.t.name}: rotation is not allowed.`);
    if (
      mode === "container" &&
      (a.w > bin.doorWidth + EPS || a.h > bin.doorHeight + EPS)
    )
      add("door", `${a.t.name} 当前朝向不能通过柜门`, [a.item.id], 'error', `${a.t.name} cannot pass through the container door in this orientation.`);
    for (let j = i + 1; j < objects.length; j++)
      if (collides(a, objects[j]))
        add("collision", `${a.t.name} 与 ${objects[j].t.name} 重叠`, [
          a.item.id,
          objects[j].item.id,
        ], 'error', `${a.t.name} overlaps ${objects[j].t.name}.`);
    const s = supportsFor(a, objects, groundFor(p, mode));
    support.set(a.item.id, s);
    if (s.ratio * 100 + 0.01 < p.settings.minSupport)
      add(
        "support",
        `${a.t.name} 底部支撑 ${(s.ratio * 100).toFixed(0)}%，要求 ${p.settings.minSupport}%`,
        [a.item.id],
        'error', `${a.t.name}: base support ${(s.ratio*100).toFixed(0)}%; minimum required ${p.settings.minSupport}%.`,
      );
  }
  for (const a of [...objects].sort((a, b) => a.z - b.z)) {
    const s = support.get(a.item.id);
    const level =
      (a.t.isBase ? 0 : 1) +
      Math.max(0, ...s.under.map((u) => levels.get(u.id) || 0));
    levels.set(a.item.id, level);
    if (level > a.t.maxLayers)
      add(
        "layers",
        `${a.t.name} 位于第 ${level} 层，超过限制 ${a.t.maxLayers} 层`,
        [a.item.id],
        'error', `${a.t.name} is on layer ${level}; maximum permitted layer ${a.t.maxLayers}.`,
      );
  }
  for (const a of [...objects].sort((a, b) => b.z - a.z)) {
    const top = loads.get(a.item.id);
    if (top > a.t.maxLoad + EPS)
      add(
        "bearing",
        `${a.t.name} 上方负载 ${top.toFixed(1)} kg，超过 ${a.t.maxLoad} kg`,
        [a.item.id],
        'error', `${a.t.name}: load above ${top.toFixed(1)} kg exceeds the ${a.t.maxLoad} kg limit.`,
      );
    for (const u of support.get(a.item.id).under)
      loads.set(u.id, loads.get(u.id) + (a.t.weight + top) * u.share);
  }
  const used = usedCounts(
    objects.map((x) => x.item),
    types,
  );
  for (const t of types)
    if ((used[t.id] || 0) > t.quantity)
      add(
        "stock",
        `${t.name} 使用 ${used[t.id]}，库存只有 ${t.quantity}`,
        objects.filter((x) => consumption(x.t)[t.id]).map((x) => x.item.id),
        'error', `${t.name}: ${used[t.id]} used, but only ${t.quantity} available.`,
      );
  let weight = 0,
    pieces = 0,
    volume = 0,
    envelopeVolume = 0,
    cx = 0,
    cy = 0,
    cz = 0;
  for (const a of objects) {
    weight += a.t.weight;
    pieces += pieceCount(a.t);
    volume += itemVolume(a.t, types);
    envelopeVolume +=
      a.t.effectiveLength * a.t.effectiveWidth * a.t.effectiveHeight;
    const center = itemCenter(a.item, a.t, types);
    cx += a.t.weight * center.x;
    cy += a.t.weight * center.y;
    cz += a.t.weight * center.z;
  }
  if (weight > bin.maxWeight + EPS)
    add("weight", `载货 ${weight.toFixed(1)} kg 超过限重 ${bin.maxWeight} kg`, [], 'error', `Payload ${weight.toFixed(1)} kg exceeds the ${bin.maxWeight} kg limit.`);
  const total = bin.length * bin.width * bin.height;
  const regional=mode==='container'?regionalIssue(p,objects):null;if(regional)add(regional.code,regional.text,[],'error',regional.textEn);
  if (!skipAssemblies)
    for (const t of types.filter((t) => t.kind === "pallet" && used[t.id])) {
      const cp = {
        ...p,
        palletPlacements: t.children,
        pallet: {
          length: t.deckLength,
          width: t.deckWidth,
          overhang: t.overhang,
          baseHeight: t.baseHeight,
          height: t.height,
          maxWeight: t.payloadLimit ?? 1e8,
          tare: t.tare,
        },
        activeTemplate: t.templateId,
      };
      const inside = analyze(cp, "pallet", null, {
        skipOrder: true,
        skipAssemblies: true,
      });
      for (const issue of inside.issues)
        add(
          "assembly-" + issue.code,
          `${t.name} 内部：${issue.text}`,
          objects.filter((x) => x.t.id === t.id).map((x) => x.item.id),
          issue.level,
          `${t.name} internal check: ${issue.textEn}`,
        );
    }
  if (!skipAssemblies)
    for (const t of mode === "pallet" ? p.types : types)
      if (t.mustLoad && (used[t.id] || 0) < t.quantity)
        add(
          "required",
          `${t.name} 要求装完，仍剩 ${t.quantity - (used[t.id] || 0)}`,
          [],
          "warning",
          `${t.name} must be fully loaded; ${t.quantity-(used[t.id]||0)} remain unloaded.`,
        );
  if (!skipOrder && mode === "container" && new Set(objects.map(a=>a.t.unload||1)).size>1) {
    let orderCount = 0;
    for (const a of objects)
      for (const b of objects) {
        if (
          a.item.id === b.item.id ||
          (a.t.unload || 1) >= (b.t.unload || 1) ||
          b.x < a.x + a.l - EPS
        )
          continue;
        if (
          Math.min(a.y + a.w, b.y + b.w) - Math.max(a.y, b.y) > EPS &&
          Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z) > EPS
        ) {
          if (orderCount++ < 10)
            add(
              "unload",
              `${a.t.name}（先卸）被靠近柜门的 ${b.t.name} 遮挡`,
              [a.item.id, b.item.id],
              "warning",
              `${a.t.name} (earlier unloading) is blocked by ${b.t.name} closer to the door.`,
            );
          break;
        }
      }
  }
  if (mode === "pallet" && p.activeTemplate) {
    const rt = p.templates.find((t) => t.id === p.activeTemplate);
    if (rt) {
      const today=new Date().toISOString().slice(0,10);
      if(rt.validFrom&&today<rt.validFrom)add('template-date','客户规则尚未生效',[],'warning','The customer rule is not yet effective.');
      if(rt.validTo&&today>rt.validTo)add('template-date','客户规则已超过有效期，请复核',[],'warning','The customer rule has expired; revalidation is required.');
      if (!rt.verified) add("template", "当前客户模板尚未核实", [], "warning", 'The active customer template has not been verified.');
      if (!rt.allowMixed && new Set(objects.map((x) => x.item.typeId)).size > 1)
        add("mixed", "客户模板不允许混托", [], 'error', 'The customer template does not allow mixed-SKU pallets.');
      if (weight + p.pallet.tare > rt.maxWeight + EPS)
        add("retail-weight", `含托重量超过客户限制 ${rt.maxWeight} kg`, [], 'error', `Weight including pallet exceeds the customer limit of ${rt.maxWeight} kg.`);
      if (
        Math.max(0, ...objects.map((x) => x.z + x.h)) + p.pallet.baseHeight >
        rt.maxHeight + EPS
      )
        add("retail-height", "含托高度超过客户模板限制", [], 'error', `Height including pallet exceeds the customer limit of ${rt.maxHeight} mm.`);
    }
  }
  return {
    issues,
    regional:mode==='container'?regionalWeight(objects,bin):null,
    used,
    weight,
    gross: weight + (mode === "container" ? p.container.tare : p.pallet.tare),
    pieces,
    units: objects.length,
    volume,
    envelopeVolume,
    utilization: total ? volume / total : 0,
    freeVolume: Math.max(0, total - volume),
    height: Math.max(0, ...objects.map((x) => x.z + x.h)),
    center: weight ? { x: cx / weight, y: cy / weight, z: cz / weight } : null,
    loads: Object.fromEntries(loads),
    supports:Object.fromEntries([...support].map(([id,s])=>[id,{ratio:s.ratio}])),
    minSupport:p.settings.minSupport/100,
    levels: Object.fromEntries(levels),
    valid: !issues.some((x) => x.level === "error"),
  };
}
export function itemCenter(item, t, types) {
  const d = footprint(t, item.rotation);
  if (t.kind !== "pallet")
    return { x: item.x + d.l / 2, y: item.y + d.w / 2, z: item.z + d.h / 2 };
  let x = (t.length / 2) * t.tare,
    y = (t.width / 2) * t.tare,
    z = (t.baseHeight / 2) * t.tare;
  for (const ch of t.children) {
    const ct = types.find((x) => x.id === ch.typeId),
      cd = footprint(ct, ch.rotation);
    x += (ch.x + cd.l / 2) * ct.weight;
    y += (ch.y + cd.w / 2) * ct.weight;
    z += (ch.z + ct.effectiveHeight / 2 + t.baseHeight) * ct.weight;
  }
  x = x / t.weight - t.length / 2;
  y = y / t.weight - t.width / 2;
  z /= t.weight;
  const a = (item.rotation * Math.PI) / 180;
  return {
    x: item.x + d.l / 2 + x * Math.cos(a) - y * Math.sin(a),
    y: item.y + d.w / 2 + x * Math.sin(a) + y * Math.cos(a),
    z: item.z + z,
  };
}

export function makeAssembly(p, name) {
  const r = analyze(p, "pallet");
  if (!p.palletPlacements.length) throw Error("请先在码托区摆放货物");
  if (!r.valid) throw Error("码托方案还有违规，请先修正后保存整托");
  const { length, width, baseHeight, tare, overhang, maxWeight } = p.pallet;
  return {
    id: uid(),
    name: name || `整托 ${p.assemblies.length + 1}`,
    kind: "pallet",
    length: length + 2 * overhang,
    width: width + 2 * overhang,
    height: r.height + baseHeight,
    effectiveLength: length + 2 * overhang,
    effectiveWidth: width + 2 * overhang,
    effectiveHeight: r.height + baseHeight,
    baseHeight,
    tare,
    deckLength: length,
    deckWidth: width,
    overhang,
    payloadLimit: maxWeight,
    weight: r.weight + tare,
    quantity: 20,
    allowRotate: true,
    maxLayers: 1,
    maxLoad: 0,
    priority: 0,
    mustLoad: false,
    batch: "",
    unload: 1,
    color: "#8b9b66",
    children: clone(p.palletPlacements),
    templateId: p.activeTemplate,
    palletDesign:p.pallet.design?clone(p.pallet.design):undefined,
  };
}

function orientations(t) {
  return t.allowRotate && Math.abs(t.effectiveLength - t.effectiveWidth) > EPS
    ? [0, 90]
    : [0];
}
export const AUTO_UNIT_LIMIT = 5000;

// Enumerate mixed 0/90-degree rows in both axes. Repeating the same layer
// gives full column support; the normal validator remains the authority.
export function rowCandidate(p, mode = 'container') {
  const source=mode==='pallet'?p.palletPlacements:p.placements;
  const allowed=(mode==='pallet'?p.types:allTypes(p)).filter(t=>t.auto!==false&&t.quantity>0&&!t.isBase);
  if(source.some(i=>i.locked)||allowed.length!==1||allowed[0].kind==='pallet')return null;
  const t=allowed[0],b=binFor(p,mode),w=workingSpace(p,mode),gap=p.settings.gap;
  const dims=orientations(t).map(rotation=>({rotation,...footprint(t,rotation)})).filter(d=>mode!=='container'||(d.w<=b.doorWidth+.05&&d.h<=b.doorHeight+.05));
  const layers=Math.max(0,Math.min(t.maxLayers,Math.floor((w.maxZ+.05)/t.effectiveHeight),1+Math.floor((t.maxLoad+.05)/t.weight)));
  const cap=Math.min(AUTO_UNIT_LIMIT,t.quantity,Math.floor((b.maxWeight+.05)/t.weight));
  let best={count:0,rows:[],axis:0};
  for(const axis of [0,1]){
    const along=axis?w.maxY-w.minY:w.maxX-w.minX,across=axis?w.maxX-w.minX:w.maxY-w.minY;
    const options=dims.map(d=>({...d,run:axis?d.w:d.l,span:axis?d.l:d.w}));
    for(const a of options)for(const c of options){
      const perA=Math.floor((along+gap+.05)/(a.run+gap)),perC=Math.floor((along+gap+.05)/(c.run+gap));
      const maxA=Math.min(AUTO_UNIT_LIMIT,Math.floor((across+gap+.05)/(a.span+gap)));
      for(let na=0;na<=maxA;na++){
        const nc=Math.max(0,Math.min(AUTO_UNIT_LIMIT,Math.floor((across+gap-na*(a.span+gap)+.05)/(c.span+gap))));
        const count=Math.min(cap,(na*perA+nc*perC)*layers);
        if(count>best.count)best={count,axis,rows:[{d:a,n:na,per:perA},{d:c,n:nc,per:perC}]};
      }
    }
  }
  if(!best.count)return null;
  const items=[];
  outer:for(let layer=0;layer<layers;layer++){
    let cross=0;
    for(const row of best.rows)for(let j=0;j<row.n;j++){
      for(let k=0;k<row.per;k++){
        items.push({id:uid(),typeId:t.id,x:w.minX+(best.axis?cross:k*(row.d.run+gap)),y:w.minY+(best.axis?k*(row.d.run+gap):cross),z:layer*t.effectiveHeight,rotation:row.d.rotation,locked:false});
        if(items.length>=best.count)break outer;
      }
      cross+=row.d.span+gap;
    }
  }
  const report=analyze(p,mode,items);
  if(!report.valid)return null;
  return {items,report,label:'横竖混排 · 整层比较',strategy:'rows',limited:items.length>=AUTO_UNIT_LIMIT,termination:items.length>=AUTO_UNIT_LIMIT?'unit-limit':'row-search',diagnostics:{layers,perLayer:best.rows.reduce((s,r)=>s+r.n*r.per,0)}};
}
function simpleBagCandidate(p,mode,pattern){
  const source=mode==='pallet'?p.palletPlacements:p.placements,allowed=(mode==='pallet'?p.types:allTypes(p)).filter(t=>t.auto!==false&&t.quantity>0&&!t.isBase);
  if(source.some(i=>i.locked)||allowed.length!==1||!['soft','woven'].includes(allowed[0].kind))return null;
  const t=allowed[0],b=binFor(p,mode),w=workingSpace(p,mode),gap=p.settings.gap,layers=Math.max(0,Math.min(t.maxLayers,Math.floor((w.maxZ+.05)/t.effectiveHeight),1+Math.floor((t.maxLoad+.05)/t.weight))),cap=Math.min(AUTO_UNIT_LIMIT,t.quantity,Math.floor((b.maxWeight+.05)/t.weight));
  const make=(rotation,brick=false)=>{
    if(rotation===90&&!t.allowRotate)return null;const d=footprint(t,rotation);if(mode==='container'&&(d.w>b.doorWidth+.05||d.h>b.doorHeight+.05))return null;
    let best=[];
    for(const axis of [0,1]){
      const along=axis?w.maxY-w.minY:w.maxX-w.minX,across=axis?w.maxX-w.minX:w.maxY-w.minY,run=axis?d.w:d.l,span=axis?d.l:d.w,rows=Math.floor((across+gap+.05)/(span+gap)),positions=[];
      for(let row=0;row<rows;row++){
        const offset=brick&&row%2?(run+gap)/2:0,per=Math.floor((along-offset+gap+.05)/(run+gap));
        for(let k=0;k<per;k++)positions.push({x:w.minX+(axis?row*(span+gap):offset+k*(run+gap)),y:w.minY+(axis?offset+k*(run+gap):row*(span+gap)),rotation});
      }
      if(positions.length>best.length)best=positions;
    }
    return best;
  };
  const zero=make(0,pattern==='brick'),ninety=make(90,pattern==='brick');let layerPlans=[],label='';
  if(pattern==='straight'){layerPlans=[zero];label='软包直排 · 0°';}
  if(pattern==='rotated'){layerPlans=[ninety];label='软包转向直排 · 90°';}
  if(pattern==='brick'){const best=[zero,ninety].filter(Boolean).sort((a,b)=>b.length-a.length)[0];layerPlans=[best];label='软包砖墙错缝';}
  if(pattern==='alternating'){if(!ninety?.length)return null;layerPlans=[zero,ninety];label='软包交替转向层';}
  if(!layerPlans.length||layerPlans.some(x=>!x?.length))return null;
  const items=[];outer:for(let layer=0;layer<layers;layer++)for(const q of layerPlans[layer%layerPlans.length]){items.push({id:uid(),typeId:t.id,x:q.x,y:q.y,z:layer*t.effectiveHeight,rotation:q.rotation,locked:false});if(items.length>=cap)break outer;}
  const report=analyze(p,mode,items);if(!report.valid)return null;
  return {items,report,label,strategy:'bag-'+pattern,pattern,limited:items.length>=AUTO_UNIT_LIMIT,termination:items.length>=AUTO_UNIT_LIMIT?'unit-limit':'pattern-search',diagnostics:{layers,perLayer:layerPlans.map(x=>x.length)}};
}
export function bagPatternCandidates(p,mode='container'){
  const policy=p.settings.bagPattern||'auto',patterns=policy==='auto'?['straight','rotated','brick','alternating']:[policy],out=[];
  for(const pattern of patterns){const c=simpleBagCandidate(p,mode,pattern);if(c&&!out.some(x=>x.report.pieces===c.report.pieces&&x.items.filter(i=>i.rotation===90).length===c.items.filter(i=>i.rotation===90).length))out.push(c);}
  return out;
}
function canConsume(t, used, types) {
  for (const [id, n] of Object.entries(consumption(t))) {
    const spec = types.find((x) => x.id === id);
    if (!spec || (used[id] || 0) + n > spec.quantity) return false;
  }
  return true;
}
function attempt(p, mode, strategy, onProgress, stopAt) {
  const work=workingSpace(p,mode);
  const bin = binFor(p, mode),
    types = allTypes(p),
    source = mode === "pallet" ? p.palletPlacements : p.placements,
    items = clone(source.filter((x) => x.locked));
  const base = analyze(p, mode, items, { skipOrder: true });
  if (!base.valid)
    return {
      error:
        "锁定货物存在碰撞、悬空或其他违规，无法在此基础上自动填充。请先修正或解锁。",
      items,
      report: base,
    };
  const allowed = (mode === "pallet" ? p.types : types).filter(
      (t) => t.quantity > 0 && t.auto !== false && !t.isBase,
    ),
    used = usedCounts(items, types),
    gap = p.settings.gap;
  allowed.sort(
    (a, b) =>
      Number(b.mustLoad) - Number(a.mustLoad) ||
      (b.priority || 0) - (a.priority || 0) ||
      (strategy === 0
        ? p.settings.objective === "count"
          ? pieceCount(b) / b.weight - pieceCount(a) / a.weight
          : itemVolume(b, types) - itemVolume(a, types)
        : strategy === 1
          ? b.effectiveLength * b.effectiveWidth -
            a.effectiveLength * a.effectiveWidth
          : strategy === 2
            ? b.weight - a.weight
            : a.effectiveHeight - b.effectiveHeight),
  );
  let objects = physical(p, mode, items),
    report = base,
    points = [[work.minX, work.minY, 0]],
    processed = 0;
  const objectMap=new Map(objects.map(a=>[a.item.id,a]));
  const supportCache=new Map(objects.map(a=>[a.item.id,supportsFor(a,objects,groundFor(p,mode))]));
  const regionalLimits=mode==='container'&&Object.values(p.settings.operations?.limits||{}).some(v=>v>0);
  const rejected={};
  const reject=key=>{rejected[key]=(rejected[key]||0)+1;};
  const pointKeys = new Set([`${work.minX}:${work.minY}:0`]);
  const addPoint = (x, y, z) => {
    x = Math.round(x * 100) / 100;
    y = Math.round(y * 100) / 100;
    z = Math.round(z * 100) / 100;
    if (
      x >= bin.length - EPS ||
      y >= bin.width - EPS ||
      z >= bin.height - EPS ||
      x < 0 ||
      y < 0 ||
      z < 0
    )
      return;
    const key = `${x}:${y}:${z}`;
    if (!pointKeys.has(key)) {
      points.push([x, y, z]);
      pointKeys.add(key);
    }
  };
  const expand = (a) => {
    addPoint(a.x + a.l + gap, a.y, a.z);
    addPoint(a.x, a.y + a.w + gap, a.z);
    addPoint(a.x, a.y, a.z + a.h);
    addPoint(a.x + a.l + gap, work.minY, 0);
    addPoint(work.minX, a.y + a.w + gap, 0);
    addPoint(work.minX, work.minY, a.z + a.h);
    for (const b of objects) {
      if (Math.abs(b.z - a.z) < EPS) {
        addPoint(a.x + a.l + gap, b.y, a.z);
        addPoint(b.x, a.y + a.w + gap, a.z);
      }
    }
  };
  if(mode==='container'&&Object.values(p.settings.operations?.limits||{}).some(v=>v>0)){
    // Seed both halves so a front-region limit does not prevent reaching rear space.
    addPoint(Math.max(work.minX,bin.length/2),work.minY,0);
    addPoint(work.minX,Math.max(work.minY,bin.width/2),0);
    addPoint(Math.max(work.minX,bin.length/2),Math.max(work.minY,bin.width/2),0);
    for(const t of allowed)for(const rotation of orientations(t)){const d=footprint(t,rotation);addPoint(work.maxX-d.l,work.minY,0);addPoint(work.minX,work.maxY-d.w,0);addPoint(work.maxX-d.l,work.maxY-d.w,0);}
  }
  for (const a of objects) expand(a);
  while (points.length && items.length < AUTO_UNIT_LIMIT && Date.now() < stopAt) {
    if (
      !allowed.some(
        (t) =>
          canConsume(t, used, types) &&
          report.weight + t.weight <= bin.maxWeight + EPS,
      )
    )
      break;
    points.sort(
      (a, b) =>
        a[2] - b[2] ||
        (strategy % 2
          ? a[0] - b[0] || a[1] - b[1]
          : a[1] - b[1] || a[0] - b[0]),
    );
    const [x, y, z] = points.shift();
    let placed = false;
    for (const t of allowed) {
      if (
        !canConsume(t, used, types) ||
        report.weight + t.weight > bin.maxWeight + EPS
      )
        continue;
      if (mode === "pallet" && p.activeTemplate) {
        const rt = p.templates.find((t) => t.id === p.activeTemplate);
        if (
          rt &&
          ((!rt.allowMixed && items.length && items[0].typeId !== t.id) ||
            report.weight + t.weight + p.pallet.tare > rt.maxWeight + EPS)
        )
          continue;
      }
      for (const rotation of strategy === 3
        ? orientations(t).reverse()
        : orientations(t)) {
        const item = {
            id: uid(),
            typeId: t.id,
            x,
            y,
            z,
            rotation,
            locked: false,
          },
          a = { item, t, ...shape(item, t) };
        if (
          outside(a, bin) ||
          (mode === "container" &&
            (a.w > bin.doorWidth + EPS || a.h > bin.doorHeight + EPS))
        )
          {reject('尺寸或柜门');continue;}
        if (objects.some((b) => collides(a, b))) {reject('位置被占用');continue;}
        if(clearanceIssue(p,mode,a,objects)||(regionalLimits&&regionalIssue(p,[...objects,a]))){reject('预留间隙或区域限重');continue;}
        if (
          gap > 0 &&
          objects.some(
            (b) =>
              Math.min(a.z + a.h, b.z + b.h) - Math.max(a.z, b.z) > EPS &&
              a.x < b.x + b.l + gap - EPS &&
              a.x + a.l > b.x - gap + EPS &&
              a.y < b.y + b.w + gap - EPS &&
              a.y + a.w > b.y - gap + EPS,
          )
        )
          {reject('水平间距');continue;}
        const supports = supportsFor(a, objects, groundFor(p, mode));
        if (supports.ratio * 100 + 0.01 < p.settings.minSupport) {reject('底部支撑不足');continue;}
        const level =
          (t.isBase ? 0 : 1) +
          Math.max(0, ...supports.under.map((u) => report.levels[u.id] || 0));
        if (level > t.maxLayers) {reject('堆叠层数');continue;}
        // Incremental force transfer down the support graph, avoiding repeated full scene validation.
        const delta = new Map(),
          queue = supports.under.map((u) => ({
            id: u.id,
            weight: t.weight * u.share,
          }));
        let bearing = true;
        while (queue.length) {
          const q = queue.shift(),
            b = objectMap.get(q.id);
          delta.set(q.id, (delta.get(q.id) || 0) + q.weight);
          if ((report.loads[q.id] || 0) + delta.get(q.id) > b.t.maxLoad + EPS) {
            bearing = false;
            break;
          }
          for (const u of supportCache.get(b.item.id).under)
            queue.push({ id: u.id, weight: q.weight * u.share });
        }
        if (!bearing) {reject('下层承重');continue;}
        items.push(item);
        objects.push(a);
        objectMap.set(item.id,a);
        supportCache.set(item.id,supports);
        for (const [id, n] of Object.entries(consumption(t)))
          used[id] = (used[id] || 0) + n;
        report.weight += t.weight;
        report.levels[item.id] = level;
        report.loads[item.id] = 0;
        for (const [id, w] of delta)
          report.loads[id] = (report.loads[id] || 0) + w;
        expand(a);
        placed = true;
        break;
      }
      if (placed) break;
    }
    if (++processed % 50 === 0) onProgress?.({ count: items.length, strategy });
  }
  const final = analyze(p, mode, items);
  return {
    items,
    report: final,
    limited: Date.now() >= stopAt || items.length >= AUTO_UNIT_LIMIT,
    termination:items.length>=AUTO_UNIT_LIMIT?'unit-limit':Date.now()>=stopAt?'time-limit':!points.length?'points-exhausted':'stock-or-weight',
    rejected,
    strategy,
  };
}
export function optimize(p, mode = "container", onProgress) {
  const count = p.settings.depth === "deep" ? 4 : 2,
    seconds = p.settings.depth === "deep" ? 40 : 12,
    deadline = Date.now() + seconds * 1000,
    candidates = [];
  const rows=rowCandidate(p,mode);
  if(rows)candidates.push(rows);
  candidates.push(...bagPatternCandidates(p,mode));
  for (let i = 0; i < count; i++) {
    onProgress?.({ phase: i + 1, total: count, count: 0 });
    const r = attempt(
      p,
      mode,
      i,
      onProgress,
      Math.min(deadline, Date.now() + (seconds * 1000) / count),
    );
    if (r.error) return { error: r.error, candidates: [] };
    r.label = ["紧凑填充", "大底面优先", "重货优先", "转向比较"][i];
    candidates.push(r);
  }
  const types = allTypes(p);
  const missing = (r) =>
    types
      .filter((t) => t.mustLoad)
      .reduce(
        (s, t) => s + Math.max(0, t.quantity - (r.report.used[t.id] || 0)),
        0,
      );
  candidates.sort(
    (a, b) =>
      Number(b.report.valid) - Number(a.report.valid) ||
      missing(a) - missing(b) ||
      (p.settings.objective === "count"
        ? b.report.pieces - a.report.pieces || b.report.volume - a.report.volume
        : b.report.volume - a.report.volume ||
          b.report.pieces - a.report.pieces),
  );
  return { candidates, elapsedLimit: seconds };
}
export function loadingSequence(p) {
  const map = new Map(allTypes(p).map((t) => [t.id, t])),objects=physical(p),pending=[...p.placements].sort((a,b)=>a.x-b.x||a.z-b.z||a.y-b.y),done=new Set(),ordered=[];
  const dependencies=new Map(objects.map(a=>[a.item.id,supportsFor(a,objects).under.map(u=>u.id)]));
  while(pending.length){let index=pending.findIndex(i=>dependencies.get(i.id).every(id=>done.has(id)));if(index<0)index=0;const item=pending.splice(index,1)[0];ordered.push(item);done.add(item.id);}
  return ordered.map((item, i) => ({
      step: i + 1,
      ...item,
      name: map.get(item.typeId).name,
    }));
}
export function remainingReason(p, t, report, mode = "container", language='zh-CN') {
  if(language==='en'){
    const b=binFor(p,mode),left=t.quantity-(report.used[t.id]||0),capacity=Math.max(0,b.maxWeight-report.weight),w=workingSpace(p,mode);
    if(left<=0)return 'Fully loaded.';
    if(t.auto===false)return 'Excluded from automatic loading. Enable automatic placement in the specification editor.';
    if(t.weight>capacity+.05)return `Insufficient remaining payload capacity: ${capacity.toFixed(1)} kg available; ${t.weight} kg per unit.`;
    if(orientations(t).every(r=>{const d=footprint(t,r);return d.l>b.length||d.w>b.width||d.h>b.height;}))return 'Dimensions exceed the loading space.';
    if(mode==='container'&&orientations(t).every(r=>{const d=footprint(t,r);return d.w>b.doorWidth||d.h>b.doorHeight;}))return 'Cannot pass through the door in any permitted orientation.';
    const cap=Math.floor((capacity+.05)/t.weight),parts=[];
    if(left>cap)parts.push(`Of ${left} remaining units, payload permits at most ${cap} more (${capacity.toFixed(1)} kg available).`);
    if(!t.allowRotate)parts.push('Horizontal rotation is disabled; enable it to compare 0/90-degree rows.');
    parts.push(`Effective height ${t.effectiveHeight} mm: clear height permits ${Math.floor((w.maxZ+.05)/t.effectiveHeight)} aligned layers; specification limit ${t.maxLayers}; bearing permits ${1+Math.floor((t.maxLoad+.05)/t.weight)} layers in an identical-package column.`);
    if(p.settings.gap)parts.push(`Horizontal gap: ${p.settings.gap} mm.`);
    if((mode==='pallet'?p.palletPlacements:p.placements).some(i=>i.locked))parts.push('Locked cargo will not be rearranged by automatic loading.');
    parts.push('Combined space, support, stacking or inventory constraints. Other feasible arrangements may exist; this is not proof of a global optimum.');
    return parts.join(' ');
  }
  if ((report.used[t.id] || 0) >= t.quantity) return "已装完";
  const b = binFor(p, mode);
  if(t.auto===false)return '此规格已关闭参与自动摆放；可在编辑规格中开启';
  if (t.weight > b.maxWeight - report.weight+.05) return `剩余载重不足：余量 ${Math.max(0,b.maxWeight-report.weight).toFixed(1)} kg，单件 ${t.weight} kg`;
  if (
    orientations(t).every((r) => {
      const d = footprint(t, r);
      return d.l > b.length || d.w > b.width || d.h > b.height;
    })
  )
    return "尺寸超过装载空间";
  if (
    mode === "container" &&
    orientations(t).every((r) => {
      const d = footprint(t, r);
      return d.w > b.doorWidth || d.h > b.doorHeight;
    })
  )
    return "当前允许朝向无法通过柜门";
  const parts=[];
  const remaining=t.quantity-(report.used[t.id]||0),weightCap=Math.max(0,Math.floor((b.maxWeight-report.weight+.05)/t.weight));
  if(remaining>weightCap)parts.push(`剩余 ${remaining} 件中，载重最多还允许 ${weightCap} 件（余量 ${(b.maxWeight-report.weight).toFixed(1)} kg）`);
  if(!t.allowRotate)parts.push('水平转向已关闭，可在规格中开启 0°/90° 混排');
  const w=workingSpace(p,mode),heightLayers=Math.floor((w.maxZ+.05)/t.effectiveHeight),bearingLayers=1+Math.floor((t.maxLoad+.05)/t.weight);
  parts.push(`当前有效高度 ${t.effectiveHeight} mm，整齐同规格柱按净高最多 ${heightLayers} 层；规格限 ${t.maxLayers} 层，同规格柱承重最多 ${bearingLayers} 层`);
  if(p.settings.gap)parts.push(`水平间距 ${p.settings.gap} mm`);
  if((mode==='pallet'?p.palletPlacements:p.placements).some(i=>i.locked))parts.push('有锁定货物，自动计算不会重排锁定部分');
  parts.push('余隙还需同时满足尺寸、支撑和承重；当前排法未证明是全局最优');
  return parts.join('；');
}
