import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export class PalletPreview{
  constructor(host){
    this.host=host;host.innerHTML='<div class="pallet-preview-canvas"></div><p class="hint">拖动旋转 · 滚轮缩放。蓝绿色顶面表示参与货物支撑计算的零件。</p>';
    this.canvasHost=host.firstElementChild;this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.domElement.setAttribute('aria-label','自定义托盘实时三维预览');this.canvasHost.append(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#eff2ec');this.camera=new THREE.PerspectiveCamera(38,1,.01,100);this.camera.position.set(1.7,1.25,1.65);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enablePan=false;this.controls.target.set(0,.12,0);this.scene.add(new THREE.HemisphereLight(0xffffff,0x7f887e,3));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,2);this.scene.add(light);
    this.group=new THREE.Group();this.scene.add(this.group);this.render=()=>this.renderer.render(this.scene,this.camera);this.controls.addEventListener('change',this.render);
    this.observer=new ResizeObserver(()=>{const w=this.canvasHost.clientWidth,h=this.canvasHost.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.render();});this.observer.observe(this.canvasHost);
  }
  clear(){this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.group.clear();}
  update(pallet,design){
    this.clear();const scale=1/Math.max(pallet.length,pallet.width,pallet.baseHeight*3),L=pallet.length*scale,W=pallet.width*scale;
    for(const c of design.components){const material=new THREE.MeshStandardMaterial({color:c.support?'#4f9183':c.color||(['board','plate'].includes(c.kind)?design.color:design.secondaryColor),roughness:design.material==='steel'?.35:design.material==='plastic'?.6:.92,metalness:design.material==='steel'?.5:0});const m=new THREE.Mesh(new THREE.BoxGeometry(c.length*scale,c.height*scale,c.width*scale),material);m.position.set((c.x+c.length/2)*scale-L/2,(c.z+c.height/2)*scale,(c.y+c.width/2)*scale-W/2);m.castShadow=true;m.receiveShadow=true;this.group.add(m);}
    const grid=new THREE.GridHelper(2.8,28,'#c5cec3','#dce2d9');grid.position.y=-.005;this.group.add(grid);this.render();
  }
  dispose(){this.observer?.disconnect();this.controls?.dispose();this.clear();this.renderer?.dispose();this.renderer?.forceContextLoss();this.host.replaceChildren();}
}
