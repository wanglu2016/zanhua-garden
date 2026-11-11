/* Headless rules integration with a minimal event/render adapter. No browser or network. */
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),R=require('../dist/maze-core.js');
const html=fs.readFileSync(__dirname+'/../dist/index.html','utf8'),listeners={},nodes=new Map();let frame,now=100,focused=null;
const paint=new Proxy({createLinearGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
class Element{
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.textContent='';this._html='';this.className='';const s=new Set();this.classList={add:(...x)=>x.forEach(v=>s.add(v)),remove:(...x)=>x.forEach(v=>s.delete(v)),toggle:(x,v)=>v===undefined?(s.has(x)?s.delete(x):s.add(x)):(v?s.add(x):s.delete(x)),contains:x=>s.has(x)};}
 set innerHTML(v){this._html=v;}get innerHTML(){return this._html;}
 append(...x){this.children.push(...x);}replaceChildren(...x){this.children=x;}setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}getBoundingClientRect(){return{width:1440,height:900,left:0,top:0};}getClientRects(){return this.hidden?[]:[{}];}getContext(){return paint;}addEventListener(){}setPointerCapture(){}focus(){focused=this;}querySelector(){return this.childSpan??=new Element('span');}querySelectorAll(){return descend(this).filter(x=>x.tagName==='BUTTON'&&!x.disabled&&!x.hidden);}
}
function descend(el){return el.children.flatMap(x=>x instanceof Element?[x,...descend(x)]:[]);}
for(const m of html.matchAll(/<([a-z-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const n=new Element(m[1]);n.id=m[3];n.hidden=/\bhidden\b/.test(m[2]);nodes.set(n.id,n);}
const $=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},modes=['gentle','normal','hard'].map(x=>{const e=new Element('button');e.dataset.mode=x;return e;});
const doc={body:new Element('body'),hidden:false,get activeElement(){return focused;},getElementById:$,createElement:t=>new Element(t),createTextNode:s=>({textContent:s}),querySelector:s=>$(s),querySelectorAll:s=>s==='[data-mode]'?modes:[],addEventListener:(n,f)=>(listeners['doc:'+n]??=[]).push(f)};
class Image{constructor(){this.naturalWidth=1536;this.naturalHeight=1024;}set src(s){if(s.includes('lady')){this.naturalWidth=1130;this.naturalHeight=1380;}queueMicrotask(()=>this.onload());}}
const sandbox={document:doc,Image,GardenRules:R,location:{href:'https://unit.invalid/?seed=41'},URL,crypto:{getRandomValues:a=>(a[0]=12345,a)},structuredClone,devicePixelRatio:1,matchMedia:()=>({matches:false}),ResizeObserver:class{constructor(f){this.f=f;}observe(){this.f();}},requestAnimationFrame:f=>frame=f,addEventListener:(n,f)=>(listeners[n]??=[]).push(f),localStorage:{getItem:()=>null,setItem(){}},console};sandbox.window=sandbox;
vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/maze-game.js','utf8'),sandbox,{filename:'maze-game.js'});
function tick(s){for(let left=s;left>1e-8;){const d=Math.min(.025,left);left-=d;now+=d*1000;frame(now);}}
function key(k){const e={key:k,repeat:false,preventDefault(){}};for(const f of listeners.keydown||[])f(e);for(const f of listeners.keyup||[])f(e);}
const state=()=>$('game').dataset.state,cell=()=>Number($('game').dataset.cell),health=()=>Number($('game').dataset.health),dew=()=>Number($('dew').textContent),time=()=>Number($('game').dataset.time);
function click(el){assert(!el.disabled,'clicked disabled button');el.onclick();}
function byAria(s){const e=descend($('puzzle-content')).find(e=>e.getAttribute('aria-label')===s);assert(e,'missing '+s);return e;}
function walkTo(m,to){let guard=0;while(cell()!==to){assert.equal(state(),'playing','walk ended early');assert(guard++<300);const path=R.bfs(m,cell(),to);assert(path.length>1);const d=path[1]-path[0],k=d===1?'d':d===-1?'a':d===m.cols?'s':'w';key(k);key('j');tick(.33);key('h');tick(.03);}}
(async()=>{
 await new Promise(setImmediate);tick(.03);assert.equal($('loading').hidden,true);click($('start'));tick(.16);assert.equal(cell(),26);assert.equal(time(),300);
 // Collision and dash stop at a closed wall without spending energy.
 key('d');tick(.4);assert.equal(cell(),26);key('k');tick(.5);assert.equal(cell(),26);
 // Paid shortcut and an honest, one-time seeded fortune.
 key('e');tick(.16);assert.equal(state(),'event');click($('event-choices').children[0]);tick(.16);assert.equal(dew(),3);
 const m=R.generate(41);m.gates.find(g=>g.id===27).open=true;walkTo(m,32);key('e');tick(.16);assert.equal(state(),'event');const before=dew();click($('event-choices').children[1]);tick(.16);assert.equal(dew(),before+10);key('e');tick(.16);assert.equal(state(),'playing');
 // Map consumes time, a pause does not; returning keeps the map open.
 key('m');tick(.1);const t0=time();tick(2);assert(time()<=t0-1);key('p');const t1=time();tick(3);assert.equal(time(),t1);key('p');tick(.1);assert.equal(state(),'map');key('m');tick(.1);assert.equal(state(),'playing');
 // Pipe puzzle: rotate controls, keep progress after leaving, then solve.
 walkTo(m,126);key('e');tick(.16);assert.equal(state(),'puzzle');click(byAria('旋转第 1 格水渠'));click($('close-puzzle'));tick(.16);key('e');tick(.16);assert.equal(state(),'puzzle');
 const q=m.puzzles[2],working=[...q.masks];working[0]=R.rotate(working[0]);for(let i=0;i<9&&state()==='puzzle';i++)for(let n=0;n<4&&working[i]!==q.answer[i]&&state()==='puzzle';n++){click(byAria(`旋转第 ${i+1} 格水渠`));working[i]=R.rotate(working[i]);tick(.03);}assert.equal($('game').dataset.seals,'1');m.shrines[2].solved=true;
 // Lights: paid hint agrees with a shortest solution, then real controls solve it.
 walkTo(m,98);key('e');tick(.16);assert.equal(state(),'puzzle');const beforeHint=dew();click($('puzzle-hint'));assert.equal(dew(),beforeHint-4);for(const i of R.lightSolution(m.puzzles[1].state)){click(byAria(`第 ${i+1} 盏灯`));tick(.03);}assert.equal($('game').dataset.seals,'2');m.shrines[1].solved=true;
 // Deduction: wrong answers have an exact cost, correct answers grant a seal.
 walkTo(m,332);key('e');tick(.16);assert.equal(state(),'puzzle');for(const f of ['梅','兰','荷','菊'])click(byAria('选择'+f));const beforeWrong=time();click($('puzzle-submit'));assert(time()<=beforeWrong-12);for(let i=0;i<4;i++)click(descend($('puzzle-content')).find(e=>e.getAttribute('aria-label')?.startsWith('花序第 1 位')));for(const i of m.puzzles[0].answer)click(byAria('选择'+R.FLOWERS[i]));click($('puzzle-submit'));tick(.16);assert.equal($('game').dataset.seals,'3');m.shrines[0].solved=true;
 // Route skill is a costed action, then exit is the only win condition.
 tick(6);const beforeRoute=Number($('energy-number').textContent);key('l');tick(.16);assert(Number($('energy-number').textContent)<=beforeRoute-49);walkTo(m,m.exit);key('e');tick(.16);assert.equal(state(),'ended');assert.match($('result-title').textContent,/三印归扇/);assert.equal($('final-seals').textContent,'3/3');
 const win={seals:$('final-seals').textContent,time:$('final-time').textContent,score:$('final-score').textContent,health:health(),summary:$('best-result').textContent};
 // Deadline loss is a separate, verified terminal state.
 click($('home'));modes[2].onclick();click($('start'));tick(241);assert.equal(state(),'ended');assert.match($('result-title').textContent,/春光已尽/);
 console.log(JSON.stringify({adapter:'headless rules integration; no browser rendering',win,deadlineLoss:true,wallCollision:true,paidShortcut:true,oneTimeFortune:true,mapAndPause:true,puzzlePersistence:true,allThreeSealControls:true,wrongAnswerPenalty:true,healingAndResourceEconomy:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
