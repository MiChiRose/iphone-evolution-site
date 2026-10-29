/* Original procedural 3D reconstructions. No model files from third parties. */
window.MacModels = (() => {
  'use strict';
  const T=window.THREE;
  if(!T)return null;
  const geometries=new Map(),textures=new Map(),ownedMaterials=new Set();
  const mat=(color,metalness=0,roughness=.42)=>{const m=new T.MeshStandardMaterial({color,metalness,roughness});ownedMaterials.add(m);return m;};
  const white=mat('#e5e5dd',.04,.28),silver=mat('#bcc0c0',.85,.29),dark=mat('#191d20',.55,.32),black=mat('#111415',.08,.32),rubber=mat('#4c4d48',0,.9),chrome=mat('#d0d5d5',.96,.14);
  function roundedGeometry(w,h,d,r=.06){
    const key=[w,h,d,r].join(',');if(geometries.has(key))return geometries.get(key);
    r=Math.min(r,w*.45,h*.45,d*.45);const s=new T.Shape(),x=-w/2+r,y=-h/2+r,ww=w-2*r,hh=h-2*r;
    s.moveTo(x,y-r);s.lineTo(x+ww,y-r);s.quadraticCurveTo(x+ww+r,y-r,x+ww+r,y);s.lineTo(x+ww+r,y+hh);s.quadraticCurveTo(x+ww+r,y+hh+r,x+ww,y+hh+r);s.lineTo(x,y+hh+r);s.quadraticCurveTo(x-r,y+hh+r,x-r,y+hh);s.lineTo(x-r,y);s.quadraticCurveTo(x-r,y-r,x,y-r);
    const g=new T.ExtrudeGeometry(s,{depth:d-2*r,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:r,bevelThickness:r,curveSegments:8});g.translate(0,0,-d/2+r);g.computeVertexNormals();geometries.set(key,g);return g;
  }
  function box(parent,w,h,d,m,x=0,y=0,z=0,r=.06){const o=new T.Mesh(roundedGeometry(w,h,d,r),m);o.position.set(x,y,z);parent.add(o);return o;}
  function sphere(parent,w,h,d,m,x=0,y=0,z=0,cap=null){const k='sphere'+cap;let g=geometries.get(k);if(!g){g=new T.SphereGeometry(1,48,32);if(cap!==null){const a=g.attributes.position;for(let i=0;i<a.count;i++)a.setZ(i,Math.min(a.getZ(i),cap));g.computeVertexNormals();}geometries.set(k,g);}const o=new T.Mesh(g,m);o.scale.set(w,h,d);o.position.set(x,y,z);parent.add(o);return o;}
  function cylinderBetween(parent,a,b,r,m){const va=new T.Vector3(...a),vb=new T.Vector3(...b),g=new T.CylinderGeometry(r,r,va.distanceTo(vb),24);const o=new T.Mesh(g,m);o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(va).normalize());parent.add(o);geometries.set('cylinder'+geometries.size,g);return o;}
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function texture(kind){
    if(textures.has(kind))return textures.get(kind);
    const c=document.createElement('canvas');c.width=1024;c.height=640;const ctx=c.getContext('2d');
    if(kind==='classic'||kind==='platinum'){
      ctx.fillStyle='#9fa99e';ctx.fillRect(0,0,1024,640);
      ctx.fillStyle='#c7cdc0';ctx.fillRect(0,0,1024,34);ctx.fillStyle='#31382f';ctx.font='20px monospace';ctx.fillText('  File   Edit   View   Special',20,25);
      ctx.fillStyle='#e0e1d6';ctx.fillRect(135,104,675,410);ctx.strokeStyle='#31382f';ctx.lineWidth=3;ctx.strokeRect(135,104,675,410);ctx.fillStyle='#31382f';
      for(let i=0;i<5;i++)ctx.fillRect(150,115+i*4,640,1);ctx.fillStyle='#e0e1d6';ctx.fillRect(339,106,235,26);ctx.fillStyle='#31382f';ctx.font='18px monospace';ctx.fillText('Macintosh',365,127);
      ctx.font='italic 112px Georgia';ctx.fillText(kind==='classic'?'hello.':'hello again.',kind==='classic'?315:225,360);ctx.font='17px monospace';ctx.fillText('Welcome to Macintosh.',285,433);
      ctx.strokeRect(892,65,63,48);ctx.fillRect(901,71,45,25);ctx.fillRect(908,103,31,4);ctx.font='14px monospace';ctx.fillText('Macintosh',880,138);
      if(kind==='platinum'){ctx.globalCompositeOperation='multiply';ctx.fillStyle='#72bad2';ctx.fillRect(0,34,1024,606);ctx.globalCompositeOperation='source-over';}
    }else{
      const palettes={aqua:['#041b5a','#087cc0','#75d3e2'],aurora:['#070826','#631b80','#62c7d3'],mountain:['#22313d','#466980','#c6d8de'],wave:['#092742','#057b9b','#77d0cd'],sur:['#213588','#cb6c4a','#e9b1a3'],pro:['#091834','#303cc4','#96b0f4'],touch:['#071e1c','#1d7069','#a9e2c0']};
      const p=palettes[kind]||palettes.aqua;const grad=ctx.createLinearGradient(0,640,1024,0);grad.addColorStop(0,p[0]);grad.addColorStop(.5,p[1]);grad.addColorStop(1,p[2]);ctx.fillStyle=grad;ctx.fillRect(0,0,1024,640);
      if(kind==='mountain'){
        for(let i=0;i<4;i++){ctx.fillStyle=['#263742','#3f5868','#617a89','#9fb2bb'][i];ctx.beginPath();ctx.moveTo(-40,640);ctx.lineTo(270+i*130,180+i*50);ctx.lineTo(680+i*125,640);ctx.fill();}
      }else{
        for(let i=5;i>=0;i--){ctx.beginPath();ctx.moveTo(-100,630-i*40);ctx.bezierCurveTo(300,90-i*38,600,790-i*70,1200,-30-i*15);ctx.lineTo(1200,700);ctx.lineTo(-100,700);ctx.closePath();ctx.fillStyle=p[i%3]+['35','30','50','45','70','50'][i];ctx.fill();}
      }
      ctx.fillStyle='rgba(245,252,255,.3)';ctx.fillRect(0,0,1024,23);ctx.fillStyle='rgba(255,255,255,.9)';ctx.font='13px sans-serif';ctx.fillText('   Finder   File   Edit   View   Go   Window   Help',16,16);ctx.fillText('9:41',965,16);
      ctx.fillStyle='rgba(225,240,255,.34)';roundRect(ctx,306,580,412,52,14);
      const colors=['#b9e9ff','#ddd7cf','#f1a644','#78c9f2','#eb7a82','#d9dae8','#9bb3d2','#b9d29d'];
      for(let i=0;i<8;i++){ctx.fillStyle=colors[i];roundRect(ctx,319+i*49,588,37,35,8);ctx.fillStyle='#ffffff78';roundRect(ctx,326+i*49,594,23,11,3);}
    }
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;textures.set(kind,t);return t;
  }
  function display(parent,w,h,kind,x,y,z){const m=new T.MeshBasicMaterial({map:texture(kind)});ownedMaterials.add(m);const geo=new T.PlaneGeometry(w,h),mesh=new T.Mesh(geo,m);mesh.position.set(x,y,z);parent.add(mesh);geometries.set('display'+geometries.size,geo);return mesh;}
  function label(parent,text,w,h,color,x,y,z,rotation=0){
    const key='label'+text+color;let tex=textures.get(key);
    if(!tex){const c=document.createElement('canvas');c.width=text===''?128:512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font=(text===''?'92px':'40px')+' -apple-system, Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,c.width/2,68);tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;textures.set(key,tex);}
    const m=new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false});ownedMaterials.add(m);const mesh=new T.Mesh(new T.PlaneGeometry(w,h),m);mesh.position.set(x,y,z);mesh.rotation.y=rotation;parent.add(mesh);geometries.set('label'+geometries.size,mesh.geometry);return mesh;
  }
  function rainbow(parent,x,y,z,size=.2){
    const colors=['#60a245','#efb83f','#e88c37','#c65044','#8c5c9c','#5291c0'];
    colors.forEach((c,i)=>box(parent,size,.025,.01,mat(c),x,y+.065-i*.025,z,.003));
    box(parent,.045,.024,.011,mat(colors[0]),x+.025,y+.095,z,.003).rotation.z=.5;
  }
  function keyboard(parent,{width=3.2,y=-.86,z=-.48,whiteKeys=false,bar=false,modern=false}={}){
    const keyMat=whiteKeys?mat('#e2e1d9',0,.6):black;
    const keyGeo=roundedGeometry(width/15-.025,.036,.15,.012),n=5*14+1;
    const keys=new T.InstancedMesh(keyGeo,keyMat,n),dummy=new T.Object3D();let count=0;
    for(let row=0;row<5;row++)for(let col=0;col<14;col++){
      dummy.position.set((col-6.5)*width/14,y,z+(row-2)*.205);dummy.scale.set(1,1,1);dummy.updateMatrix();keys.setMatrixAt(count++,dummy.matrix);
    }
    dummy.position.set(0,y,z+.62);dummy.scale.set(5.4,1,1);dummy.updateMatrix();keys.setMatrixAt(count,dummy.matrix);parent.add(keys);
    if(bar){const strip=box(parent,width-.05,.012,.1,black,0,y+.002,z-.62,.009);const barTex=texture('touch');const bm=new T.MeshBasicMaterial({map:barTex});ownedMaterials.add(bm);const screen=new T.Mesh(new T.PlaneGeometry(width-.28,.075),bm);screen.rotation.x=-Math.PI/2;screen.position.set(0,y+.012,z-.62);parent.add(screen);}
    if(modern){box(parent,width+.16,.014,1.36,black,0,y-.026,z+.05,.06);}
    const labels=document.createElement('canvas');labels.width=1024;labels.height=440;const ctx=labels.getContext('2d');ctx.fillStyle=whiteKeys?'#5d6059':'#b8bdb8';ctx.font='18px Arial';ctx.textAlign='center';ctx.textBaseline='middle';const rows=['1234567890−=⌫','QWERTYUIOP[]','ASDFGHJKL;↵','ZXCVBNM,./↑'];
    for(let row=0;row<4;row++)for(let col=0;col<rows[row].length;col++)ctx.fillText(rows[row][col],(col+.6)*1024/14,(row+.9)*88);
    const t=new T.CanvasTexture(labels);t.colorSpace=T.SRGBColorSpace;textures.set('keys'+textures.size,t);const m=new T.MeshBasicMaterial({map:t,transparent:true,depthWrite:false});ownedMaterials.add(m);const plane=new T.Mesh(new T.PlaneGeometry(width,1.04),m);plane.rotation.x=-Math.PI/2;plane.position.set(0,y+.02,z-.02);parent.add(plane);geometries.set('keysplane'+geometries.size,plane.geometry);
  }
  function compact(item){
    const g=new T.Group(),beige=mat(item.variant==='se'?'#c2bda9':'#d7cfb7',0,.58),recess=mat('#787b6d',0,.7),glass=mat('#25322c',.05,.24);
    box(g,2.35,3.2,2.0,beige,0,.25,0,.16);box(g,2.22,3.05,.16,beige,0,.27,1.0,.09);
    box(g,1.9,1.64,.08,recess,0,.75,1.092,.12);box(g,1.73,1.45,.08,glass,0,.75,1.14,.13);display(g,1.53,1.18,'classic',0,.75,1.188);
    box(g,.89,.06,.03,black,.32,-.48,1.103,.016);box(g,.13,.1,.03,recess,.9,-.48,1.108,.01);
    if(item.variant==='se')for(let i=0;i<6;i++)box(g,1.88,.028,.012,recess,0,-.72-i*.07,1.104,.004);
    else label(g,'Macintosh',.54,.13,'#5b6053',.56,-.85,1.106);
    rainbow(g,-.82,-.48,1.11,.14);box(g,1.64,.08,.82,recess,0,1.87,-.15,.03);box(g,1.6,.1,.56,beige,0,1.9,.05,.03);
    for(let i=0;i<9;i++)box(g,1.7,.025,.012,recess,0,1.12-i*.10,-1.005,.004);
    box(g,2.22,.16,1.9,beige,0,-1.39,.03,.04);
    const kb=new T.Group();kb.position.set(0,-.56,2.05);kb.scale.setScalar(.7);g.add(kb);box(kb,3.35,.18,1.38,beige,0,-.45,0,.06);keyboard(kb,{width:2.94,y:-.34,z:0,whiteKeys:true});
    const mouse=sphere(g,.2,.10,.32,beige,1.47,-1.18,1.9);box(g,.21,.025,.15,recess,1.47,-1.08,1.87,.012);
    g.scale.setScalar(.9);return g;
  }
  function g3(){
    const g=new T.Group(),teal=mat('#128c9a',.12,.22),pale=mat('#dce3d5',.03,.33),seam=mat('#0e5d67',.08,.35);
    sphere(g,1.60,1.55,1.64,teal,0,.25,-.18,.7);sphere(g,1.46,1.42,1.5,mat('#46bac0',.05,.4),0,.25,-.23,.7);
    box(g,2.87,2.63,.24,pale,0,.17,1.05,.22);box(g,2.5,1.99,.09,seam,0,.45,1.19,.19);box(g,2.38,1.88,.09,black,0,.45,1.24,.15);display(g,2.16,1.65,'platinum',0,.45,1.291);
    box(g,2.54,.28,.16,teal,0,-.86,1.18,.07);box(g,1.38,.15,.017,seam,.0,-.85,1.275,.025);box(g,1.33,.105,.018,teal,.0,-.845,1.289,.015);label(g,'iMac',.42,.13,'#387b7c',0,-.55,1.25);
    for(const x of[-1.10,1.10]){sphere(g,.105,.14,.025,seam,x,-.88,1.28);for(let i=0;i<4;i++)box(g,.10,.009,.01,pale,x,-.97+i*.045,1.31,.002);}
    const handle=new T.Mesh(new T.TorusGeometry(.30,.065,12,32,Math.PI),pale);handle.position.set(0,1.70,-.22);handle.rotation.x=Math.PI/2;g.add(handle);geometries.set('handle',handle.geometry);
    box(g,1.18,.15,1.58,pale,0,-1.35,-.15,.07);cylinderBetween(g,[-.65,-1.25,.6],[.65,-1.25,.6],.08,pale);
    for(let i=0;i<13;i++)box(g,.028,.84,.015,seam,(i-6)*.115,.65,-1.62,.004);
    label(g,'',.55,.35,'#c9e8df',0,.14,-1.78,Math.PI);g.scale.setScalar(.94);return g;
  }
  function g4(){
    const g=new T.Group(),domeGeo=new T.SphereGeometry(1.17,64,32,0,Math.PI*2,0,Math.PI/2);geometries.set('dome',domeGeo);const dome=new T.Mesh(domeGeo,white);dome.scale.y=.64;dome.position.set(0,-1.30,.2);g.add(dome);
    box(g,1.66,.04,1.56,white,0,-1.32,.21,.015);box(g,.92,.025,.04,black,0,-1.06,1.18,.005);label(g,'',.25,.16,'#929893',0,-.89,1.12);
    cylinderBetween(g,[0,-.68,.1],[0,.11,-.25],.12,chrome);sphere(g,.18,.18,.18,chrome,0,.11,-.25);cylinderBetween(g,[0,.11,-.25],[0,.98,-.02],.11,chrome);
    const screen=new T.Group();screen.position.set(0,1.1,.13);screen.rotation.x=-.05;g.add(screen);box(screen,3.02,2.07,.20,white,0,0,0,.12);box(screen,2.72,1.72,.03,black,0,.05,.112,.035);display(screen,2.59,1.60,'aqua',0,.05,.134);label(screen,'',.22,.14,'#a0a9a4',0,-.92,.13);
    label(screen,'',.44,.28,'#a4aaa4',0,0,-.12,Math.PI);g.scale.setScalar(.96);return g;
  }
  function g5(){
    const g=new T.Group();box(g,3.64,2.85,.40,white,0,.52,0,.12);box(g,3.34,2.08,.025,black,0,.75,.216,.035);display(g,3.19,1.96,'aqua',0,.75,.235);label(g,'',.3,.2,'#848d88',0,-.58,.22);
    const stand=box(g,.56,1.24,.16,silver,0,-.95,-.18,.05);stand.rotation.x=-.3;box(g,1.44,.07,1.25,silver,0,-1.54,.04,.03);
    for(let i=0;i<6;i++)box(g,.14,.18,.025,black,-1.10+i*.33,-.21,-.212,.018);
    box(g,.012,.75,.23,black,1.826,.55,0,.004);label(g,'',.55,.34,'#8d9691',0,.65,-.218,Math.PI);g.scale.setScalar(.92);return g;
  }
  function laptop(item){
    const v=item.variant,modern=v==='pro'||v==='touch',isWhite=v==='white',gold=v==='gold',thin=['gold','touchbar','m1','retina'].includes(v);
    const g=new T.Group(),w=gold?3.60:4.04,depth=gold?2.35:2.64,thick=isWhite?.22:v==='m1'?.20:thin?.13:modern?.20:.23;
    const body=isWhite?white:gold?mat('#c4ad84',.82,.31):v==='touchbar'||v==='touch'?mat('#697376',.82,.3):silver;
    const chassis=box(g,w,thick,depth,body,0,-.96,0,.065);
    if(v==='m1'){const geo=chassis.geometry.clone(),a=geo.attributes.position;for(let i=0;i<a.count;i++){const front=Math.max(0,Math.min(1,(a.getZ(i)+depth/2)/depth));const y=a.getY(i);a.setY(i,thick/2-(thick/2-y)*(1-.72*front));}geo.computeVertexNormals();chassis.geometry=geo;geometries.set('air-wedge',geo);}
    box(g,w-.025,.025,depth-.025,body,0,-.96+thick/2,0,.012);
    const hingeZ=-depth/2+.12;box(g,w*.82,.12,.17,black,0,-.87,hingeZ,.04);
    const lid=new T.Group();lid.position.set(0,-.85,hingeZ);lid.rotation.x=-.18;g.add(lid);g.userData.lid=lid;
    const lh=gold?2.15:2.48,ld=isWhite?.14:modern?.10:.075;
    box(lid,w-.03,lh,ld,body,0,lh/2,0,.065);box(lid,w-.16,lh-.13,.018,isWhite?white:black,0,lh/2,ld/2+.012,.032);
    const bezel=modern?.14:isWhite?.33:.25,sh=lh-(modern?.23:.37),sy=lh/2+(modern?.022:.025);
    display(lid,w-bezel,sh,item.screen,0,sy,ld/2+.027);
    if(modern){const islandY=lh-(v==='touch'?.20:.095);box(lid,v==='touch'?.34:.40,v==='touch'?.09:.115,.015,black,0,islandY,ld/2+.041,.028);sphere(lid,.014,.014,.008,mat('#35464e',.2,.15),.055,islandY+.01,ld/2+.052);}
    else{sphere(lid,.018,.018,.008,black,0,lh-.092,ld/2+.03);label(lid,isWhite?'MacBook':'MacBook Pro',.52,.095,isWhite?'#676d65':'#afb5af',0,.078,ld/2+.03);}
    label(lid,'',.75,.48,isWhite||['unibody','retina'].includes(v)?'#f7f9ef':'#303c3d',0,lh*.51,-ld/2-.01,Math.PI);
    const ky=-.96+thick/2+.036,kw=gold?3.07:modern?3.20:3.38;
    keyboard(g,{width:kw,y:ky,z:-.40,whiteKeys:isWhite,bar:v==='touchbar',modern});
    const track=box(g,modern||v==='touchbar'?1.73:1.46,.012,.70,isWhite?mat('#d9d9d0',0,.5):gold?mat('#b8a47f',.75,.38):mat('#a5aeae',.75,.38),0,ky-.016,.71,.024);
    const frame=box(g,modern||v==='touchbar'?1.77:1.50,.009,.74,isWhite?mat('#c1c5b9',0,.7):mat('#788181',.6,.4),0,ky-.022,.71,.025);
    // Speaker perforations are one instanced draw call per laptop.
    if(!isWhite&&!gold){const geo=new T.SphereGeometry(.009,4,3),holes=new T.InstancedMesh(geo,black,320),d=new T.Object3D();let n=0;for(const sign of[-1,1])for(let row=0;row<32;row++)for(let col=0;col<5;col++){d.position.set(sign*(w/2-.25+col*.035),ky-.012,-.98+row*.039);d.scale.set(1,.15,1);d.updateMatrix();holes.setMatrixAt(n++,d.matrix);}g.add(holes);geometries.set('holes'+geometries.size,geo);}
    // Port recesses are placed on the side faces, so rotation reveals them.
    const portMat=black;
    if(v==='unibody'){
      box(g,.025,.045,.72,portMat,w/2+.003,-.96,-.08,.008);
      for(let i=0;i<5;i++)box(g,.025,.065,.14,portMat,-w/2-.003,-.96,-.92+i*.3,.008);
    }else if(modern){
      box(g,.025,.045,.24,portMat,w/2+.003,-.96,-.8,.01);box(g,.025,.025,.34,portMat,w/2+.003,-.96,-.28,.005);box(g,.025,.045,.15,portMat,w/2+.003,-.96,.25,.009);
      for(let i=0;i<3;i++)box(g,.025,.045,.15,portMat,-w/2-.003,-.96,-.9+i*.35,.009);
    }else{for(let i=0;i<(gold?1:3);i++)box(g,.025,.04,.14,portMat,-w/2-.003,-.96,-.8+i*.32,.009);}
    for(const x of[-w/2+.3,w/2-.3])for(const z of[-depth/2+.25,depth/2-.25])sphere(g,.09,.017,.09,rubber,x,-.96-thick/2-.01,z);
    box(g,.44,.022,.025,rubber,0,-.96+thick/2-.015,depth/2+.01,.009);
    if(v==='m1'){g.userData.air=true;}
    g.position.y=-.17;g.scale.setScalar(gold?.97:.93);return g;
  }
  function create(item){let g;if(item.kind==='compact')g=compact(item);else if(item.kind==='g3')g=g3();else if(item.kind==='g4')g=g4();else if(item.kind==='g5')g=g5();else g=laptop(item);g.userData.id=item.id;g.userData.materials=new Set();const clones=new Map();g.traverse(o=>{if(o.isMesh){const clone=m=>{if(!clones.has(m)){const c=m.clone();c.userData.originalTransparent=m.transparent;c.userData.originalDepthWrite=m.depthWrite;clones.set(m,c);ownedMaterials.add(c);g.userData.materials.add(c);}return clones.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}});return g;}
  function dispose(){for(const g of geometries.values())g.dispose();for(const t of textures.values())t.dispose();for(const m of ownedMaterials)m.dispose();}
  return {create,dispose};
})();
