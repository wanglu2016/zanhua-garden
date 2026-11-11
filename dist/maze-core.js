/* Deterministic maze and puzzle rules; shared by the game and regression checks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GardenRules = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
  function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(a, r) { a = [...a]; for (let i=a.length-1;i>0;i--) { const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function neighbors(maze, id, gateOpen = false) { const x=id%maze.cols,y=Math.floor(id/maze.cols); return DIRS.map(([dx,dy])=>[x+dx,y+dy]).filter(([x,y])=>x>=0&&y>=0&&x<maze.cols&&y<maze.rows).map(([x,y])=>y*maze.cols+x).filter(i=>maze.grid[i]===1 || maze.gates?.some(g=>g.id===i&&(gateOpen||g.open))); }
  function bfs(maze, start, goal, gateOpen = false) {
    const q=[start], prev=new Map([[start,-1]]); let head=0;
    while(head<q.length) { const id=q[head++]; if(id===goal)break; for(const n of neighbors(maze,id,gateOpen))if(!prev.has(n)){prev.set(n,id);q.push(n);} }
    if(goal==null)return {distances:new Map(q.map(id=>{let d=0,p=id;while(prev.get(p)!==-1){p=prev.get(p);d++;}return[id,d];})), prev};
    if(!prev.has(goal))return []; const path=[]; for(let n=goal;n!==-1;n=prev.get(n))path.push(n);return path.reverse();
  }
  function generate(seed) {
    const r=rng(seed), cols=25, rows=19, grid=Array(cols*rows).fill(0), start=cols+1, stack=[start];grid[start]=1;
    while(stack.length){const at=stack[stack.length-1],x=at%cols,y=Math.floor(at/cols); const choices=shuffle(DIRS,r).map(([dx,dy])=>[x+dx*2,y+dy*2,at+dx+dy*cols]).filter(([x,y])=>x>0&&y>0&&x<cols-1&&y<rows-1&&!grid[y*cols+x]);if(!choices.length){stack.pop();continue;}const [nx,ny,mid]=choices[0],n=ny*cols+nx;grid[mid]=grid[n]=1;stack.push(n);}
    const m={seed:seed>>>0,cols,rows,grid,start,gates:[]};
    // Cycles make route choice useful; gated shortcuts never block a required route.
    const separators=shuffle(grid.map((v,i)=>i).filter(i=>{const x=i%cols,y=Math.floor(i/cols);return !grid[i]&&x>0&&x<cols-1&&y>0&&y<rows-1&&((grid[i-1]&&grid[i+1]&&!(grid[i-cols]||grid[i+cols]))||(grid[i-cols]&&grid[i+cols]&&!(grid[i-1]||grid[i+1])));}),r);
    for(const id of separators.slice(0,10))grid[id]=1;
    const ds=bfs(m,start,null).distances;
    m.exit=[...ds].sort((a,b)=>b[1]-a[1])[0][0];
    const rooms=grid.map((v,i)=>i).filter(i=>grid[i]&&i%cols%2===1&&Math.floor(i/cols)%2===1&&i!==start&&i!==m.exit);
    const landmarks=[start,m.exit]; m.shrines=[];
    for(let k=0;k<3;k++){const maps=landmarks.map(id=>bfs(m,id,null).distances);const ranked=rooms.filter(i=>!landmarks.includes(i)).map(i=>[i,Math.min(...maps.map(d=>d.get(i)??0))+r()*3]).sort((a,b)=>b[1]-a[1]);const id=ranked[0][0];landmarks.push(id);m.shrines.push({id,type:k,name:['牡丹亭','听雨轩','流觞阁'][k],seal:['牡丹','玉兰','莲花'][k],solved:false});}
    for(const id of separators.slice(10)){
      if(m.gates.length>=4)break;if(grid[id])continue;const x=id%cols,y=Math.floor(id/cols);let a,b;if(grid[id-1]&&grid[id+1]){a=id-1;b=id+1;}else if(grid[id-cols]&&grid[id+cols]){a=id-cols;b=id+cols;}else continue;
      if(bfs(m,a,b).length>=13)m.gates.push({id,open:false,cost:5,axis:a===id-1?'x':'y'});
    }
    const free=shuffle(rooms.filter(i=>!landmarks.includes(i)),r), used=new Set(landmarks);
    const take=(count,predicate=()=>true)=>{const out=[];for(const id of free)if(!used.has(id)&&predicate(id)){out.push(id);used.add(id);if(out.length===count)break;}return out;};
    m.fortunes=take(4).map(id=>({id,used:false,roll:r()}));
    m.dew=take(32).map(id=>({id,taken:false,amount:r()<.18?4:2}));
    m.traps=take(11,id=>(ds.get(id)||0)>6).map(id=>({id,phase:r()*4.8}));
    m.enemies=take(9,id=>(ds.get(id)||0)>10).map((id,i)=>({id,kind:i%3===0?'gold':'ink'}));
    m.puzzles=[sequencePuzzle(r),lightsPuzzle(r),pipePuzzle(r)];
    return m;
  }
  const FLOWERS=['梅','兰','荷','菊'];
  function permutations(a) { if(a.length===0)return [[]];return a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])); }
  const PERMS=permutations([0,1,2,3]);
  function testClue(p,c) {const a=p.indexOf(c.a),b=p.indexOf(c.b);return c.kind==='before'?a<b:c.kind==='adjacent'?Math.abs(a-b)===1:c.kind==='gap'?Math.abs(a-b)===2:c.kind==='edge'?(a===0||a===3)===c.value:c.kind==='position'?a===c.value:false;}
  function clueText(c){const a=FLOWERS[c.a],b=FLOWERS[c.b];return c.kind==='before'?`${a}在${b}的左边`:c.kind==='adjacent'?`${a}与${b}相邻`:c.kind==='gap'?`${a}与${b}之间恰隔一花`:c.kind==='edge'?`${a}${c.value?'位于两端之一':'不在两端'}`:`${a}位于从左数第${c.value+1}位`;}
  function sequencePuzzle(r){const answer=shuffle([0,1,2,3],r),pool=[];for(let a=0;a<4;a++){pool.push({kind:'edge',a,value:[0,3].includes(answer.indexOf(a))});for(let b=a+1;b<4;b++){pool.push({kind:'before',a,b},{kind:'before',a:b,b:a},{kind:'adjacent',a,b},{kind:'gap',a,b});}}let candidates=[...PERMS], clues=[];const truePool=shuffle(pool.filter(c=>testClue(answer,c)),r);while(candidates.length>1){const next=truePool.filter(c=>!clues.includes(c)).map(c=>({c,remain:candidates.filter(p=>testClue(p,c))})).filter(x=>x.remain.length<candidates.length).sort((a,b)=>a.remain.length-b.remain.length)[0];if(!next)throw Error('sequence generation failed');clues.push(next.c);candidates=next.remain;}return{type:'sequence',answer,clues:shuffle(clues,r),selection:[],mistakes:0};}
  const LIGHT_MASKS=Array.from({length:9},(_,i)=>{let mask=1<<i;const x=i%3,y=Math.floor(i/3);for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<3&&ny<3)mask|=1<<(ny*3+nx);}return mask;});
  function applyLight(state,i){return state^LIGHT_MASKS[i];}
  function lightSolution(state){let best=null;for(let mask=0;mask<512;mask++){let s=state,moves=[];for(let i=0;i<9;i++)if(mask&(1<<i)){s=applyLight(s,i);moves.push(i);}if(s===511&&(!best||moves.length<best.length))best=moves;}return best;}
  function lightsPuzzle(r){let state,solution;do{state=511;for(let i=0;i<9;i++)if(r()<.5)state=applyLight(state,i);solution=lightSolution(state);}while(solution.length<4||solution.length>6);return{type:'lights',state,moves:0};}
  function rotate(mask){return ((mask<<1)&15)|((mask>>3)&1);}
  function pipeReach(masks){const wet=new Set();if(!(masks[3]&8))return{wet,solved:false};const q=[3];wet.add(3);for(let h=0;h<q.length;h++){const i=q[h],x=i%3,y=Math.floor(i/3);for(let d=0;d<4;d++){if(!(masks[i]&(1<<d)))continue;const nx=x+DIRS[d][0],ny=y+DIRS[d][1];if(nx<0||nx>2||ny<0||ny>2)continue;const n=ny*3+nx;if((masks[n]&(1<<((d+2)%4)))&&!wet.has(n)){wet.add(n);q.push(n);}}}return{wet,solved:wet.has(5)&&!!(masks[5]&2)};}
  function pipePuzzle(r){const paths=[[3,0,1,4,7,8,5],[3,6,7,4,1,2,5],[3,4,1,2,5],[3,0,1,2,5],[3,6,7,8,5]],path=paths[Math.floor(r()*paths.length)],answer=Array.from({length:9},()=>r()<.5?5:3);for(let k=0;k<path.length;k++){const i=path[k],prev=k===0?[-1,1]:[path[k-1]%3,Math.floor(path[k-1]/3)],next=k===path.length-1?[3,1]:[path[k+1]%3,Math.floor(path[k+1]/3)],x=i%3,y=Math.floor(i/3);answer[i]=[prev,next].reduce((v,[nx,ny])=>v|(1<<DIRS.findIndex(([dx,dy])=>x+dx===nx&&y+dy===ny)),0);}let masks;do{masks=answer.map(m=>{for(let i=0,n=Math.floor(r()*4);i<n;i++)m=rotate(m);return m;});}while(pipeReach(masks).solved);return{type:'pipes',masks,answer,moves:0};}
  function nearestRoute(m,start){const targets=m.shrines.filter(s=>!s.solved).map(s=>s.id);if(!targets.length)targets.push(m.exit);return targets.map(id=>bfs(m,start,id)).filter(p=>p.length).sort((a,b)=>a.length-b.length)[0]||[];}
  function fortune(roll){return roll<.5?{kind:'time',amount:25,text:'上签 · 春光借你二十五秒。'}:roll<.8?{kind:'dew',amount:10,text:'中签 · 香囊添得十滴花露。'}:{kind:'time',amount:-18,text:'下签 · 迷雾偷走十八秒。'};}
  return{DIRS,FLOWERS,rng,shuffle,generate,bfs,neighbors,sequencePuzzle,testClue,clueText,permutations,applyLight,lightSolution,lightsPuzzle,pipePuzzle,pipeReach,rotate,nearestRoute,fortune};
});
