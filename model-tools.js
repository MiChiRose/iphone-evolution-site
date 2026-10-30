import * as T from 'three';
function alignPrincipalAxes(object){
 const points=[];object.updateMatrixWorld(true);object.traverse(node=>{if(!node.isMesh)return;const pos=node.geometry.attributes.position;for(let i=0;i<pos.count;i+=Math.max(1,Math.ceil(pos.count/4000)))points.push(new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(node.matrixWorld));});
 if(points.length<3)return;const center=new T.Vector3();points.forEach(p=>center.add(p));center.divideScalar(points.length);const a=Array.from({length:3},()=>[0,0,0]),v=[[1,0,0],[0,1,0],[0,0,1]];
 for(const p of points){const x=p.sub(center).toArray();for(let i=0;i<3;i++)for(let j=0;j<3;j++)a[i][j]+=x[i]*x[j];}
 for(let iteration=0;iteration<24;iteration++){let p=0,q=1;for(const[i,j]of[[0,2],[1,2]])if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}if(Math.abs(a[p][q])<1e-10)break;const angle=.5*Math.atan2(2*a[p][q],a[p][p]-a[q][q]),c=Math.cos(angle),s=Math.sin(angle),app=a[p][p],aqq=a[q][q],apq=a[p][q];
 for(let k=0;k<3;k++)if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp+s*kq;a[k][q]=a[q][k]=-s*kp+c*kq;}
 a[p][p]=c*c*app+2*c*s*apq+s*s*aqq;a[q][q]=s*s*app-2*c*s*apq+c*c*aqq;a[p][q]=a[q][p]=0;
 for(let k=0;k<3;k++){const vp=v[k][p],vq=v[k][q];v[k][p]=c*vp+s*vq;v[k][q]=-s*vp+c*vq;}}
 const order=[0,1,2].sort((i,j)=>a[j][j]-a[i][i]),up=new T.Vector3(...v.map(row=>row[order[0]])),right=new T.Vector3(...v.map(row=>row[order[1]]));if(up.y<0)up.negate();if(right.x<0)right.negate();const front=new T.Vector3().crossVectors(right,up).normalize();object.applyMatrix4(new T.Matrix4().makeBasis(right,up,front).transpose());
}
export function prepareModel(gltf,item){
 const outer=new T.Group(),object=gltf.scene;outer.add(object);
 // Sketchfab glTF contains source coordinate transforms. Normalize the evaluated mesh, not its raw root rotation.
 for(const name of item.excludeNodes||[]){(object.getObjectByName(name)||object.getObjectByName(T.PropertyBinding.sanitizeNodeName(name)))?.removeFromParent();}
 for(const name of item.inactiveScreenNodes||[]){const node=object.getObjectByName(name);if(node?.isMesh&&!Array.isArray(node.material)){const mat=node.material=node.material.clone();mat.map=null;mat.emissiveMap=null;mat.emissive?.set('#000000');mat.color?.set('#090c10');mat.roughness=.24;mat.metalness=.05;}}
 if(item.alignPrincipalAxes)alignPrincipalAxes(object);
 let box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3());
 if(item.orientation){object.rotation.set(...item.orientation);}
 else if(!item.alignPrincipalAxes&&!item.keepYUp){if(size.z>size.y&&size.z>size.x)object.applyMatrix4(new T.Matrix4().makeRotationX(-Math.PI/2));else if(size.x>size.y)object.applyMatrix4(new T.Matrix4().makeRotationZ(Math.PI/2));object.updateMatrixWorld(true);box.setFromObject(object);size=box.getSize(new T.Vector3());if(size.x<size.z)object.applyMatrix4(new T.Matrix4().makeRotationY(Math.PI/2));}
 object.updateMatrixWorld(true);box.setFromObject(object);size=box.getSize(new T.Vector3());const center=box.getCenter(new T.Vector3());
 if(!Number.isFinite(size.y)||size.y<=0)throw new Error('Empty model bounds');
 const normal=new T.Group();outer.remove(object);normal.add(object);object.position.sub(center);normal.scale.setScalar(4.1/size.y);outer.add(normal);
 const materials=new Set();object.traverse(node=>{if(node.isMesh){node.frustumCulled=false;for(const mat of Array.isArray(node.material)?node.material:[node.material]){if(!mat||materials.has(mat))continue;materials.add(mat);if(item.restoreLegacyContrast&&!mat.map){mat.color?.set(mat.name==='Material'?'#a8acb5':'#101216');mat.metalness=mat.name==='Material'?.95:.05;mat.roughness=mat.name==='Material'?.25:.35;if(mat.emissiveMap){mat.emissive?.set('#ffffff');mat.emissiveIntensity=1;}else mat.emissive?.set('#000000');}const change=item.materialOverrides?.[mat.name];if(change){if(change.color)mat.color?.set(change.color);if(change.emissive)mat.emissive?.set(change.emissive);if(change.roughness!==undefined)mat.roughness=change.roughness;if(change.metalness!==undefined)mat.metalness=change.metalness;}}}});
 outer.userData={materials};outer.visible=false;return outer;
}
export function disposeModel(model){const geo=new Set(),mat=new Set(),textures=new Set();model.traverse(n=>{if(n.geometry)geo.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:n.material?[n.material]:[]){mat.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});model.removeFromParent();geo.forEach(g=>g.dispose());mat.forEach(m=>m.dispose());textures.forEach(t=>{t.source?.data?.close?.();t.dispose();});}
