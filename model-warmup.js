import * as T from 'three';
import {idleWork} from './model-loading.js?v=4';

async function compileModel(model,{renderer,scene,camera,signal,urgent}){
 // Three r180's compileAsync poll cannot be cancelled after a context loss.
 // Use the same r180 program readiness checks, with abortable idle yields.
 const materials=renderer.compile(model,camera,scene);
 const programs=new Set([...materials].map(material=>renderer.properties.get(material).currentProgram));
 while([...programs].some(program=>!program.isReady())){
  await idleWork(signal,urgent);signal.throwIfAborted();
 }
}

export function modelBytes(model){
 const arrays=new Set(),textures=new Set();let bytes=0;
 model.traverse(n=>{if(!n.geometry)return;for(const a of [...Object.values(n.geometry.attributes),n.geometry.index].filter(Boolean)){const array=a.isInterleavedBufferAttribute?a.data.array:a.array;if(array&&!arrays.has(array.buffer)){arrays.add(array.buffer);bytes+=array.buffer.byteLength;}}});
 for(const m of model.userData.materials)for(const t of Object.values(m))if(t?.isTexture&&!textures.has(t)){textures.add(t);const image=t.image;bytes+=(image?.width||0)*(image?.height||0)*4*(t.generateMipmaps?4/3:1);}
 return Math.ceil(bytes);
}

// Same framebuffer/color space, lights and geometry as the visible pass. A zero-area
// scissor prevents writes to the user's canvas while textures, buffers and VAOs warm up.
export async function warmModel(model,{renderer,scene,camera,signal,urgent,batchSize=6}){
 const staging=new T.Group();
 const check=()=>signal.throwIfAborted();
 await idleWork(signal,urgent);check();
 await compileModel(model,{renderer,scene,camera,signal,urgent});check();
 // Glass with physical transmission renders opaque surfaces to a linear target
 // first. Compile that variant too, rather than discovering it at the first turn.
 if([...model.userData.materials].some(material=>material.transmission>0)){
  await idleWork(signal,urgent);check();
  const target=new T.WebGLRenderTarget(1,1,{depthBuffer:false}),previous=renderer.getRenderTarget();let compiling;
  try{
   try{renderer.setRenderTarget(target);compiling=compileModel(model,{renderer,scene,camera,signal,urgent});}
   finally{renderer.setRenderTarget(previous);}
   await compiling;check();
  }finally{target.dispose();}
 }
 const textures=new Set();for(const m of model.userData.materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
 for(const texture of textures){await idleWork(signal,urgent);check();renderer.initTexture(texture);}
 model.updateMatrixWorld(true);const proxies=[];model.traverse(mesh=>{if(mesh.isMesh){const proxy=mesh.clone(false);proxy.matrixAutoUpdate=false;proxy.matrix.copy(mesh.matrixWorld);proxy.visible=true;proxies.push(proxy);}});
 const batches=[];for(let i=0;i<proxies.length;i+=batchSize)batches.push(proxies.slice(i,i+batchSize));
 // A complete pass also initializes scene-level transmission targets and any
 // combinations not encountered by an individual upload batch.
 batches.push(proxies);
 for(const batch of batches){
  await idleWork(signal,urgent);check();staging.add(...batch);
  const visibility=scene.children.filter(n=>!n.isLight).map(n=>[n,n.visible]);for(const [node]of visibility)node.visible=false;scene.add(staging);
  const scissor=renderer.getScissor(new T.Vector4()),test=renderer.getScissorTest(),clear=renderer.autoClear;
  try{renderer.setScissor(0,0,0,0);renderer.setScissorTest(true);renderer.autoClear=false;renderer.render(scene,camera);}
  finally{renderer.autoClear=clear;renderer.setScissor(scissor);renderer.setScissorTest(test);scene.remove(staging);staging.remove(...batch);for(const [node,visible]of visibility)node.visible=visible;}
 }
}
