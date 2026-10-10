import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CARGO_MATERIALS} from './appearance.js';

export class CargoPreview {
  constructor(host,form){
    this.host=host;this.form=form;
    try {
    host.innerHTML='<div class="cargo-preview-canvas"></div><p class="cargo-preview-readout" role="status"></p><p class="hint">拖动旋转 · 滚轮缩放。灰线＝原始尺寸，彩色外框＝计算尺寸；袋形仅为示意，不模拟真实受压变形，不会自动压缩。</p>';
    this.canvasHost=host.firstElementChild;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.domElement.setAttribute('aria-label','货物规格实时三维预览');this.canvasHost.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#f0f3ed');
    this.camera=new THREE.PerspectiveCamera(38,1,.01,100);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enablePan=false;
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x8c9b87,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,2);this.scene.add(light);
    this.group=new THREE.Group();this.scene.add(this.group);
    this.render=()=>this.renderer.render(this.scene,this.camera);
    this.controls.addEventListener('change',this.render);
    this.observer=new ResizeObserver(()=>{const w=this.canvasHost.clientWidth,h=this.canvasHost.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render();});this.observer.observe(this.canvasHost);
    this.onInput=e=>{if(e.target.id==='compression-input'){const value=Number(e.target.value),height=Number(form.elements.height.value);if(Number.isFinite(value)&&value>=0&&value<=60)form.elements.effectiveHeight.value=Math.round(height*(1-value/100)*100)/100;}this.update();};
    form.addEventListener('input',this.onInput);form.addEventListener('change',this.onInput);this.update();
    } catch(error){this.dispose();throw error;}
  }
  clear(){this.group?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.group?.clear();}
  update(){
    const f=this.form.elements,raw=['length','width','height'].map(k=>Number(f.namedItem(k).value)),kind=f.kind.value;
    const effective=kind==='box'?raw:['effectiveLength','effectiveWidth','effectiveHeight'].map(k=>Number(f.namedItem(k).value));
    const readout=this.host.querySelector('.cargo-preview-readout');
    if([...raw,...effective].some(n=>!Number.isFinite(n)||n<=0)){readout.textContent='长、宽、高均须大于 0，预览暂保留上一次有效外形。';return;}
    this.clear();const scale=1/Math.max(...raw,...effective),d=effective.map(n=>n*scale),r=raw.map(n=>n*scale),color=f.color.value;
    const materialName=f.appearanceMaterial?.value||'cardboard',profile=CARGO_MATERIALS[materialName]||CARGO_MATERIALS.cardboard,secondary=f.appearanceSecondary?.value||'#f0e3bd',pattern=f.appearancePattern?.value||'plain';
    const mesh=new THREE.Mesh(kind==='box'?new THREE.BoxGeometry(d[0],d[2],d[1]):new RoundedBoxGeometry(d[0],d[2],d[1],4,Math.min(...d)*.23),new THREE.MeshStandardMaterial({color,roughness:profile.roughness,metalness:profile.metalness}));this.group.add(mesh);
    if(pattern!=='plain'||kind==='box'){const strip=new THREE.Mesh(new THREE.BoxGeometry(pattern==='grid'?d[0]*.06:d[0]*.98,.004,pattern==='stripe'?d[1]*.24:d[1]*.12),new THREE.MeshStandardMaterial({color:secondary,roughness:.9}));strip.position.y=d[2]/2+.003;this.group.add(strip);}
    const mark=[f.appearanceArrows?.checked?'↑ ↑':'',f.appearanceSku?.value,f.appearanceLabel?.value].filter(Boolean).join(' · ');if(mark){const canvas=document.createElement('canvas');canvas.width=768;canvas.height=144;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(255,255,245,.88)';ctx.fillRect(0,0,768,144);ctx.fillStyle='#24342c';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 48px sans-serif';ctx.fillText(mark.slice(0,80),384,72,720);const plane=new THREE.Mesh(new THREE.PlaneGeometry(d[0]*.72,d[1]*.34),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,side:THREE.DoubleSide}));plane.rotation.x=-Math.PI/2;plane.position.y=d[2]/2+.008;this.group.add(plane);}
    for(const [dims,c] of [[r,'#87918a'],[d,color]]){
      const box=new THREE.BoxGeometry(dims[0],dims[2],dims[1]),edges=new THREE.EdgesGeometry(box);box.dispose();this.group.add(new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:c,transparent:true,opacity:.85,depthTest:false})));
    }
    if(!this.initialized){this.camera.position.set(1.25,.94,1.25);this.controls.target.set(0,0,0);this.controls.update();this.initialized=true;}
    const change=((1-effective[2]/raw[2])*100).toFixed(1);
    readout.textContent=`计算长 × 宽 × 高：${effective.join(' × ')} mm · 高度${Number(change)>=0?'压缩':'增加'} ${Math.abs(Number(change))}% · 单件 ${f.weight.value} kg${kind==='box'?'（纸箱采用原始尺寸）':''}`;
    this.host.dataset.dimensions=effective.join('x');this.render();
  }
  dispose(){if(this.onInput){this.form.removeEventListener('input',this.onInput);this.form.removeEventListener('change',this.onInput);}this.observer?.disconnect();this.controls?.dispose();this.clear();this.renderer?.dispose();this.renderer?.forceContextLoss();this.host.replaceChildren();}
}
