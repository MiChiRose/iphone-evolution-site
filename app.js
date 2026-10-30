import * as T from 'three';
import {GLTFLoader} from './vendor/three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/three/addons/libs/meshopt_decoder.module.js?v=0.24';
import {prepareModel,disposeModel} from './model-tools.js?v=3';
import {collection as items} from './collection.js?v=3';
import {ModelBuffers,neighborOrder,idleWork} from './model-loading.js?v=4';
import {warmModel,modelBytes} from './model-warmup.js?v=4';

const root=document.documentElement,story=document.querySelector('#story'),canvas=document.querySelector('canvas'),status=document.querySelector('.scene-status');
const chapters=[...document.querySelectorAll('.chapter')],captions=chapters.map(x=>x.querySelector('.caption')),devices=chapters.map(x=>x.querySelector('.device'));
const nav=document.querySelector('.timeline'),links=[...nav.querySelectorAll('a')],ghost=document.querySelector('.watermark'),motion=document.querySelector('.motion-button'),dialog=document.querySelector('dialog');
const timelineShell=document.querySelector('.timeline-shell'),ending=document.querySelector('#ending');
const reduceMedia=matchMedia('(prefers-reduced-motion: reduce)'),mobile=matchMedia('(max-width:560px)');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
let userReduced=null;try{const saved=localStorage.getItem('iphone-motion');if(saved)userReduced=saved==='reduced';}catch{}
const reduced=()=>userReduced??reduceMedia.matches;
let current=-1,value=0,target=0,step=1,raf=0,last=0,dirty=true,disposed=false,inspecting=false,drag=null,yaw=0,pitch=0;
let renderer,scene,camera,environment,loading=false,working=-1,contextLost=false,prepareController,preparationTask;
let direction=1,modelOrder=[],skipped=new Set();
const buffers=new ModelBuffers(items.map(item=>item.local_asset),{maxBytes:(mobile.matches?8:12)*1024*1024});
const retired=new Set();let retiring=false;
const trace=(stage,index,extra={})=>{if(root.hasAttribute('data-profile'))document.dispatchEvent(new CustomEvent('iphone-model',{detail:{stage,index,time:performance.now(),...extra}}));};
let sceneOnscreen=true;
const models=new Map(),failed=new Map(),loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
let decodeWorkers=0;try{if(typeof Worker==='function'){decodeWorkers=mobile.matches?1:Math.min(2,Math.max(1,(navigator.hardwareConcurrency||2)-1));MeshoptDecoder.useWorkers(decodeWorkers);}}catch{decodeWorkers=0;}
root.classList.add('enhanced');

function measure(){step=innerHeight*1.12;story.style.height=(items.length*step+innerHeight)+'px';if(renderer){renderer.setPixelRatio(Math.min(devicePixelRatio,mobile.matches?1.5:1.75));renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}target=clamp(scrollY/step,0,items.length-.0001);dirty=true;}
function updateMode(){motion.setAttribute('aria-pressed',String(reduced()));motion.textContent=reduced()?'Включить движение':'Меньше движения';root.dataset.reduced=String(reduced());value=target;dirty=true;wake();}
motion.addEventListener('click',()=>{userReduced=!reduced();try{localStorage.setItem('iphone-motion',userReduced?'reduced':'full');}catch{}stopInspect();updateMode();});
reduceMedia.addEventListener('change',()=>{userReduced=null;updateMode();});

function select(index){
 if(current===index)return;const previous=current;if(previous>=0)direction=index>previous?1:-1;current=index;
 chapters.forEach((chapter,i)=>{const yes=i===index;chapter.classList.toggle('is-current',yes);chapter.inert=!yes;chapter.setAttribute('aria-hidden',String(!yes));});
 links.forEach((link,i)=>{if(i===index)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
 document.querySelector('.scroll-hint').hidden=index!==0;ghost.textContent=items[index].year;document.querySelector('.timeline-counter').textContent=String(index+1).padStart(2,'0')+' / '+items.length;
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
 if(failed.has(index)){failed.delete(index);buffers.evict(index);schedule(index);showStatus();return;}
 if(!models.has(index))return;
 if(inspecting){stopInspect();return;}go(index);inspecting=true;canvas.classList.add('is-inspecting');canvas.tabIndex=0;canvas.focus({preventScroll:true});chapters[index].querySelector('.inspect-button').setAttribute('aria-pressed','true');chapters[index].querySelector('.inspect-button').textContent='Готово';showStatus();
}

function retire(model){
 model.removeFromParent();model.visible=false;retired.add(model);drainRetired();
}
async function drainRetired(){
 if(retiring)return;retiring=true;
 try{while(retired.size){if(!disposed)await idleWork(null);const model=retired.values().next().value;if(!model)break;retired.delete(model);disposeModel(model);}}
 finally{retiring=false;}
}
function trim(){
 const keep=neighborOrder(current,items.length,2,1,direction),budget=(mobile.matches?64:128)*1024*1024;
 let bytes=0;const allowed=new Set();
 for(const index of keep){const model=models.get(index);if(!model)continue;const cost=model.userData.bytes;if(index===current||bytes+cost<=budget){allowed.add(index);bytes+=cost;}else skipped.add(index);}
 for(const [i,m]of models)if(!allowed.has(i)){models.delete(i);chapters[i].dataset.loaded='false';retire(m);}
}
function schedule(index){
 if(!renderer||disposed)return;skipped.clear();
 modelOrder=navigator.connection?.saveData?[index]:neighborOrder(index,items.length,2,1,direction);
 buffers.plan(navigator.connection?.saveData?[index]:[...modelOrder,...neighborOrder(index,items.length,mobile.matches?3:4,1,direction)]);
 if(working>=0&&!modelOrder.includes(working))prepareController?.abort();trim();pump();
}
function pump(){
 if(loading||disposed||!renderer||contextLost||document.hidden)return;
 const index=modelOrder.find(i=>!models.has(i)&&!failed.has(i)&&!skipped.has(i));if(index===undefined)return;
 loading=true;working=index;prepareController=new AbortController();const signal=prepareController.signal;
 preparationTask=prepare(index,signal).finally(()=>{loading=false;working=-1;dirty=true;if(!disposed){showStatus();wake();pump();}});
}
async function prepare(index,signal){
 const item=items[index],urgent=()=>index===current;let model;
 try{
  const started=performance.now();trace('fetch',index);const buffer=await buffers.get(index);signal.throwIfAborted();trace('downloaded',index,{ms:performance.now()-started});
  await idleWork(signal,urgent);signal.throwIfAborted();const parsedAt=performance.now();const gltf=await loader.parseAsync(buffer,'');
  if(signal.aborted||disposed){disposeModel(gltf.scene);return;}model=prepareModel(gltf,item);model.userData.bytes=modelBytes(model);trace('parsed',index,{ms:performance.now()-parsedAt});
  await warmModel(model,{renderer,scene,camera,signal,urgent,batchSize:mobile.matches?4:6});signal.throwIfAborted();
  scene.add(model);models.set(index,model);model=null;chapters[index].dataset.loaded='true';chapters[index].querySelector('.inspect-button').disabled=false;chapters[index].querySelector('.inspect-button').textContent='Осмотреть в 3D';trim();
  trace('ready',index,{ms:performance.now()-started,resident:[...models.keys()],residentBytes:[...models.values()].reduce((sum,m)=>sum+m.userData.bytes,0),bufferBytes:buffers.bytes,decodeWorkers});
 }catch(error){if(error.name!=='AbortError'){failed.set(index,error.message);console.warn('Model load failed:',item.id,error.message);trace('failed',index,{message:error.message});}}
 finally{if(model)retire(model);}
}
// Swap complete, opaque models at the thinnest part of a turn. Never fade the shell:
// disabling its depth writes reveals screen/camera parts from the other side.
function pose(index,turn,visible,ratio=null,arc=0){
 const model=models.get(index);if(!model)return;model.visible=visible;if(!visible)return;
 const visibleHeight=2*Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.position.z,visibleWidth=visibleHeight*camera.aspect;
 const direction=index%2?-1:1,side=index%2?.285:.715;
 const fit=mobile.matches?Math.min(.58,innerHeight*(innerHeight<=720?.28:.30)/(4.1*innerHeight/visibleHeight)):Math.min(1.04,visibleWidth*.33/2.6);
 model.scale.setScalar(fit*(items[index].displayScale??1));model.position.set(mobile.matches?0:((ratio??side)-.5)*visibleWidth,(mobile.matches?visibleHeight*(innerHeight<=720?.25:.24):visibleHeight*.045)+arc*.10,-arc*.6);
 model.rotation.set(inspecting?pitch:.02,(items[index].yaw??-.20)*direction+turn*direction+(inspecting?yaw:0),(items[index].roll??0)+(mobile.matches?0:direction*-.025));
}
function render(){
 const p=clamp(value,0,items.length-.0001),i=Math.floor(p),f=p-i,next=Math.min(i+1,items.length-1),t=next===i||reduced()?0:smooth((f-.64)/.36),selected=reduced()?Math.min(items.length-1,Math.round(p)):t<.5?i:next;
 select(selected);for(const m of models.values())m.visible=false;
 if(reduced()){
  pose(selected,0,true);chapters.forEach((c,j)=>{c.style.opacity=j===selected?'1':'0';captions[j].style.transform=mobile.matches?'none':'translateY(-50%)';devices[j].style.transform='none';});
 }else{
  const x=(i%2?.285:.715)*(1-t)+(next%2?.285:.715)*t,arc=Math.sin(t*Math.PI);
  const outgoing=Math.PI*2*smooth(f/.64)+Math.PI*.5*smooth(t*2),incoming=-Math.PI*.5*(1-smooth((t-.5)*2));
  pose(i,outgoing,t<.5||next===i,x,arc);if(next!==i)pose(next,incoming,t>=.5,x,arc);
  chapters.forEach((c,j)=>{const from=j===i,to=j===next;let opacity=from?1-smooth(t/.4):to?smooth((t-.6)/.4):0;if(next===i)opacity=from?1:0;c.style.opacity=String(opacity);const shift=from?-t:to?1-t:0,dir=j%2?-1:1;captions[j].style.transform='translate('+shift*dir*65+'px,'+(mobile.matches?'0':'-50%')+')';devices[j].style.transform='translateX('+shift*dir*-50+'px)';});
 }
 const endingProgress=clamp((scrollY-items.length*step)/Math.max(1,innerHeight*.65));
 timelineShell.style.transform='translateY('+(endingProgress*120)+'%)';timelineShell.style.opacity=String(1-endingProgress);timelineShell.inert=endingProgress>.8;
 root.style.setProperty('--story-progress',String(clamp(p/(items.length-1))));
 sceneOnscreen=scrollY<story.offsetHeight;
 ghost.style.left=mobile.matches?'5%':selected%2?'1%':'50%';ghost.style.opacity=String(1-.5*Math.sin(t*Math.PI));
 if(renderer&&!contextLost&&sceneOnscreen){trace('frame-start',current);renderer.render(scene,camera);trace('frame-end',current);for(const [index,model]of models)if(model.visible&&!model.userData.presented){model.userData.presented=true;trace('presented',index);}}document.body.dataset.progress=p.toFixed(3);document.body.dataset.ready=renderer?'true':'fallback';
}
function tick(now){raf=0;if(disposed||document.hidden||dialog.open)return;const dt=Math.min(.05,(now-last)/1000||.016);last=now;
 const delta=target-value;if(Math.abs(delta)>.0003){value=reduced()?target:value+delta*(1-Math.exp(-dt*15));dirty=true;}else if(delta!==0){value=target;dirty=true;}
 if(dirty){render();dirty=false;}if(Math.abs(target-value)>.00001)wake();
}
function wake(){if(!raf&&!disposed)raf=requestAnimationFrame(tick);}

try{
 renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.transmissionResolutionScale=.5;renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 scene=new T.Scene();camera=new T.PerspectiveCamera(35,1,.1,100);camera.position.z=11.4;
 scene.add(new T.HemisphereLight(0xffffff,0x9295ab,2.1));
 for(const [color,intensity,x,y,z]of[[0xffffff,3.5,-4,6,7],[0xd7e0ff,2.3,5,2,4],[0xffffff,2.6,2,5,-4]]){const l=new T.DirectionalLight(color,intensity);l.position.set(x,y,z);scene.add(l);}
 const studio=new T.Scene();studio.background=new T.Color(0xb5b7c0);const panels=[];
 for(const [w,h,x,y,z,strength]of[[8,6,-5,4,3,4],[5,8,5,2,-2,3],[9,3,0,7,1,4]]){const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color().setScalar(strength),side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.lookAt(0,0,0);studio.add(mesh);panels.push(mesh);}
 const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.035);scene.environment=environment.texture;scene.environmentIntensity=.75;pmrem.dispose();panels.forEach(m=>{m.geometry.dispose();m.material.dispose();});
}catch(error){renderer=null;console.warn('WebGL unavailable:',error.message);}
measure();updateMode();const initial=items.findIndex(m=>m.id===location.hash.slice(1));if(initial>=0)go(initial);else{value=target;render();}wake();
window.addEventListener('scroll',()=>{const progress=clamp(scrollY/step,0,items.length-.0001);if(inspecting&&Math.abs(progress-current)<.003)return;if(inspecting)stopInspect();target=progress;dirty=true;wake();},{passive:true});
window.addEventListener('resize',()=>{const keep=scrollY/step;measure();scrollTo({top:keep*step,behavior:'instant'});target=value=clamp(keep,0,items.length-.0001);dirty=true;wake();});
window.addEventListener('hashchange',()=>{const i=items.findIndex(m=>m.id===location.hash.slice(1));if(i>=0)go(i);});
nav.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;e.preventDefault();go(links.indexOf(link));});
document.querySelectorAll('.wordmark,.restart-link').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();go(0);if(link.classList.contains('restart-link'))links[0].focus({preventScroll:true});}));
document.querySelector('[data-ending]').addEventListener('click',()=>{stopInspect();ending.scrollIntoView({behavior:'instant'});ending.focus({preventScroll:true});});
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.next))));
document.querySelectorAll('[data-inspect]').forEach(b=>b.addEventListener('click',()=>inspect(Number(b.dataset.inspect))));
document.querySelector('.about-button').addEventListener('click',()=>dialog.showModal());document.querySelector('.close-dialog').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{dirty=true;wake();});
document.addEventListener('visibilitychange',()=>{buffers.pause(document.hidden);if(!document.hidden){dirty=true;pump();wake();}});
window.addEventListener('keydown',e=>{
 if(dialog.open||e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
 if(inspecting){if(e.key==='Escape'){stopInspect();chapters[current].querySelector('.inspect-button').focus({preventScroll:true});return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.18;if(e.key==='ArrowRight')yaw+=.18;if(e.key==='ArrowUp')pitch=clamp(pitch-.10,-.8,.8);if(e.key==='ArrowDown')pitch=clamp(pitch+.10,-.8,.8);dirty=true;wake();}return;}
 if(e.key==='End'){e.preventDefault();stopInspect();ending.scrollIntoView({behavior:'instant'});ending.focus({preventScroll:true});return;}
 if(scrollY>=items.length*step&&e.key!=='Home')return;
 if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.preventDefault();go(e.key==='Home'?0:current+(e.key==='ArrowRight'?1:-1),{keyboard:true});}
});
canvas.addEventListener('pointerdown',e=>{if(!inspecting||e.button!==0||drag)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,pitch};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw=drag.yaw+(e.clientX-drag.x)*.009;pitch=clamp(drag.pitch+(e.clientY-drag.y)*.005,-.8,.8);dirty=true;wake();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(drag?.id===e.pointerId)drag=null;});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;prepareController?.abort();status.hidden=false;status.textContent='Восстанавливаем 3D-сцену…';});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;for(const [i,model]of models){chapters[i].dataset.loaded='false';retire(model);}models.clear();dirty=true;schedule(current);showStatus();wake();});
window.addEventListener('pagehide',event=>{
 cancelAnimationFrame(raf);raf=0;buffers.pause(true);if(event.persisted)return;
 disposed=true;prepareController?.abort();buffers.dispose();
 const cleanup=()=>{models.forEach(disposeModel);retired.forEach(disposeModel);retired.clear();MeshoptDecoder.useWorkers?.(0);environment?.dispose();renderer?.dispose();};
 if(preparationTask)preparationTask.finally(cleanup);else cleanup();
});
window.addEventListener('pageshow',event=>{if(event.persisted){buffers.pause(false);dirty=true;schedule(current);wake();}});
