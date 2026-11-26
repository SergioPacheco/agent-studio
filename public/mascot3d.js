// Original WebGL renderer: procedural rounded meshes, real perspective, lighting and joints.
// No remote assets or rendering library. SVG remains an explicit fallback.
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mul(a,b){const c=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)c[i*4+j]+=a[k*4+j]*b[i*4+k];return c;}
function translation(x,y,z){const m=identity();m[12]=x;m[13]=y;m[14]=z;return m;}
function scale(x,y,z){const m=identity();m[0]=x;m[5]=y;m[10]=z;return m;}
function rotation(axis,a){const m=identity(),s=Math.sin(a),c=Math.cos(a);if(axis==='y'){m[0]=c;m[2]=-s;m[8]=s;m[10]=c;}else if(axis==='z'){m[0]=c;m[1]=s;m[4]=-s;m[5]=c;}else{m[5]=c;m[6]=s;m[9]=-s;m[10]=c;}return m;}
function perspective(aspect){const f=1/Math.tan(.64/2),n=.1,far=50;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0]);}
function geometry(radius){const vertices=[],steps=8;
 const point=(face,u,v)=>{let p;switch(face){case 0:p=[1,u,v];break;case 1:p=[-1,u,-v];break;case 2:p=[u,1,-v];break;case 3:p=[u,-1,v];break;case 4:p=[u,v,1];break;default:p=[-u,v,-1];}
  const core=p.map(x=>Math.max(-1+radius,Math.min(1-radius,x))),delta=p.map((x,i)=>x-core[i]),len=Math.hypot(...delta)||1,normal=delta.map(x=>x/len);return [...core.map((x,i)=>x+normal[i]*radius),...normal];};
 for(let f=0;f<6;f++)for(let i=0;i<steps;i++)for(let j=0;j<steps;j++){const u=-1+i*2/steps,v=-1+j*2/steps,d=2/steps;for(const [a,b] of [[u,v],[u+d,v],[u+d,v+d],[u,v],[u+d,v+d],[u,v+d]])vertices.push(...point(f,a,b));}
 return new Float32Array(vertices);
}
function color(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
export function mount3D(canvas,agent){
 let gl;try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});}catch{return null;}if(!gl)return null;
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Shader não compilou');return s;};
 const vertex='attribute vec3 position; attribute vec3 normal; uniform mat4 model; uniform mat4 vp; uniform vec3 size; varying vec3 n; varying vec3 world; void main(){vec4 p=model*vec4(position,1.0);world=p.xyz;n=normalize(mat3(model)*(normal/(size*size)));gl_Position=vp*p;}';
 const fragment='precision mediump float; varying vec3 n; varying vec3 world; uniform vec3 tint; uniform float glow; void main(){vec3 N=normalize(n);vec3 L=normalize(vec3(-0.7,1.1,1.7));float diffuse=max(dot(N,L),0.0);float rim=pow(1.0-max(dot(N,normalize(vec3(0.0,0.5,6.0)-world)),0.0),3.0);float spec=pow(max(dot(reflect(-L,N),normalize(vec3(0.0,0.5,6.0)-world)),0.0),32.0);vec3 c=tint*(0.35+0.65*diffuse)+vec3(0.3,0.22,0.4)*rim+vec3(0.8)*spec*0.5;c=mix(c,tint,glow);gl_FragColor=vec4(c,1.0);}';
 const program=gl.createProgram(),shaders=[];try{shaders.push(shader(gl.VERTEX_SHADER,vertex),shader(gl.FRAGMENT_SHADER,fragment));for(const s of shaders)gl.attachShader(program,s);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))return null;}catch{gl.getExtension('WEBGL_lose_context')?.loseContext();return null;}
 gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
 const attributes={position:gl.getAttribLocation(program,'position'),normal:gl.getAttribLocation(program,'normal')},uniforms=Object.fromEntries(['model','vp','size','tint','glow'].map(n=>[n,gl.getUniformLocation(program,n)]));
 const meshes=[.26,1,.06].map(radius=>{const data=geometry(radius),buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return {buffer,count:data.length/6};});
 let state='idle',yaw=-.18,drag=null,paused=false,disposed=false,frame,colorHex=agent.color,visual=agent.visual||agent.id;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const drawPart=(root,pos,size,tint,mesh=0,angle=0,glow=0)=>{
  let model=mul(root,translation(...pos));if(angle)model=mul(model,rotation('z',angle));model=mul(model,scale(...size.map(x=>x/2)));
  gl.uniformMatrix4fv(uniforms.model,false,model);gl.uniform3fv(uniforms.size,size.map(x=>x/2));gl.uniform3fv(uniforms.tint,tint);gl.uniform1f(uniforms.glow,glow);
  gl.bindBuffer(gl.ARRAY_BUFFER,meshes[mesh].buffer);gl.enableVertexAttribArray(attributes.position);gl.vertexAttribPointer(attributes.position,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(attributes.normal);gl.vertexAttribPointer(attributes.normal,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,meshes[mesh].count);
 };
 function render(now){
  if(disposed)return;frame=requestAnimationFrame(render);if(document.hidden)return;
  const moving=!paused&&!reduced.matches&&!document.body.classList.contains('motion-paused'),t=moving?now/1000:0;
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
  const vp=mul(perspective(w/h),mul(translation(0,-.1,-6.4),rotation('x',.05)));gl.uniformMatrix4fv(uniforms.vp,false,vp);
  const active=['working','planning','reviewing','checking'].includes(state),thinking=state==='planning',checking=['reviewing','checking'].includes(state),waiting=state==='waiting',bob=moving?Math.sin(t*(thinking?2:checking?3:active?5:1.5))*(active?.075:.025):0;
  const root=mul(translation(0,bob,0),rotation('y',yaw+(moving?Math.sin(t*(thinking?1.3:.65))*(thinking?.14:.04):0))),c=color(colorHex),dark=[.055,.065,.11],light=c.map(x=>Math.min(1,x*.6+.4));
  drawPart(root,[0,-.48,0],[1.02,.7,.78],c);
  drawPart(root,[0,.45,0],[1.58,1.28,.97],c,visual==='scout'?1:0);
  drawPart(root,[0,.47,.49],[1.31,.7,.12],dark);
  const blink=moving&&Math.sin(t*1.1)>.997?.04:.2;
  for(const x of [-.35,.35])drawPart(root,[x,.54,.59],[.14,state==='done'?.09:blink,.1],state==='error'?[1,.25,.3]:checking?[.5,1,.92]:waiting?[1,.82,.4]:light,1,0,.8);
  drawPart(root,[0,.23,.585],[.22,.045,.06],light,0,0,.5);
  for(const x of [-.32,.32]){drawPart(root,[x,-1.02,0],[.23,.48,.25],c,0,active&&moving?Math.sin(t*5+x)*.08:0);drawPart(root,[x,-1.29,.12],[.42,.18,.6],light);}
  for(const sign of [-1,1]){
   const armRoot=mul(root,mul(translation(sign*.75,-.16,0),rotation('z',sign*(waiting?.6:active&&moving?.25+Math.sin(t*(thinking?2:6))*.25:.12))));
   drawPart(armRoot,[0,-.23,0],[.25,.62,.28],c);drawPart(armRoot,[0,-.56,.04],[.32,.27,.36],light,1);
  }
  drawPart(root,[0,-.48,.42],[.48,.17,.08],dark);drawPart(root,[-.12,-.48,.48],[.09,.09,.06],state==='error'?[1,.2,.2]:[.4,1,.7],1,0,1);
  if(visual==='maestro'){drawPart(root,[0,1.22,0],[1.05,.15,.62],[1,.78,.33],2);for(const [x,y] of [[-.43,1.39],[0,1.48],[.43,1.39]])drawPart(root,[x,y,0],[.18,.4,.3],[1,.83,.39],2,x*.5);}
  if(visual==='pixel'){for(const x of [-.34,.34])drawPart(root,[x,1.18,0],[.25,.24,.3],[1,.89,.55]);}
  if(visual==='chevron'){for(const x of [-.62,.62])drawPart(root,[x,.45,.6],[.08,.26,.08],[1,.84,.68],2,-x*.8);}
  if(visual==='scout'){drawPart(root,[0,1.22,0],[.13,.45,.13],[.7,1,.92],2);drawPart(root,[0,1.4,0],[.34,.12,.12],[.7,1,.92],2);}
  if(visual==='revisor'){drawPart(root,[.97,-.55,.25],[.48,.6,.13],[.61,.84,1],0,-.2);drawPart(root,[.97,-.53,.34],[.2,.07,.08],[.16,.28,.5],2,.6);}
 }
 canvas.addEventListener('pointerdown',e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(drag!==null){yaw+=(e.clientX-drag)*.014;drag=e.clientX;}});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();yaw+=e.key==='ArrowLeft'?-.2:.2;}});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.parentElement?.classList.remove('has-webgl');canvas.parentElement?.setAttribute('data-renderer','svg');dispose();});
 function dispose(){disposed=true;cancelAnimationFrame(frame);for(const mesh of meshes)gl.deleteBuffer(mesh.buffer);for(const shader of shaders)gl.deleteShader(shader);gl.deleteProgram(program);}
 frame=requestAnimationFrame(render);
 return {setState(value){state=value;},update(a){colorHex=a.color;visual=a.visual||a.id;},setPaused(value){paused=value;},dispose};
}
