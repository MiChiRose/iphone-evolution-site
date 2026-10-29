(() => {
  'use strict';
  const items=window.MacCollection,root=document.documentElement,main=document.querySelector('main'),chaptersHost=document.querySelector('#chapters'),nav=document.querySelector('.timeline'),canvas=document.querySelector('.model-canvas'),status=document.querySelector('.loading-status');
  const modeButton=document.querySelector('.mode-button'),orbitButton=document.querySelector('.orbit-button'),tools=document.querySelector('.scene-tools'),ghost=document.querySelector('.year-ghost'),shadow=document.querySelector('.ground-shadow'),dialog=document.querySelector('dialog');
  const reduceMedia=matchMedia('(prefers-reduced-motion: reduce)'),mobileMedia=matchMedia('(max-width:700px)');
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),lerp=(a,b,p)=>a+(b-a)*p,smooth=p=>{p=clamp(p);return p*p*(3-2*p);};
  let userReduced=false;try{userReduced=localStorage.getItem('mac-motion')==='reduced';}catch{}
  const reduced=()=>reduceMedia.matches||userReduced;
  let renderer,scene,camera,environment,trigger,raf=0,lastTime=0,width=1,height=1,dirty=true,active=-1,value=0,target=0,inspecting=false,drag=null,orbitX=0,orbitY=0,contextLost=false,disposed=false;
  const models=new Map(),owned=[],events=new AbortController(),signal=events.signal;
  for(const [i,item]of items.entries()){
    const section=document.createElement('section');section.className='chapter';section.id=item.id;section.dataset.side=i%2?'right':'left';section.setAttribute('aria-labelledby','title-'+item.id);
    const caption=document.createElement('div');caption.className='caption';
    const year=document.createElement('p');year.className='chapter-year';year.textContent=item.year;
    const title=document.createElement('h2');title.id='title-'+item.id;title.textContent=item.name;
    const subtitle=document.createElement('p');subtitle.className='subtitle';subtitle.textContent=item.subtitle;
    const description=document.createElement('p');description.className='description';description.textContent=item.text;
    const fact=document.createElement('p');fact.className='fact';fact.textContent=item.fact;
    const source=document.createElement('a');source.className='source';source.href=item.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='Подробнее у Apple ↗';
    caption.append(year,title,subtitle,description,fact,source);section.append(caption);chaptersHost.append(section);
    const a=document.createElement('a');a.className='year-link';a.href='#'+item.id;a.textContent=item.year;a.title=item.name;a.setAttribute('aria-label',item.year+', '+item.name);nav.append(a);
  }
  const chapters=[...document.querySelectorAll('.chapter')],captions=chapters.map(x=>x.querySelector('.caption')),links=[...nav.querySelectorAll('a')];
  function updateMode(){modeButton.setAttribute('aria-pressed',String(reduced()));modeButton.textContent=reduced()?'Движение выключено':'Меньше движения';root.dataset.reduced=String(reduced());value=target;dirty=true;}
  modeButton.addEventListener('click',()=>{userReduced=!reduced();try{localStorage.setItem('mac-motion',userReduced?'reduced':'full');}catch{}updateMode();},{signal});
  reduceMedia.addEventListener('change',updateMode,{signal});updateMode();
  document.querySelector('.about-button').addEventListener('click',()=>{dialog.showModal();},{signal});
  document.querySelector('.close-dialog').addEventListener('click',()=>dialog.close(),{signal});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}},{signal});
  function fallback(message){
    root.classList.remove('enhanced');root.classList.add('fallback');status.textContent=message;status.classList.add('is-error');status.hidden=false;
    for(const c of chapters){c.removeAttribute('aria-hidden');c.inert=false;c.classList.remove('is-current');c.querySelector('.caption').removeAttribute('style');}
    trigger?.kill();cancelAnimationFrame(raf);renderer?.dispose();document.body.dataset.ready='fallback';
  }
  function getModel(i){
    if(!models.has(i)){const model=window.MacModels.create(items[i]);model.visible=false;scene.add(model);models.set(i,model);}
    return models.get(i);
  }
  function setAlpha(model,a){
    if(model.userData.alpha===a)return;model.userData.alpha=a;
    for(const m of model.userData.materials){const fade=a<.999;m.opacity=a;m.transparent=fade||m.userData.originalTransparent;m.depthWrite=fade?false:m.userData.originalDepthWrite;if(m.userData.fade!==fade){m.needsUpdate=true;m.userData.fade=fade;}}
  }
  function current(index){
    if(index===active)return;const old=active;active=index;
    chapters.forEach((c,i)=>{const yes=i===index;c.classList.toggle('is-current',yes);c.inert=!yes;c.setAttribute('aria-hidden',String(!yes));});
    links.forEach((a,i)=>{if(i===index)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});
    ghost.textContent=items[index].year;document.querySelector('.model-detail').textContent=items[index].detail;document.querySelector('.chapter-counter').textContent=String(index+1).padStart(2,'0')+' / '+items.length;
    document.querySelector('.live-status').textContent=items[index].year+'. '+items[index].name+'. '+items[index].subtitle;
    if(mobileMedia.matches){const el=links[index];nav.scrollTo({left:el.offsetLeft-nav.clientWidth/2+el.clientWidth/2,behavior:'instant'});}
    if(old>=0&&document.activeElement?.closest('.chapter')===chapters[old])links[index].focus({preventScroll:true});
    document.body.dataset.model=items[index].id;
  }
  function pose(i,p,alpha,transition=0){
    const model=getModel(i),mobile=mobileMedia.matches,side=i%2,ratio=mobile?.5:side?.32:.68;
    const visibleHeight=2*Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.position.z;
    const visibleWidth=visibleHeight*camera.aspect;
    model.visible=alpha>.002;if(!model.visible)return;
    setAlpha(model,alpha);
    const scale=model.userData.baseScale??model.scale.x;if(model.userData.baseScale===undefined)model.userData.baseScale=scale;
    // Portrait framing reserves the lower half for readable HTML captions.
    const fit=mobile?Math.min(visibleWidth*.79/4.8,visibleHeight*.30/3.8):Math.min(1.11,visibleWidth*.48/5.1,visibleHeight*.60/4.0);
    model.scale.setScalar(scale*fit*(1-Math.abs(transition)*.045));
    model.position.x=(ratio-.5)*visibleWidth+transition*(side?-.35:.35);
    model.position.y=mobile?visibleHeight*.19:-.02;
    const yaw=side?.40:-.43;
    const turn=(side?-1:1)*Math.PI*2*smooth((p-.04)/.53);
    model.rotation.set(reduced()?.035:.035+orbitX,yaw+(reduced()?0:turn+transition*.9+orbitY),reduced()?0:(side?-.025:.025));
  }
  function renderState(){
    const safe=clamp(value,0,items.length-1),i=Math.min(items.length-1,Math.floor(safe)),fraction=safe-i,t=reduced()?0:smooth((fraction-.56)/.44),next=Math.min(i+1,items.length-1),selected=reduced()?Math.min(items.length-1,Math.round(safe)):t<.5?i:next;
    if(reduced()){
      for(const m of models.values())m.visible=false;pose(selected,0,1);current(selected);
      captions.forEach((c,j)=>{c.style.opacity=j===selected?'1':'0';c.style.transform=mobileMedia.matches?'none':'translateY(-50%)';});
    }else{
      for(const m of models.values())m.visible=false;
      const outgoing=1-smooth(t/.60),incoming=smooth((t-.4)/.6);
      pose(i,fraction,outgoing,t);if(next!==i&&t>0)pose(next,0,incoming,t-1);
      current(selected);
      captions.forEach((c,j)=>{const isOld=j===i,isNext=j===next;let a=isOld?1-smooth(t/.47):isNext?smooth((t-.53)/.47):0;if(next===i)a=1;c.style.opacity=String(a);const move=isOld?-t*35:(1-t)*35,sgn=j%2?-1:1;c.style.transform=mobileMedia.matches?'translateX('+move*sgn*.3+'px)':'translate('+move*sgn+'px,-50%)';});
    }
    const from=mobileMedia.matches?50:i%2?32:68,to=mobileMedia.matches?50:next%2?32:68,pos=lerp(from,to,t);
    if(!mobileMedia.matches){tools.style.left=pos+'%';shadow.style.left=pos+'%';ghost.style.left=(pos-23)+'%';}
    else{shadow.style.left='50%';ghost.style.left='17%';}
    ghost.style.opacity=String(reduced()?1:1-.45*Math.sin(t*Math.PI));
    renderer.render(scene,camera);document.body.dataset.progress=safe.toFixed(3);
  }
  function resize(){
    width=innerWidth;height=innerHeight;const mobile=mobileMedia.matches;renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.5:2));renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();dirty=true;
  }
  function setInspect(next){
    inspecting=next;root.classList.toggle('orbiting',next);orbitButton.setAttribute('aria-pressed',String(next));orbitButton.firstChild.textContent=next?'Завершить осмотр ':'Осмотреть в 3D ';document.querySelector('.orbit-hint').hidden=!next;
    orbitX=orbitY=0;dirty=true;
  }
  function go(index,{keyboard=false}={}){
    index=clamp(index,0,items.length-1);setInspect(false);
    const start=chapters[0].offsetTop,end=chapters[items.length-1].offsetTop,at=lerp(start,end,index/(items.length-1));
    window.scrollTo({top:at,behavior:'instant'});target=value=index;dirty=true;renderState();
    history.replaceState(null,'','#'+items[index].id);if(keyboard)links[index].focus({preventScroll:true});
  }
  const T=window.THREE;
  if(!T||!window.MacModels||!window.ScrollTrigger){fallback('3D-сцена недоступна. Ниже сохранены все главы и источники.');return;}
  try{
    renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
    scene=new T.Scene();camera=new T.PerspectiveCamera(33,1,.1,80);camera.position.set(0,2.05,10.7);camera.lookAt(0,.2,0);
    const ambient=new T.HemisphereLight(0xffffff,0x697366,1.5);scene.add(ambient);
    const key=new T.DirectionalLight(0xfffef1,3.1);key.position.set(-4,6,7);scene.add(key);
    const fill=new T.DirectionalLight(0xc4d7ef,2.0);fill.position.set(5,2,1);scene.add(fill);
    const rim=new T.DirectionalLight(0xffffff,3);rim.position.set(2,4,-5);scene.add(rim);
    // Large studio reflectors make the aluminum read as metal without remote HDR assets.
    const studio=new T.Scene();studio.background=new T.Color('#a9b0ad');
    for(const [w,h,x,y,z,power]of[[8,5,-5,4,3,5],[5,8,5,2,-2,3],[10,4,0,7,0,4]]){const geo=new T.PlaneGeometry(w,h),m=new T.MeshBasicMaterial({color:new T.Color().setScalar(power),side:T.DoubleSide}),o=new T.Mesh(geo,m);o.position.set(x,y,z);o.lookAt(0,0,0);studio.add(o);owned.push(geo,m);}
    const pmrem=new T.PMREMGenerator(renderer);environment=pmrem.fromScene(studio,.04);scene.environment=environment.texture;scene.environmentIntensity=.65;pmrem.dispose();owned.forEach(o=>o.dispose());
    root.classList.add('enhanced');getModel(0);getModel(1);resize();current(0);
    trigger=ScrollTrigger.create({trigger:main,start:'top top',end:'bottom bottom',invalidateOnRefresh:true,onUpdate:self=>{target=self.progress*(items.length-1);dirty=true;if(inspecting)setInspect(false);}});
    const initial=items.findIndex(x=>x.id===location.hash.slice(1));if(initial>=0)go(initial);
    renderState();status.hidden=true;document.body.dataset.ready='true';
    let warm=2;const prewarm=()=>{if(disposed)return;if(warm<items.length){getModel(warm++);setTimeout(prewarm,90);}};setTimeout(prewarm,250);
  }catch(error){console.error('Mac scene initialization:',error);fallback('Этому браузеру недоступна 3D-сцена. Ниже можно прочитать всю историю.');return;}
  function tick(now){
    if(disposed)return;raf=requestAnimationFrame(tick);if(document.hidden||dialog.open||contextLost){lastTime=now;return;}
    const dt=Math.min(.05,(now-lastTime)/1000||.016);lastTime=now;const delta=target-value;
    if(Math.abs(delta)>.0003){value=reduced()?target:value+delta*(1-Math.exp(-dt*13));dirty=true;}else if(delta!==0){value=target;dirty=true;}
    if(dirty){renderState();dirty=false;}
  }
  raf=requestAnimationFrame(tick);
  window.addEventListener('resize',()=>{resize();ScrollTrigger.refresh();},{signal});
  window.addEventListener('hashchange',()=>{const i=items.findIndex(x=>x.id===location.hash.slice(1));if(i>=0)go(i);},{signal});
  nav.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();go(links.indexOf(a));},{signal});
  document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();go(0);},{signal});
  orbitButton.addEventListener('click',()=>setInspect(!inspecting),{signal});
  canvas.addEventListener('pointerdown',e=>{if(!inspecting||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:orbitY,startY:orbitX};canvas.setPointerCapture(e.pointerId);},{signal});
  canvas.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;orbitY=drag.startX+(e.clientX-drag.x)*.008;orbitX=clamp(drag.startY+(e.clientY-drag.y)*.004,-.65,.65);dirty=true;},{signal});
  const release=e=>{if(drag?.id===e.pointerId)drag=null;};canvas.addEventListener('pointerup',release,{signal});canvas.addEventListener('pointercancel',release,{signal});canvas.addEventListener('lostpointercapture',release,{signal});
  window.addEventListener('keydown',e=>{
    if(dialog.open||e.altKey||e.ctrlKey||e.metaKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key==='Escape'&&inspecting){setInspect(false);orbitButton.focus();return;}
    if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();go(e.key==='Home'?0:e.key==='End'?items.length-1:active+(e.key==='ArrowRight'?1:-1),{keyboard:true});}
  },{signal});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;status.textContent='3D-сцена приостановлена. Восстанавливаем изображение…';status.hidden=false;},{signal});
  canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;status.hidden=true;dirty=true;},{signal});
  window.addEventListener('pagehide',e=>{if(e.persisted)return;disposed=true;events.abort();cancelAnimationFrame(raf);trigger?.kill();environment?.dispose();window.MacModels.dispose();renderer.dispose();},{signal});
  // Read-only diagnostics used by the local QA page; no remote services or telemetry.
  window.MacExhibit=Object.freeze({get state(){return {active,progress:value,reduced:reduced(),inspecting,models:models.size,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}});
})();
