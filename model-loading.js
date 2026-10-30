const aborted=()=>new DOMException('Model request superseded','AbortError');

// Encoded GLBs are cheap to retain. Decoded meshes and GPU resources have a separate, smaller window.
export function neighborOrder(index,count,ahead=2,behind=1,direction=1){
 const offsets=[0];for(let n=1;n<=ahead;n++)offsets.push(n*direction);for(let n=1;n<=behind;n++)offsets.push(-n*direction);
 return [...new Set(offsets.filter(n=>n===0||(n*direction>0?n*direction<=ahead:-n*direction<=behind)).map(n=>index+n))].filter(i=>i>=0&&i<count);
}
export class ModelBuffers{
 constructor(urls,{maxBytes=12*1024*1024,concurrency=2,fetcher=globalThis.fetch}={}){this.urls=urls;this.maxBytes=maxBytes;this.concurrency=concurrency;this.fetcher=fetcher.bind(globalThis);this.cache=new Map();this.jobs=new Map();this.order=[];this.bytes=0;this.active=0;this.disposed=false;this.paused=false;}
 plan(order){
  this.order=[...new Set(order)].filter(i=>this.urls[i]);
  for(const [i,job]of this.jobs)if(!this.order.includes(i)){job.controller.abort();job.reject(aborted());this.jobs.delete(i);}
  for(const i of this.order)this.get(i).catch(()=>{});
  this.pump();
 }
 get(index){
  if(this.disposed)return Promise.reject(aborted());
  if(this.cache.has(index)){const data=this.cache.get(index);this.cache.delete(index);this.cache.set(index,data);return Promise.resolve(data);}
  if(this.jobs.has(index))return this.jobs.get(index).promise;
  if(!this.urls[index])return Promise.reject(new Error('Missing model URL'));
  if(!this.order.includes(index))this.order.push(index);
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  this.jobs.set(index,{promise,resolve,reject,controller:new AbortController(),running:false});this.pump();return promise;
 }
 pump(){
  if(this.disposed||this.paused)return;
  while(this.active<this.concurrency){
   const index=this.order.find(i=>this.jobs.has(i)&&!this.jobs.get(i).running);if(index===undefined)return;
   const job=this.jobs.get(index);job.running=true;this.active++;
   (async()=>{
    try{const response=await this.fetcher(this.urls[index],{signal:job.controller.signal,priority:index===this.order[0]?'high':'low'});if(!response.ok)throw new Error('HTTP '+response.status);const data=await response.arrayBuffer();if(job.controller.signal.aborted||this.disposed)throw aborted();
     if(data.byteLength<=this.maxBytes){this.cache.set(index,data);this.bytes+=data.byteLength;while(this.bytes>this.maxBytes){const old=[...this.cache.keys()].find(i=>i!==this.order[0])??this.cache.keys().next().value;this.evict(old);}}
     job.resolve(data);
    }catch(error){job.reject(error);}
    finally{if(this.jobs.get(index)===job)this.jobs.delete(index);this.active--;this.pump();}
   })();
  }
 }
 evict(index){const data=this.cache.get(index);if(data){this.bytes-=data.byteLength;this.cache.delete(index);}}
 pause(value){this.paused=value;if(!value)this.pump();}
 dispose(){this.disposed=true;for(const job of this.jobs.values()){job.controller.abort();job.reject(aborted());}this.jobs.clear();this.cache.clear();this.bytes=0;}
}

export function idleWork(signal,urgent=()=>false){
 return new Promise((resolve,reject)=>{
  let cancel=()=>{},done=false;
  const cleanup=()=>{signal?.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',start);};
  const finish=()=>{if(done)return;done=true;cleanup();resolve();};
  const abort=()=>{if(done)return;done=true;cancel();cleanup();reject(aborted());};
  const start=()=>{
   if(document.hidden)return;
   document.removeEventListener('visibilitychange',start);
   if(!urgent()&&typeof requestIdleCallback==='function'){const id=requestIdleCallback(finish,{timeout:600});cancel=()=>cancelIdleCallback(id);}
   else{const id=setTimeout(finish,0);cancel=()=>clearTimeout(id);}
  };
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  if(document.hidden)document.addEventListener('visibilitychange',start);else start();
 });
}
