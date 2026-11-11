const assert=require('node:assert/strict');
const R=require('../dist/maze-core.js');
let minRoute=Infinity,maxRoute=0,totalRoute=0,gateCount=0;
for(let seed=1;seed<=180;seed++){
  const m=R.generate(seed),all=R.bfs(m,m.start,null).distances;
  assert.equal(all.size,m.grid.filter(Boolean).length,`disconnected floor ${seed}`);
  assert.equal(new Set([m.start,m.exit,...m.shrines.map(x=>x.id)]).size,5);
  for(const obj of [...m.shrines,...m.fortunes,...m.dew,...m.traps,...m.enemies])assert(all.has(obj.id),`unreachable object ${seed}`);
  assert(R.bfs(m,m.start,m.exit).length>1);
  const orders=R.permutations(m.shrines.map(x=>x.id));
  const cost=Math.min(...orders.map(order=>{const ids=[m.start,...order,m.exit];return ids.slice(1).reduce((sum,id,i)=>sum+R.bfs(m,ids[i],id).length-1,0);}));
  minRoute=Math.min(minRoute,cost);maxRoute=Math.max(maxRoute,cost);totalRoute+=cost;
  for(const g of m.gates){assert.equal(m.grid[g.id],0);g.open=true;assert(R.neighbors(m,g.id).length>=2);assert(R.bfs(m,m.start,g.id).length>0);gateCount++;}
  const [sequence,lights,pipes]=m.puzzles;
  const solutions=R.permutations([0,1,2,3]).filter(p=>sequence.clues.every(c=>R.testClue(p,c)));
  assert.equal(solutions.length,1);assert.deepEqual(solutions[0],sequence.answer);
  assert.equal(lights.state===511,false);const sol=R.lightSolution(lights.state);assert(sol.length>=4&&sol.length<=6);assert.equal(sol.reduce((s,i)=>R.applyLight(s,i),lights.state),511);
  assert.equal(R.pipeReach(pipes.masks).solved,false);assert(R.pipeReach(pipes.answer).solved);
  const masks=pipes.masks.map((m,i)=>{for(let n=0;n<4&&m!==pipes.answer[i];n++)m=R.rotate(m);return m;});assert(R.pipeReach(masks).solved);
  assert(R.nearestRoute(m,m.start).length>0);m.shrines.forEach(s=>s.solved=true);assert.equal(R.nearestRoute(m,m.start).at(-1),m.exit);
}
assert.deepEqual(R.generate(12345),R.generate(12345));
assert.equal(R.fortune(.2).amount,25);assert.equal(R.fortune(.6).amount,10);assert.equal(R.fortune(.9).amount,-18);
console.log(JSON.stringify({seeds:180,allRequiredLocationsReachable:true,puzzlesUniquelySolvable:true,solvableLightsAndPipes:true,gates:gateCount,minimumWinningRoute:{min:minRoute,max:maxRoute,mean:Math.round(totalRoute/180)},walkingSecondsAtPoint29:Math.round(totalRoute/180*.29)}));
