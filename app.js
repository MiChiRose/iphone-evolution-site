import * as T from 'three';
import {GLTFLoader} from './vendor/three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/three/addons/libs/meshopt_decoder.module.js';
import {prepareModel,disposeModel} from './model-tools.js';
import {collection as items} from './collection.js';

const root=document.documentElement,story=document.querySelector('#story'),canvas=document.querySelector('canvas'),status=document.querySelector('.scene-status');
const chapters=[...document.querySelectorAll('.chapter')],captions=chapters.map(x=>x.querySelector('.caption')),devices=chapters.map(x=>x.querySelector('.device'));
const nav=document.querySelector('.timeline'),links=[...nav.querySelectorAll('a')],ghost=document.querySelector('.watermark'),motion=document.querySelector('.motion-button'),dialog=document.querySelector('dialog');
const reduceMedia=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:700px)');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
let userReduced=null;try{const saved=localStorage.getItem('iphone-motion');if(saved)userReduced=saved==='reduced';}catch{}
const reduced=()=>userReduced??reduceMedia.matches;
let current=-1,value=0,target=0,step=1,raf=0,last=0,dirty=true,disposed=false,inspecting=false,drag=null,yaw=0,pitch=0;
let renderer,scene,camera,environment,loading=false,working=-1,queue=[],contextLost=false;
const models=new Map(),failed=new Map(),loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
root.classList.add('enhanced');

function measure(){step=innerHeight*1.12;story.style.height=((items.length-1)*step+innerHeight)+'px';if(renderer){renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}target=clamp(scrollY/step,0,items.length-1);dirty=true;}
function updateMode(){motion.setAttribute('aria-pressed',String(reduced()));motion.textContent=reduced()?'Включить движение':'Меньше движения';root.dataset.reduced=String(reduced());value=target;dirty=true;wake();}
motion.addEventListener('click',()=>{userReduced=!reduced();try{localStorage.setItem('iphone-motion',userReduced?'reduced':'full');}catch{}stopInspect();updateMode();});
reduceMedia.addEventListener('change',()=>{userReduced=null;updateMode();});

function select(index){
 if(current===index)return;const previous=current;current=index;
 chapters.forEach((chapter,i)=>{const yes=i===index;chapter.classList.toggle('is-current',yes);chapter.inert=!yes;chapter.setAttribute('aria-hidden',String(!yes));});
 links.forEach((link,i)=>{if(i===index)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
 ghost.textContent=items[index].year;document.querySelector('.timeline-counter').textContent=String(index+1).padStart(2,'0')+' / '+items.length;
 document.querySelector('.live-status').textContent=items[index].year+'. '+items[index].name+'. '+items[index].subtitle;
 canvas.setAttribute('aria-label','3D-модель '+items[index].name);document.body.dataset.model=items[index].id;
 nav.scrollTo({left:Math.max(0,links[index].offsetLeft-nav.clientWidth/2+links[index].clientWidth/2),behavior:'instant'});
 if(previous>=0&&document.activeElement?.closest('.chapter')===chapters[previous])links[index].focus({preventScroll:true});
 schedule(index);showStatus();
}
function showStatus(){
 if(inspecting){status.hidden=false;status.style.left='50%';status.style.right='auto';status.textContent='Потяните телефон или нажимайте стрелки. Esc — вернуться к истории.';return;}
 if(!renderer){status.hidden=false;status.textContent='3D недоступно в этом браузере. История и превью сохранены.';return;}
 const model=models.get(current);status.hidden=!!model;
 status.textContent=failed.has(current)?'Не удалось загрузить 3D. Нажмите «Повторить».':items[current]?.local_asset?'Загружаем '+items[current].name+'…':'Превью модели. 3D-файл ещё не подключён.';
 status.style.left=mobile.matches?'8%':current%2?'7%':'58%';status.style.right='auto';
 const button=chapters[current]?.querySelector('.inspect-button');if(button){button.disabled=!(model||failed.has(current));button.textContent=failed.has(current)?'Повторить 3D':model?'Осмотреть в 3D':'Подготовка 3D…';}
}
function go(index,{keyboard=false}={}){
 index=clamp(index,0,items.length-1);stopInspect();scrollTo({top:index*step,behavior:'instant'});target=value=index;dirty=true;render();history.replaceState(null,'','#'+items[index].id);if(keyboard)links[index].focus({preventScroll:true});wake();
}
function stopInspect(){if(!inspecting)return;inspecting=false;yaw=pitch=0;drag=null;canvas.classList.remove('is-inspecting');canvas.tabIndex=-1;document.querySelectorAll('.inspect-button').forEach(b=>{b.setAttribute('aria-pressed','false');b.textContent='Осмотреть в 3D';});dirty=true;showStatus();wake();}
function inspect(index){
 if(failed.has(index)){failed.delete(index);schedule(index);showStatus();return;}
 if(!models.has(index))return;
 if(inspecting){stopInspect();return;}go(index);inspecting=true;canvas.classList.add('is-inspecting');canvas.tabIndex=0;canvas.focus({preventScroll:true});chapters[index].querySelector('.inspect-button').setAttribute('aria-pressed','true');chapters[index].querySelector('.inspect-button').textContent='Готово';showStatus();
}

function trim(){const keep=new Set([current-1,current,current+1]);for(const [i,m]of models)if(!keep.has(i)){disposeModel(m);models.delete(i);chapters[i].dataset.loaded='false';}}
function schedule(index){
 if(!renderer)return;const next=Math.min(items.length-1,index+1);queue=[index,...(navigator.connection?.saveData?[]:[next])].filter((x,i,a)=>a.indexOf(x)===i&&!models.has(x)&&!failed.has(x)&&x!==working);trim();pump();
}
async function pump(){
 if(loading||disposed||!renderer)return;const index=queue.shift();if(index===undefined)return;
 const item=items[index];if(!item.local_asset){pump();return;}
 loading=true;working=index;
 try{const gltf=await loader.loadAsync(item.local_asset);if(disposed)return;const model=prepareModel(gltf,item);scene.add(model);models.set(index,model);chapters[index].dataset.loaded='true';chapters[index].querySelector('.inspect-button').disabled=false;chapters[index].querySelector('.inspect-button').textContent='Осмотреть в 3D';trim();}
 catch(error){failed.set(index,error.message);console.warn('Model load failed:',item.id,error.message);}
 finally{loading=false;working=-1;dirty=true;if(current>=0)showStatus();wake();pump();}
}
function alpha(model,a){if(Math.abs(model.userData.alpha-a)<.002)return;model.userData.alpha=a;for(const m of model.userData.materials){const o=m.userData.fadeOriginal,transparent=a<.999||o.transparent;if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}m.opacity=o.opacity*a;m.depthWrite=a<.999?false:o.depthWrite;}}
function pose(index,phase,a,shift,ratio=null){
 const model=models.get(index);if(!model)return;model.visible=a>.002;if(!model.visible)return;alpha(model,a);
 const visibleHeight=2*Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.position.z,visibleWidth=visibleHeight*camera.aspect;
 const direction=index%2?-1:1,side=index%2?.285:.715;
 const fit=mobile.matches?Math.min(.58,innerHeight*(innerHeight<=720?.28:.30)/(4.1*innerHeight/visibleHeight)):Math.min(1.04,visibleWidth*.33/2.6);
 model.scale.setScalar(fit*(items[index].displayScale??1));model.position.set(mobile.matches?0:((ratio??side)-.5)*visibleWidth,mobile.matches?visibleHeight*(innerHeight<=720?.25:.24):visibleHeight*.045,0);
 const turn=reduced()?0:smooth(phase/.85)*Math.PI*2*direction;
 model.rotation.set(inspecting?pitch:.02,(items[index].yaw??-.20)*direction+turn+(inspecting?yaw:0)+shift*.6*direction,(items[index].roll??0)+(mobile.matches?0:direction*-.025));
}
function render(){
 const p=clamp(value,0,items.length-1),i=Math.floor(p),f=p-i,next=Math.min(i+1,items.length-1),t=next===i?0:reduced()?0:smooth((f-.68)/.32),selected=reduced()?Math.round(p):t<.5?i:next;
 select(selected);for(const m of models.values())m.visible=false;
 if(reduced()){
  pose(selected,0,1,0);chapters.forEach((c,j)=>{c.style.opacity=j===selected?'1':'0';captions[j].style.transform=mobile.matches?'none':'translateY(-50%)';devices[j].style.transform='none';});
 }else{
  const x=(i%2?.285:.715)*(1-t)+(next%2?.285:.715)*t;pose(i,f,1-t,t,x);if(next!==i)pose(next,0,t,t-1,x);
  chapters.forEach((c,j)=>{const from=j===i,to=j===next;let opacity=from?1-t:to?t:0;if(next===i)opacity=from?1:0;c.style.opacity=String(opacity);const shift=from?-t:to?1-t:0,dir=j%2?-1:1;captions[j].style.transform='translate('+shift*dir*65+'px,'+(mobile.matches?'0':'-50%')+')';devices[j].style.transform='translateX('+shift*dir*-50+'px)';});
 }
 ghost.style.left=mobile.matches?'5%':selected%2?'1%':'50%';ghost.style.opacity=String(1-.5*Math.sin(t*Math.PI));
 if(renderer&&!contextLost)renderer.render(scene,camera);document.body.dataset.progress=p.toFixed(3);document.body.dataset.ready=renderer?'true':'fallback';
}
function tick(now){raf=0;if(disposed||document.hidden||dialog.open)return;const dt=Math.min(.05,(now-last)/1000||.016);last=now;
 const delta=target-value;if(Math.abs(delta)>.0003){value=reduced()?target:value+delta*(1-Math.exp(-dt*15));dirty=true;}else if(delta!==0){value=target;dirty=true;}
 if(dirty){render();dirty=false;}if(Math.abs(target-value)>.00001)wake();
}
function wake(){if(!raf&&!disposed)raf=requestAnimationFrame(tick);}

try{
 renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 scene=new T.Scene();camera=new T.PerspectiveCamera(35,1,.1,100);camera.position.z=11.4;
 scene.add(new T.HemisphereLight(0xffffff,0x9295ab,2.1));
 for(const [color,intensity,x,y,z]of[[0xffffff,3.5,-4,6,7],[0xd7e0ff,2.3,5,2,4],[0xffffff,2.6,2,5,-4]]){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);}
 const studio=new T.Scene();studio.background=new T.Color(0xb5b7c0);const panels=[];
 for(const [w,h,x,y,z,strength]of[[8,6,-5,4,3,4],[5,8,5,2,-2,3],[9,3,0,7,1,4]]){const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color().setScalar(strength),side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.lookAt(0,0,0);studio.add(mesh);panels.push(mesh);}
 const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.05);scene.environment=environment.texture;scene.environmentIntensity=.75;pmrem.dispose();panels.forEach(m=>{m.geometry.dispose();m.material.dispose();});
}catch(error){renderer=null;console.warn('WebGL unavailable:',error.message);}
measure();updateMode();const initial=items.findIndex(m=>m.id===location.hash.slice(1));if(initial>=0)go(initial);else{value=target;render();}wake();
window.addEventListener('scroll',()=>{const progress=clamp(scrollY/step,0,items.length-1);if(inspecting&&Math.abs(progress-current)<.003)return;if(inspecting)stopInspect();target=progress;dirty=true;wake();},{passive:true});
window.addEventListener('resize',()=>{const keep=value;measure();scrollTo({top:keep*step,behavior:'instant'});target=value=keep;dirty=true;wake();});
window.addEventListener('hashchange',()=>{const i=items.findIndex(m=>m.id===location.hash.slice(1));if(i>=0)go(i);});
nav.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;e.preventDefault();go(links.indexOf(link));});
document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();go(0);});
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.next))));
document.querySelectorAll('[data-inspect]').forEach(b=>b.addEventListener('click',()=>inspect(Number(b.dataset.inspect))));
document.querySelector('.about-button').addEventListener('click',()=>dialog.showModal());document.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dirty=true;wake();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){dirty=true;wake();}});
window.addEventListener('keydown',e=>{
 if(dialog.open||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
 if(inspecting){if(e.key==='Escape'){stopInspect();chapters[current].querySelector('.inspect-button').focus({preventScroll:true});return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.18;if(e.key==='ArrowRight')yaw+=.18;if(e.key==='ArrowUp')pitch=clamp(pitch-.10,-.8,.8);if(e.key==='ArrowDown')pitch=clamp(pitch+.10,-.8,.8);dirty=true;wake();}return;}
 if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();go(e.key==='Home'?0:e.key==='End'?items.length-1:current+(e.key==='ArrowRight'?1:-1),{keyboard:true});}
});
canvas.addEventListener('pointerdown',e=>{if(!inspecting||e.button!==0||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=clamp(drag.pitch+(e.clientY-drag.y)*.005,-.8,.8);dirty=true;wake();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(drag?.id===e.pointerId)drag=null;});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;status.hidden=false;status.textContent='Восстанавливаем 3D-сцену…';});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;dirty=true;showStatus();wake();});
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);models.forEach(disposeModel);environment?.dispose();renderer?.dispose();});
