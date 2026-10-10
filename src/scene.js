import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { allTypes, binFor } from "./model.js";
import { footprint, shape, overlaps2D, physical, collides } from "./engine.js";
import {doorConfig,doorBody,doorBodies,doorFrames,segmentBodyHit,DOOR_OPEN_ANGLE} from './doors.js';
import {resolveContainerSkin} from './container-skins.js';
import {palletComponents} from './pallet-design.js';
import {heatColor} from './heatmap.js';
import {cargoAppearance,containerAppearance,CARGO_MATERIALS} from './appearance.js';
import {advanceDoor} from './door-motion.js';
const S = 0.001;
export class SceneView {
  constructor(host, { onSelect, onMarquee, onMove, onPreview, onPlace, onDoorStatus, onNotice }) {
    this.host = host;
    this.onSelect = onSelect;
    this.onMarquee = onMarquee;
    this.onMove = onMove;
    this.onPreview = onPreview;
    this.onPlace = onPlace;
    this.onDoorStatus = onDoorStatus;
    this.onNotice = onNotice;
    this.doorAngles={left:DOOR_OPEN_ANGLE,right:DOOR_OPEN_ANGLE};
    this.doorTargets={...this.doorAngles};
    this.doorIntent={...this.doorAngles};
    this.doorBlocked={};
    this.doorMeshes=[];this.frameMeshes=[];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#eef1eb");
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
    this.camera.up.set(0, 1, 0);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor("#eef1eb");
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "装柜三维场景：左键旋转，滚轮缩放，按住中键前后拖动推进视角，点击柜门开合",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 0.2;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI * 0.94;
    this.controls.mouseButtons.MIDDLE = null;
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#a7afa1", 2.6));
    const light = new THREE.DirectionalLight("#fff7e8", 3.2);
    light.position.set(0, 12, 6);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -12;
    light.shadow.camera.right = 12;
    light.shadow.camera.top = 12;
    light.shadow.camera.bottom = -12;
    light.shadow.bias = -0.001;
    this.scene.add(light);
    this.scene.add(light.target);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.ray = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.picks = [];
    this.tool = "orbit";
    this.renderer.domElement.addEventListener("pointerdown", (e) =>
      this.down(e),
    );
    this.renderer.domElement.addEventListener("pointermove", (e) =>
      this.move(e),
    );
    this.renderer.domElement.addEventListener("pointerup", (e) => this.up(e));
    this.renderer.domElement.addEventListener("pointercancel", () => {
      this.marquee=null;this.marqueeBox?.remove();
      this.drag = null;
      this.downAt = null;
      if(this.middleDrag)this.controls.enableDamping=this.middleDrag.damping;
      this.middleDrag=null;this.doorDown=null;this.controls.enabled=true;
      this.renderer.domElement.style.cursor=this.tool==='move'?'grab':'default';
      this.ghost && (this.ghost.visible = false);
    });
    this.renderer.domElement.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
    this.renderer.domElement.addEventListener('lostpointercapture',()=>{if(this.middleDrag){this.controls.enableDamping=this.middleDrag.damping;this.middleDrag=null;this.controls.enabled=true;this.renderer.domElement.style.cursor='default';}});
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this.lastPointer = null;
      if (!this.drag && this.ghost) this.ghost.visible = false;
    });
    this.resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      this.camera.aspect = w / Math.max(h, 1);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if(this.ready)this.fit(this.currentView||'iso');
    });
    this.resize.observe(host);
    this.renderer.setAnimationLoop((time) => {
      const dt=Math.min(.05,Math.max(0,(time-(this.lastFrameTime??time))/1000));this.lastFrameTime=time;
      this.animateDoors(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
  disposeRoot() {
    this.root.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.map?.dispose();
          m.dispose();
        }
      }
    });
    this.root.clear();
    this.pathOverlay=null;
    this.picks = [];
    this.doorMeshes=[];this.frameMeshes=[];this.doorPivots={};
  }
  mesh(geo, color, x, y, z, opacity = 1) {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
  label(text, pos, color = "#5c6c60", size = 0.13) {
    if(this.reportLanguage==='en')text=({'柜门 →':'Door →','重心':'Center of gravity'})[text]||text;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.font = '500 42px "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.fillText(text, 384, 48);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
      }),
    );
    sprite.position.copy(pos);
    sprite.scale.set(size * 8, size, 1);
    this.root.add(sprite);
    return sprite;
  }
  decalText(text,parent,position,width,height,{color='#ffffff',background='rgba(18,24,21,.62)',rotation=null}={}){
    if(!text)return null;const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,1024,256);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 92px "Microsoft YaHei",sans-serif';ctx.fillText(String(text).slice(0,80),512,128,940);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));mesh.position.copy(position);if(rotation)mesh.rotation.set(...rotation);mesh.renderOrder=8;(parent||this.root).add(mesh);return mesh;
  }
  decalImage(asset,parent,position,width,height,rotation=null){
    if(!asset?.projectId||!asset?.id)return;const generation=this.renderGeneration,url=`/api/records/${encodeURIComponent(asset.projectId)}/assets/${encodeURIComponent(asset.id)}`;
    new THREE.TextureLoader().load(url,texture=>{if(generation!==this.renderGeneration){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));mesh.position.copy(position);if(rotation)mesh.rotation.set(...rotation);mesh.renderOrder=9;(parent||this.root).add(mesh);},undefined,()=>{});
  }
  update(p, mode, report, ui) {
    if(this.p?.id!==p.id){this.doorAngles={left:DOOR_OPEN_ANGLE,right:DOOR_OPEN_ANGLE};this.doorTargets={...this.doorAngles};this.doorIntent={...this.doorAngles};this.doorBlocked={};}
    if(this.doorDataRevision!==p.updatedAt){this.doorBlocked={};this.doorDataRevision=p.updatedAt;}
    this.report = report;
    this.p = p;
    this.mode = mode;
    this.ui = ui;
    this.disposeRoot();this.renderGeneration=(this.renderGeneration||0)+1;this.markCount=0;this.logoCount=0;
    const b = binFor(p, mode),
      l = b.length * S,
      w = b.width * S,
      h = b.height * S;
    this.bin = b;
    this.skin=resolveContainerSkin(p.container);
    this.containerAppearance=containerAppearance(p.container);
    if(ui.spaces)for(const a of ui.spaceData?.regions||[]){
      const geo=new THREE.BoxGeometry(a.l*S,a.h*S,a.w*S);
      const edges=new THREE.EdgesGeometry(geo);geo.dispose();
      const lines=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:'#bd7a16',transparent:true,opacity:.85,depthTest:false}));
      lines.position.set((a.x+a.l/2)*S,(a.z+a.h/2)*S,(a.y+a.w/2)*S);lines.renderOrder=10;this.root.add(lines);
      const label=this.label(`#${a.id}`,lines.position.clone(),'#885610',.11);
      label.material.sizeAttenuation=false;label.material.depthWrite=false;label.scale.set(.32,.04,1);label.renderOrder=20;
    }
    const floor = this.mesh(
      new THREE.BoxGeometry(l, 0.055, w),
      mode==='container'?this.skin.floor:"#b8b8a2",
      l / 2,
      -0.032,
      w / 2,
    );
    floor.receiveShadow = true;
    const ground = this.mesh(
      new THREE.PlaneGeometry(80, 80),
      "#eef1eb",
      l / 2,
      -0.13,
      w / 2,
    );
    ground.rotation.x = -Math.PI / 2;
    const grid = new THREE.GridHelper(40, 80, "#ccd4c8", "#e0e5dc");
    grid.position.set(l / 2, -0.125, w / 2);
    this.root.add(grid);
    if (mode === "container") {
      // Two lightly tinted walls preserve a clear view into the container.
      this.mesh(
        new THREE.BoxGeometry(l, h, 0.012),
        this.skin.wall,
        l / 2,
        h / 2,
        w + 0.008,
        ui.walls ? 0.28 : 0.045,
      );
      this.mesh(
        new THREE.BoxGeometry(0.012, h, w),
        this.skin.wall,
        -0.008,
        h / 2,
        w / 2,
        ui.walls ? 0.32 : 0.045,
      );
      if (ui.walls)
        for (let x = 0.1; x < l; x += 0.2)
          this.mesh(
            new THREE.BoxGeometry(0.027, h, 0.018),
            this.skin.rib,
            x,
            h / 2,
            w - 0.005,
            0.4,
          );
      for (let x = 0.4; x < l; x += 0.4)
        this.mesh(
          new THREE.BoxGeometry(0.007, 0.002, w),
          this.skin.floorLine,
          x,
          0,
          w / 2,
        );
      this.buildDoors();
      const ca=this.containerAppearance,decalWidth=Math.min(3.2,l*.34),decalX=Math.min(l*.68,Math.max(decalWidth*.65,l*.48));
      if(ca.companyName)this.decalText(ca.companyName,this.root,new THREE.Vector3(decalX,h*.63,w+.016),decalWidth,Math.min(.72,h*.24),{background:'rgba(10,20,18,.5)',rotation:[0,Math.PI,0]});
      if(ca.containerNo)this.decalText(ca.containerNo,this.root,new THREE.Vector3(decalX,h*.36,w+.017),Math.min(2.4,decalWidth*.8),Math.min(.42,h*.14),{background:'rgba(245,245,230,.88)',color:'#17211e',rotation:[0,Math.PI,0]});
      if(ca.logo)this.decalImage(ca.logo,this.root,new THREE.Vector3(Math.min(l*.25,2.2),h*.58,w+.018),Math.min(1.6,l*.16),Math.min(.8,h*.25),[0,Math.PI,0]);
      const wear=Math.round((ca.condition||0)/10);for(let i=0;i<wear;i++){const x=(.4+((i*137)%850)/1000*Math.max(.5,l-.8)),y=.15+((i*83)%700)/1000*Math.max(.4,h-.3);const spot=this.mesh(new THREE.CircleGeometry(.035+(i%3)*.018,10),'#7a4c31',x,y,w+.019,.18+.02*(i%3));spot.rotation.y=Math.PI;}
      this.label(
        "柜门 →",
        new THREE.Vector3(l + 0.42, 0.02, w / 2),
        "#687f69",
        0.18,
      );
    } else {
      const bh = p.pallet.baseHeight * S,
        over = p.pallet.overhang * S;
      if(p.pallet.design?.components?.length){
        const design=p.pallet.design;
        for(const c of palletComponents(p.pallet)){
          const color=c.color||(['board','plate'].includes(c.kind)?design.color:design.secondaryColor);
          const m=this.mesh(new THREE.BoxGeometry(c.length*S,c.height*S,c.width*S),color,(over/S+c.x+c.length/2)*S,(c.z+c.height/2-p.pallet.baseHeight)*S,(over/S+c.y+c.width/2)*S);
          m.material.roughness=design.material==='steel'?.38:design.material==='plastic'?.6:.92;m.material.metalness=design.material==='steel'?.55:0;
        }
        if(design.logoText)this.label(design.logoText,new THREE.Vector3(l/2,.018,w/2),design.material==='steel'?'#20282b':'#4b3420',Math.min(.13,l*.08));
      }else{
      for (let i = 0; i < 5; i++)
        this.mesh(
          new THREE.BoxGeometry(
            p.pallet.length * S,
            bh * 0.2,
            (p.pallet.width * S) / 6,
          ),
          "#b99660",
          l / 2,
          -bh * 0.1,
          over + ((i + 0.5) * p.pallet.width * S) / 5,
        );
      for (let i = 0; i < 3; i++)
        this.mesh(
          new THREE.BoxGeometry(
            p.pallet.length * S,
            bh * 0.65,
            (p.pallet.width * S) / 12,
          ),
          "#997947",
          l / 2,
          -bh * 0.6,
          over + ((i + 0.5) * p.pallet.width * S) / 3,
        );
      }
      ground.position.y = -bh - 0.06;
      grid.position.y = -bh - 0.05;
      floor.visible = false;
    }
    const cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(l, h, w)),
      new THREE.LineBasicMaterial({
        color: mode==='container'?this.skin.cage:"#6e8879",
        transparent: true,
        opacity: 0.42,
      }),
    );
    cage.position.set(l / 2, h / 2, w / 2);
    this.root.add(cage);
    this.label(
      `${b.length.toLocaleString()} mm`,
      new THREE.Vector3(l / 2, -0.025, -0.32),
      mode==='container'?this.skin.label:"#6b7a6c",
      Math.max(0.12, l * 0.019),
    );
    this.label(
      `${b.width.toLocaleString()} mm`,
      new THREE.Vector3(-0.38, -0.025, w / 2),
      mode==='container'?this.skin.label:"#6b7a6c",
      Math.max(0.12, l * 0.019),
    );
    const types = allTypes(p),
      map = new Map(types.map((t) => [t.id, t])),
      items = mode === "pallet" ? p.palletPlacements : p.placements;
    const itemMap=new Map(items.map(i=>[i.id,i]));
    const invalid = new Set(
        report.issues.filter((i) => i.level === "error").flatMap((i) => i.ids),
      ),
      batches = new Map();
    const matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      scale = new THREE.Vector3(),
      position = new THREE.Vector3();
    const add = (
      key,
      t,
      id,
      px,
      py,
      pz,
      rotation,
      dl,
      dw,
      dh,
      color,
      kind = t.kind,
    ) => {
      if (!batches.has(key)) batches.set(key, { t, kind, color, entries: [] });
      batches
        .get(key)
        .entries.push({
          id,
          px,
          py,
          pz,
          rotation,
          dl,
          dw,
          dh,
          color: invalid.has(id)
            ? "#c96958"
            : (ui.selection||[ui.selected]).includes(id)
              ? "#dfb856"
              : heatColor(ui.heatmap,itemMap.get(id)||{id},t,report,types),
        });
    };
    const visibleItems = items.filter(
      (i) =>
        (ui.layer === "all" ||
          (ui.onlyLayer?(report.levels[i.id]||1)===Number(ui.layer):(report.levels[i.id] || 1) <= Number(ui.layer))) &&
        (!ui.step || items.indexOf(i) < ui.step),
    );
    for (const i of visibleItems) {
      const t = map.get(i.typeId),
        d = footprint(t, i.rotation),
        cx = (i.x + d.l / 2) * S,
        cz = (i.y + d.w / 2) * S,
        cy = (i.z + d.h / 2) * S,
        a = (-i.rotation * Math.PI) / 180;
      if (t.kind !== "pallet") {
        add(
          t.id,
          t,
          i.id,
          cx,
          cy,
          cz,
          a,
          t.effectiveLength * S,
          t.effectiveWidth * S,
          t.effectiveHeight * S,
          t.color,
        );
      } else {
        const rotate = (x, y) => [
          cx + x * Math.cos(a) + y * Math.sin(a),
          cz - x * Math.sin(a) + y * Math.cos(a),
        ];
        if(t.palletDesign?.components?.length){
          const design=t.palletDesign;
          for(const c of design.components){
            const [x,z]=rotate((c.x+c.length/2-t.deckLength/2)*S,(c.y+c.width/2-t.deckWidth/2)*S);
            add(t.id+'part-'+c.kind,t,i.id,x,(i.z+c.z+c.height/2)*S,z,a,c.length*S,c.width*S,c.height*S,c.color||(['board','plate'].includes(c.kind)?design.color:design.secondaryColor),'box');
          }
          if(design.logoText){const [x,z]=rotate(0,0);this.label(design.logoText,new THREE.Vector3(x,(i.z+t.baseHeight+.018)*S,z),'#46321f',Math.min(.13,t.deckLength*S*.08));}
        }else{
        for (let j = 0; j < 5; j++) {
          const [x, z] = rotate(
            0,
            (-t.deckWidth / 2 + ((j + 0.5) * t.deckWidth) / 5) * S,
          );
          add(
            t.id + "deck",
            t,
            i.id,
            x,
            (i.z + t.baseHeight * 0.85) * S,
            z,
            a,
            t.deckLength * S,
            (t.deckWidth * S) / 6,
            t.baseHeight * S * 0.3,
            "#ac8955",
            "box",
          );
        }
        for (let j = 0; j < 3; j++) {
          const [x, z] = rotate(
            0,
            (-t.deckWidth / 2 + ((j + 0.5) * t.deckWidth) / 3) * S,
          );
          add(
            t.id + "feet",
            t,
            i.id,
            x,
            (i.z + t.baseHeight * 0.35) * S,
            z,
            a,
            t.deckLength * S,
            (t.deckWidth * S) / 12,
            t.baseHeight * S * 0.7,
            "#947342",
            "box",
          );
        }
        }
        for (const child of t.children) {
          const ct = map.get(child.typeId),
            cd = footprint(ct, child.rotation),
            [x, z] = rotate(
              (child.x + cd.l / 2 - t.length / 2) * S,
              (child.y + cd.w / 2 - t.width / 2) * S,
            );
          add(
            ct.id,
            ct,
            i.id,
            x,
            (i.z + t.baseHeight + child.z + cd.h / 2) * S,
            z,
            a - (child.rotation * Math.PI) / 180,
            ct.effectiveLength * S,
            ct.effectiveWidth * S,
            ct.effectiveHeight * S,
            ct.color,
          );
        }
      }
      if (ui.boxes || (ui.selection||[ui.selected]).includes(i.id)) {
        const box = new THREE.LineSegments(
          new THREE.EdgesGeometry(
            new THREE.BoxGeometry(
              t.effectiveLength * S,
              t.effectiveHeight * S,
              t.effectiveWidth * S,
            ),
          ),
          new THREE.LineBasicMaterial({
            color: invalid.has(i.id)
              ? "#a72721"
              : (ui.selection||[ui.selected]).includes(i.id)
                ? "#36562a"
                : "#577970",
            transparent: true,
            opacity: (ui.selection||[ui.selected]).includes(i.id) ? 1 : 0.4,
          }),
        );
        box.position.set(cx, cy, cz);
        box.rotation.y = a;
        this.root.add(box);
      }
    }
    for (const batch of batches.values()) {
      const geo =
        batch.kind === "box" || batch.kind === "pallet"
          ? new THREE.BoxGeometry(1, 1, 1)
          : new RoundedBoxGeometry(
              1,
              1,
              1,
              3,
              batch.kind === "soft" ? 0.16 : 0.11,
            );
      const appearance=cargoAppearance(batch.t),profile=CARGO_MATERIALS[appearance.material]||CARGO_MATERIALS.cardboard;
      const material = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: profile.roughness,
        metalness: profile.metalness,
      });
      const inst = new THREE.InstancedMesh(geo, material, batch.entries.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.userData.ids = batch.entries.map((e) => e.id);
      batch.entries.forEach((e, j) => {
        position.set(e.px, e.py, e.pz);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.rotation);
        scale.set(e.dl * 0.993, e.dh * 0.993, e.dw * 0.993);
        matrix.compose(position, q, scale);
        inst.setMatrixAt(j, matrix);
        inst.setColorAt(j, new THREE.Color(e.color));
      });
      inst.instanceMatrix.needsUpdate = true;
      this.root.add(inst);
      this.picks.push(inst);
      if (!batch.t.kind.startsWith("pallet")&&(batch.kind==='box'||appearance.pattern!=='plain')) {
        const tapes = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: appearance.secondaryColor, roughness: 1 }),
          batch.entries.length,
        );
        batch.entries.forEach((e, j) => {
          position.set(e.px, e.py + e.dh / 2 + 0.0003, e.pz);
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.rotation);
          scale.set(e.dl * (appearance.pattern==='grid'?.055:.995), 0.001, e.dw * (appearance.pattern==='stripe'?.22:.12));
          matrix.compose(position, q, scale);
          tapes.setMatrixAt(j, matrix);
        });
        this.root.add(tapes);
      }
      const mark=[appearance.showArrows?'↑ ↑':'',appearance.sku,appearance.labelText].filter(Boolean).join(' · ');
      if(mark&&this.markCount<12)for(const e of batch.entries.slice(0,12-this.markCount)){this.label(mark,new THREE.Vector3(e.px,e.py+e.dh/2+.025,e.pz),'#22352d',Math.min(.075,Math.max(.035,e.dl*.18)));this.markCount++;if(this.markCount>=12)break;}
      if(appearance.logo&&batch.entries[0]&&this.logoCount<8){const e=batch.entries[0];this.decalImage(appearance.logo,this.root,new THREE.Vector3(e.px,e.py+e.dh/2+.004,e.pz),Math.min(e.dl*.55,.42),Math.min(e.dw*.45,.24),[-Math.PI/2,0,e.rotation]);this.logoCount=(this.logoCount||0)+1;}
    }
    if (ui.center && report.center) {
      const c = report.center;
      const m = this.mesh(
        new THREE.SphereGeometry(Math.max(0.025, l * 0.006), 16, 12),
        "#bf503f",
        c.x * S,
        c.z * S,
        c.y * S,
      );
      m.material.depthTest = false;
      m.renderOrder = 10;
      this.label(
        "重心",
        new THREE.Vector3(c.x * S, c.z * S + 0.18, c.y * S),
        "#9c3e31",
        0.14,
      );
    }
    if (!this.ready || this.lastMode !== mode || this.lastLength !== l) {
      this.fit(ui.view || 'iso');
      this.ready = true;
      this.lastMode = mode;
      this.lastLength = l;
    }
    this.ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: "#4d8978",
        transparent: true,
        opacity: 0.35,
        depthTest: false,
      }),
    );
    this.ghost.visible = false;
    this.root.add(this.ghost);
  }
  buildDoors(){
    const c=this.p.container,d=doorConfig(c),k=d.thickness/60,showBoxes=this.ui.doorBoxes||this.ui.boxes,s=this.skin;
    this.doorObstacles=physical(this.p,'container').filter(o=>o.x+o.l>c.length-.05);
    for(const f of doorFrames(c)){
      const m=this.mesh(new THREE.BoxGeometry(f.l*S,f.h*S,f.w*S),s.frame,(f.x+f.l/2)*S,(f.z+f.h/2)*S,(f.y+f.w/2)*S);m.userData.doorFrame=true;this.frameMeshes.push(m);
      if(showBoxes){const wire=new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),new THREE.LineBasicMaterial({color:'#186bb5',depthTest:false}));wire.position.copy(m.position);this.root.add(wire);}
    }
    for(const side of ['left','right']){
      const sign=side==='left'?-1:1,pivot=new THREE.Group();pivot.position.set(d.hingeX*S,0,(sign===1?d.low:d.high)*S);this.root.add(pivot);this.doorPivots[side]=pivot;
      const add=(geo,color,normal,height,along)=>{const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.72}));m.position.set(normal*S,height*S,sign*along*S);m.castShadow=true;m.receiveShadow=true;m.userData.doorSide=side;pivot.add(m);this.doorMeshes.push(m);return m;};
      const panel=add(new THREE.BoxGeometry(d.thickness*S,d.height*S,(d.width/2-d.gap*2)*S),s.door,0,d.height/2,d.width/4);panel.userData.panel=true;
      if(side==='right'&&this.containerAppearance.warningText)this.decalText(this.containerAppearance.warningText,pivot,new THREE.Vector3((d.thickness/2+5)*S,d.height*.68*S,sign*d.width*.25*S),d.width*.34*S,d.height*.12*S,{color:'#f4e9c6',background:'rgba(37,42,39,.68)',rotation:[0,Math.PI/2,0]});
      for(let i=1;i<=6;i++)add(new THREE.BoxGeometry(8*k*S,d.height*.91*S,Math.min(28,d.width*.015)*S),s.doorRib,d.thickness/2+2*k,d.height/2,d.width*i/14);
      for(const height of [d.height*.04,d.height*.96])add(new THREE.BoxGeometry(10*k*S,Math.min(55,d.height*.04)*S,(d.width/2-d.gap*2)*S),s.rail,d.thickness/2+4*k,height,d.width/4);
      for(const along of [d.width*.14,d.width*.36]){
        add(new THREE.CylinderGeometry(6*k*S,6*k*S,d.height*.88*S,10),s.hardware,d.thickness/2+12*k,d.height*.5,along);
        add(new THREE.BoxGeometry(12*k*S,18*k*S,Math.min(150,d.width*.1)*S),s.hardware,d.thickness/2+26*k,d.height*.42,along);
        for(const height of [d.height*.12,d.height*.82])add(new THREE.BoxGeometry(18*k*S,28*k*S,28*k*S),s.rail,d.thickness/2+12*k,height,along);
      }
      for(const height of [d.height*.2,d.height*.5,d.height*.8])add(new THREE.CylinderGeometry(d.thickness*.22*S,d.thickness*.22*S,Math.min(90,d.height*.09)*S,12),'#b2bfb4',0,height,0);
      if(showBoxes){const near=-d.thickness*.22,far=d.width/2-d.gap,normalMin=-d.thickness/2,normalMax=d.thickness/2+d.hardware;
        const box=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry((normalMax-normalMin)*S,d.height*S,(far-near)*S)),new THREE.LineBasicMaterial({color:'#146ab2',depthTest:false}));box.position.set((normalMin+normalMax)/2*S,d.height/2*S,sign*(near+far)/2*S);box.renderOrder=12;pivot.add(box);
      }
      pivot.rotation.y=sign*this.doorAngles[side]*Math.PI/180;
      if(this.doorObstacles.some(o=>collides(doorBody(c,side,this.doorAngles[side]),o)))this.doorBlocked[side]='门扇与货物重叠，请先调整货物';
      panel.material.color.set(this.doorBlocked[side]?'#c66b58':s.door);
    }
    this.notifyDoors(true);
  }
  notifyDoors(force=false){
    if(!this.p)return;
    const now=performance.now();if(!force&&now-(this.lastDoorNotice||0)<80)return;this.lastDoorNotice=now;
    const moving=Object.keys(this.doorAngles).some(s=>Math.abs(this.doorAngles[s]-this.doorTargets[s])>.001);
    this.onDoorStatus?.({angles:{...this.doorAngles},moving,willClose:Object.values(this.doorIntent).every(a=>a===DOOR_OPEN_ANGLE),blocked:Object.values(this.doorBlocked).filter(Boolean).join('；')});
  }
  toggleDoor(side){
    if(this.mode!=='container')return;
    const sides=side?[side]:['left','right'];
    const opening=side?this.doorIntent[side]===0:!sides.every(s=>this.doorIntent[s]===DOOR_OPEN_ANGLE);
    for(const s of sides){this.doorIntent[s]=this.doorTargets[s]=opening?DOOR_OPEN_ANGLE:0;delete this.doorBlocked[s];}
    this.notifyDoors(true);
  }
  animateDoors(dt){
    if(this.mode!=='container'||!this.doorPivots?.left)return;
    let changed=false;
    for(const side of ['left','right']){
      const from=this.doorAngles[side],target=this.doorTargets[side];if(Math.abs(target-from)<.001)continue;
      const next=from+Math.sign(target-from)*Math.min(Math.abs(target-from),dt*100);
      const result=advanceDoor(this.p.container,side,from,next,this.doorObstacles,this.doorAngles[side==='left'?'right':'left']);
      this.doorAngles[side]=!result.blocked&&Math.abs(result.angle-target)<.001?target:result.angle;
      if(result.blocked){this.doorTargets[side]=result.angle;this.doorBlocked[side]=`${side==='left'?'左':'右'}门受「${result.obstacle.t?.name||result.obstacle.name}」阻挡，已停止`;this.onNotice?.(this.doorBlocked[side],true);}
      this.doorPivots[side].rotation.y=(side==='left'?-1:1)*this.doorAngles[side]*Math.PI/180;
      changed=true;
    }
    if(changed){for(const m of this.doorMeshes)if(m.userData.panel)m.material.color.set(this.doorBlocked[m.userData.doorSide]?'#c66b58':this.skin.door);this.notifyDoors(Object.keys(this.doorAngles).every(s=>Math.abs(this.doorAngles[s]-this.doorTargets[s])<.001));}
  }
  doorPlacementIssue(item,t){
    if(this.mode!=='container')return null;
    const a=shape(item,t),hit=doorBodies(this.p.container,this.doorAngles).find(b=>collides(a,b));
    return hit?`与${hit.name}碰撞，请先开门或调整货物位置`:null;
  }
  setAutoRotate(enabled){this.controls.autoRotate=!!enabled;this.controls.autoRotateSpeed=.65;}
  setBackground(mode='studio'){
    const color={studio:'#eef1eb',white:'#ffffff',night:'#17201d'}[mode]||'#eef1eb';this.scene.background.set(color);this.renderer.setClearColor(color);
  }
  clearPathFrame(){
    if(!this.pathOverlay)return;this.pathOverlay.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});this.pathOverlay.removeFromParent();this.pathOverlay=null;
  }
  setPathFrame(frame){
    this.clearPathFrame();if(!frame||this.mode!=='container')return;const a=physical(this.p,'container').find(o=>o.item.id===frame.id);if(!a)return;
    const group=new THREE.Group(),outside=this.p.container.length+Math.max(400,frame.approachLength||0)+a.l/2,target=a.x+a.l/2,p=Math.max(0,Math.min(1,frame.progress||0)),x=frame.direction==='unload'?target+(outside-target)*p:outside+(target-outside)*p;
    const material=new THREE.MeshStandardMaterial({color:frame.valid?'#35b878':'#d04e42',transparent:true,opacity:.72,depthTest:false});const mesh=new THREE.Mesh(new THREE.BoxGeometry(a.l*S,a.h*S,a.w*S),material);mesh.position.set(x*S,(a.z+a.h/2)*S,(a.y+a.w/2)*S);mesh.rotation.y=-a.item.rotation*Math.PI/180;mesh.renderOrder=30;group.add(mesh);
    const points=[new THREE.Vector3(target*S,(a.z+a.h/2)*S,(a.y+a.w/2)*S),new THREE.Vector3(outside*S,(a.z+a.h/2)*S,(a.y+a.w/2)*S)];const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:frame.valid?'#16895a':'#b52e25',dashSize:.18,gapSize:.1,depthTest:false}));line.computeLineDistances();line.renderOrder=29;group.add(line);this.root.add(group);this.pathOverlay=group;
  }
  fit(view = "iso") {
    this.currentView=view;
    this.camera.aspect=this.host.clientWidth/Math.max(this.host.clientHeight,1);
    this.camera.updateProjectionMatrix();
    const b = this.bin || { length: 5898, width: 2352, height: 2393 },
      l = b.length * S,
      w = b.width * S,
      h = b.height * S,
      m = Math.max(l, w, h);
    this.controls.target.set(l / 2, h * 0.35, w / 2);
    if (view === "top") {
      this.camera.position.set(l / 2, m * 1.55, w / 2 + 0.001);
      this.camera.up.set(0, 0, -1);
    } else if (view === "door") {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(l + m * 0.75, h * 0.5, w / 2);
      this.controls.target.set(l / 2, h * 0.5, w / 2);
    } else if (view === "side") {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(l / 2, h * 0.5, -m * 1.1);
    } else if (view === "inside") {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(l * 0.98, h * 0.55, w / 2);
      this.controls.target.set(0, h * 0.4, w / 2);
    } else {
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(
        l / 2 + m * 0.62,
        h + m * 0.68,
        w / 2 - m * 0.94,
      );
    }
    if(view!=='inside'){
      const target=this.controls.target,direction=this.camera.position.clone().sub(target).normalize();
      this.camera.lookAt(target);this.camera.updateMatrixWorld();
      const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1);
      const tanV=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)),tanH=tanV*this.camera.aspect;
      let distance=0;
      const bounds=this.mode==='container'?doorBodies(this.p.container,{left:DOOR_OPEN_ANGLE,right:DOOR_OPEN_ANGLE}):[];
      const maxX=Math.max(l,...bounds.map(b=>(b.x+b.l)*S)),minZ=Math.min(0,...bounds.map(b=>b.y*S)),maxZ=Math.max(w,...bounds.map(b=>(b.y+b.w)*S)),maxY=Math.max(h,...bounds.map(b=>(b.z+b.h)*S));
      for(const x of [0,maxX])for(const y of [0,maxY])for(const z of [minZ,maxZ]){
        const offset=new THREE.Vector3(x,y,z).sub(target),depth=offset.dot(direction);
        distance=Math.max(distance,Math.abs(offset.dot(right))/tanH+depth,Math.abs(offset.dot(up))/tanV+depth);
      }
      this.camera.position.copy(target).addScaledVector(direction,distance*1.2);
    }
    this.controls.update();
  }
  setTool(tool) {
    this.tool = tool;
    this.controls.enabled = true;
    this.controls.enableRotate = tool === 'orbit';
    this.controls.mouseButtons.LEFT = tool === 'orbit' ? THREE.MOUSE.ROTATE : null;
    this.controls.mouseButtons.MIDDLE = tool === 'orbit' ? null : THREE.MOUSE.DOLLY;
    this.renderer.domElement.style.cursor =
      tool === 'place' ? 'crosshair' : tool === "move" ? "grab" : "default";
    if (tool !== 'place') { this.lastPreview = null; if(this.ghost&&!this.drag)this.ghost.visible=false; }
  }
  showGhost(result) {
    if (!this.ghost || !result) return;
    const i = result.item, t = allTypes(this.p).find(t => t.id === i.typeId);
    if (!t) return;
    const d = footprint(t, i.rotation);
    this.ghost.visible = true;
    this.ghost.position.set((i.x+d.l/2)*S, (i.z+d.h/2)*S, (i.y+d.w/2)*S);
    this.ghost.scale.set(t.effectiveLength*S, t.effectiveHeight*S, t.effectiveWidth*S);
    this.ghost.rotation.y = -i.rotation*Math.PI/180;
    this.ghost.material.color.set(result.valid ? result.overlap ? '#d68a1d' : '#248258' : '#d43d32');
  }
  refreshPointer() {
    if (this.lastPointer && this.tool === 'place') this.previewAt(this.lastPointer);
  }
  previewAt(e) {
    if (!this.ui.pending) return null;
    this.lastPointer = {clientX:e.clientX,clientY:e.clientY};
    this.rayAt(e);
    const front=this.interactiveHit();
    if(front?.object.userData.doorSide||front?.object.userData.doorFrame){this.ghost.visible=false;this.lastPreview=null;this.renderer.domElement.style.cursor=front.object.userData.doorSide?'pointer':'not-allowed';return null;}
    this.renderer.domElement.style.cursor='crosshair';
    const items = this.mode === 'pallet' ? this.p.palletPlacements : this.p.placements;
    const types = allTypes(this.p), t = types.find(t => t.id === this.ui.pending.typeId);
    if (!t) return null;
    let z = 0;
    const hit = this.ray.intersectObjects(this.picks, false)[0];
    if (hit) {
      const base = items.find(i => i.id === hit.object.userData.ids[hit.instanceId]);
      z = this.ui.allowOverlap ? base.z : base.z + footprint(types.find(t => t.id === base.typeId), base.rotation).h;
    }
    const point = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), -z*S), new THREE.Vector3());
    if (!point) { this.ghost.visible=false; this.lastPreview=null; return null; }
    const d = footprint(t, this.ui.pending.rotation);
    const candidate = {...this.ui.pending,x:point.x/S-d.l/2,y:point.z/S-d.w/2,z};
    const result = this.onPreview(candidate);
    this.lastPreview = result;
    this.showGhost(result);
    return result;
  }
  rayAt(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
  }
  pick(e) {
    this.rayAt(e);
    const hit = this.interactiveHit();
    return hit?.object.userData.ids?.[hit.instanceId]??null;
  }
  interactiveHit(){
    this.root.updateMatrixWorld(true);
    return this.ray.intersectObjects([...this.picks,...this.doorMeshes,...this.frameMeshes],false)[0];
  }
  moveCamera(e){
    const drag=this.middleDrag;if(!drag)return;
    const amount=(drag.y-e.clientY)*drag.speed,desired=drag.position.clone().addScaledVector(drag.forward,amount),delta=desired.clone().sub(this.camera.position);
    let fraction=1;
    if(this.mode==='container'){
      const toMM=v=>({x:v.x/S,y:v.z/S,z:v.y/S}),start=toMM(this.camera.position),end=toMM(desired);
      for(const body of doorBodies(this.p.container,this.doorAngles)){const t=segmentBodyHit(start,end,body);if(t!==null)fraction=Math.min(fraction,Math.max(0,t-.002));}
    }
    if(fraction<1&&!drag.warned){drag.warned=true;this.onNotice?.('视角移动被柜门或门框挡住，请先开门',true);}
    this.camera.position.addScaledVector(delta,fraction);this.controls.target.addScaledVector(delta,fraction);
    this.camera.updateMatrixWorld();
  }
  down(e) {
    if(e.button===1&&this.tool==='orbit'){
      e.preventDefault();const damping=this.controls.enableDamping;this.controls.enableDamping=false;this.controls.update();this.controls.enabled=false;
      this.middleDrag={damping,y:e.clientY,position:this.camera.position.clone(),forward:this.camera.getWorldDirection(new THREE.Vector3()),speed:Math.max(.003,Math.min(.06,this.camera.position.distanceTo(this.controls.target)*.003))};
      this.renderer.domElement.setPointerCapture(e.pointerId);this.renderer.domElement.style.cursor='ns-resize';return;
    }
    if (e.button !== 0) return;
    if(this.tool==='select'){
      this.controls.enabled=false;this.marquee={x:e.clientX,y:e.clientY,add:e.ctrlKey||e.metaKey||e.shiftKey};
      this.marqueeBox=document.createElement('div');this.marqueeBox.className='scene-marquee';document.body.append(this.marqueeBox);this.renderer.domElement.setPointerCapture(e.pointerId);return;
    }
    this.downAt = [e.clientX, e.clientY];
    this.rayAt(e);this.doorDown=this.interactiveHit()?.object.userData.doorSide||null;
    if(this.doorDown)return;
    if (this.tool === 'place') { this.previewAt(e); return; }
    const id = this.pick(e);
    if (this.tool === "move" && id && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const item = (
        this.mode === "pallet" ? this.p.palletPlacements : this.p.placements
      ).find((i) => i.id === id);
      if (item.locked) return;
      const t = allTypes(this.p).find((t) => t.id === item.typeId);
      this.drag = { item: { ...item }, t };
      this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -item.z * S);
      this.startPoint = this.ray.ray.intersectPlane(
        this.plane,
        new THREE.Vector3(),
      );
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  }
  move(e) {
    if(this.marquee){const m=this.marquee;Object.assign(this.marqueeBox.style,{left:Math.min(m.x,e.clientX)+'px',top:Math.min(m.y,e.clientY)+'px',width:Math.abs(e.clientX-m.x)+'px',height:Math.abs(e.clientY-m.y)+'px'});return;}
    if(this.middleDrag){this.moveCamera(e);return;}
    if(this.doorDown&&e.buttons)return;
    if (this.tool === 'place') { if (!e.buttons) this.previewAt(e); return; }
    if (!this.drag) {if(!e.buttons){this.rayAt(e);this.renderer.domElement.style.cursor=this.interactiveHit()?.object.userData.doorSide?'pointer':this.tool==='move'?'grab':'default';}return;}
    this.rayAt(e);
    const point = this.ray.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!point || !this.startPoint) return;
    const i = this.drag.item;
    let result = this.onPreview({...i,x:i.x+(point.x-this.startPoint.x)/S,y:i.y+(point.z-this.startPoint.z)/S}, i.id);
    const grouped=this.ui.selection?.length>1&&this.ui.selection.includes(i.id);
    const target = {...result.item,z:this.ui.allowOverlap||grouped?i.z:0}, a = shape(target,this.drag.t);
    const types=allTypes(this.p),items=this.mode==='pallet'?this.p.palletPlacements:this.p.placements;
    if(!this.ui.allowOverlap&&!grouped)for(const other of items){if(other.id===i.id)continue;const b=shape(other,types.find(t=>t.id===other.typeId));if(b.z+b.h<=i.z+this.drag.t.effectiveHeight+.05&&overlaps2D(a,b))target.z=Math.max(target.z,b.z+b.h);}
    result=this.onPreview(target,i.id,false);
    this.drag.target = result.item;
    this.showGhost(result);
  }
  up(e) {
    if(this.marquee&&e.button===0){
      const m=this.marquee;this.marquee=null;this.marqueeBox?.remove();this.controls.enabled=true;
      if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);
      if(Math.hypot(e.clientX-m.x,e.clientY-m.y)<5){this.onSelect(this.pick(e),m.add);return;}
      const rect=this.renderer.domElement.getBoundingClientRect(),ids=[];
      for(const o of physical(this.p,this.mode)){
        if(this.ui.layer!=='all'&&(this.ui.onlyLayer?this.report.levels[o.item.id]!==+this.ui.layer:this.report.levels[o.item.id]>+this.ui.layer))continue;
        const v=new THREE.Vector3((o.x+o.l/2)*S,(o.z+o.h/2)*S,(o.y+o.w/2)*S).project(this.camera),x=rect.left+(v.x+1)*rect.width/2,y=rect.top+(1-v.y)*rect.height/2;
        if(v.z>=-1&&v.z<=1&&x>=Math.min(m.x,e.clientX)&&x<=Math.max(m.x,e.clientX)&&y>=Math.min(m.y,e.clientY)&&y<=Math.max(m.y,e.clientY))ids.push(o.item.id);
      }this.onMarquee?.(ids,m.add);return;
    }
    if(e.button===1&&this.middleDrag){this.controls.enableDamping=this.middleDrag.damping;this.middleDrag=null;this.controls.enabled=true;this.renderer.domElement.style.cursor='default';if(this.renderer.domElement.hasPointerCapture(e.pointerId))this.renderer.domElement.releasePointerCapture(e.pointerId);return;}
    if (e.button !== 0) return;
    const clicked=this.downAt&&Math.hypot(e.clientX-this.downAt[0],e.clientY-this.downAt[1])<5;
    this.downAt=null;
    if(this.doorDown){const side=this.doorDown;this.doorDown=null;if(clicked){this.rayAt(e);if(this.interactiveHit()?.object.userData.doorSide===side)this.toggleDoor(side);}return;}
    if(this.tool==='place'){
      if(clicked){const result=this.previewAt(e);if(result)this.onPlace(result.item);}
      return;
    }
    if (this.drag) {
      const target = this.drag.target,
        id = this.drag.item.id;
      this.drag = null;
      this.ghost.visible = false;
      if (target) this.onMove(id, target);
      else this.onSelect(id,e.ctrlKey||e.metaKey||e.shiftKey);
      return;
    }
    if (clicked)
      this.onSelect(this.pick(e),e.ctrlKey||e.metaKey||e.shiftKey);
  }
  screenshot(language='zh-CN',scale=1) {
    const preview=this.lastPreview,ghostVisible=this.ghost?.visible;
    const oldRatio=this.renderer.getPixelRatio(),w=this.host.clientWidth,h=this.host.clientHeight;
    try{
      if(language==='en'){this.reportLanguage='en';this.update(this.p,this.mode,this.report,this.ui);}
      if(this.ghost)this.ghost.visible=false;
      if(scale>1){this.renderer.setPixelRatio(Math.min(4,oldRatio*scale));this.renderer.setSize(w,h,false);}
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL("image/png");
    }finally{
      if(scale>1){this.renderer.setPixelRatio(oldRatio);this.renderer.setSize(w,h,false);}
      if(language==='en'){this.reportLanguage=null;this.update(this.p,this.mode,this.report,this.ui);}
      if(ghostVisible&&preview)this.showGhost(preview);else if(this.ghost)this.ghost.visible=!!ghostVisible;
    }
  }
}
