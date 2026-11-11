/* Media lifecycle tests using a local adapter, with no browser or network. */
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../dist/index.html','utf8');
for(const name of ['flower-dream.ogg','flower-dream.mp3'])assert(fs.existsSync(__dirname+'/../dist/assets/'+name));
assert(html.includes('music.js')&&html.includes('music-volume'));
const handlers={},saved=new Map(),queue=new Map();let next=1,now=0;
const media={volume:1,paused:true,loop:false,dataset:{},playCount:0,play(){this.paused=false;this.playCount++;handlers.playing?.();return Promise.resolve();},pause(){this.paused=true;},addEventListener(n,f){handlers[n]=f;}};
const slider={value:'55',setAttribute(){},addEventListener(n,f){handlers['slider:'+n]=f;}},output={textContent:''};
const doc={hidden:false,getElementById:id=>id==='bgm'?media:id==='music-volume'?slider:output,addEventListener(n,f){handlers[n]=f;}};
const context={document:doc,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},performance:{now:()=>now},requestAnimationFrame:f=>{const id=next++;queue.set(id,f);return id;},cancelAnimationFrame:id=>queue.delete(id),window:{}};
vm.runInNewContext(fs.readFileSync(__dirname+'/../dist/music.js','utf8'),context);
function tick(ms=350){for(let i=0;i<ms;i+=20){now+=20;const callbacks=[...queue.values()];queue.clear();callbacks.forEach(f=>f(now));}}
const music=context.window.GardenMusic;assert(music.enabled);assert(media.paused,'must not autoplay before a gesture');assert.equal(media.volume,0);
music.setState('playing');music.start();tick();assert(!media.paused);assert.equal(media.volume,.55);assert.equal(media.dataset.playback,'playing');assert(media.loop);
music.setState('paused');tick();assert.equal(media.volume,.55*.25);
slider.value='30';handlers['slider:input']();tick();assert.equal(media.volume,.3*.25);assert.equal(output.textContent,'30%');
music.setEnabled(false);slider.value='30';handlers['slider:input']();music.setState('help');tick();assert(media.paused);assert.equal(media.volume,0);assert.equal(saved.get('zanhua-sound'),'off');
music.setEnabled(true);music.setState('playing');tick();assert(!media.paused);assert.equal(media.volume,.3);
doc.hidden=true;handlers.visibilitychange();assert(media.paused);doc.hidden=false;handlers.visibilitychange();tick();assert(!media.paused);
console.log('Music: gesture start, loop, volume, pause fade, mute, preference and hidden-tab lifecycle passed.');
