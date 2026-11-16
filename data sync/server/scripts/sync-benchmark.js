// Accuracy benchmark for the synchroniser (in-process queue + store, loopback UDP). Run: npm run bench:sync
// PMU 2 is given a 40 ms clock offset and 150 ppm drift; the report compares the aligned output with the ground truth.
import fs from 'node:fs';
import { MemoryBus } from '../src/mq/memoryBus.js';
import { MemoryStore } from '../src/cache/memoryStore.js';
import { LiveState } from '../src/state.js';
import { loadSectors } from '../src/sectors.js';
import { startPipeline } from '../src/pmu/pipeline.js';
import { buildTruth, startPmu } from './pmu-emulator.js';
const root=new URL('../',import.meta.url).pathname;
const net=JSON.parse(fs.readFileSync(root+'data/network.json'));
const sectors=loadSectors(root+'data/sectors.json');
sectors.pmus.get(1).port=25011; sectors.pmus.get(2).port=25012;
const cfg={sync:{outHz:50,latenessMs:25,stallMs:1000,retainMs:3000,maxBacklogMs:500,tickMs:10}};
const q={log(){},warn(){},error(){}};
const pipe=await startPipeline({cfg,sectors,state:new LiveState(),bus:new MemoryBus(),store:new MemoryStore(),log:q});
const truth=buildTruth(net), t0=performance.timeOrigin+performance.now();
const OFF=40, DR=150;
const emu=[1,2].map(id=>{const s=sectors.sectors.find(x=>x.pmu.id===id),p=s.pmu;return startPmu({port:sectors.pmus.get(id).port,pmuId:id,ids:s.buses,truth,t0,rateHz:p.rateHz,clockOffsetMs:id===2?OFF:0,driftPpm:id===2?DR:0,jitterMs:p.jitterMs,phaseMs:p.phaseMs});});
const frames=[];let last='$';const end=Date.now()+12000;
while(Date.now()<end){for(const e of await pipe.store.xread('frames:aligned',last,100)){last=e.id;frames.push(e.obj);}}
const snap=pipe.snapshot();
emu.forEach(e=>e.stop());await pipe.stop();
const warm=frames.filter(f=>f.k>frames[0].k+150);
const dev=warm.map(f=>f.simTime*1000-(f.T-t0));const med=[...dev].sort((a,b)=>a-b)[dev.length>>1];
const res=dev.map(d=>Math.abs(d-med));
let maxV=0,sumV=0,n=0;
for(const f of warm){const ref=truth(f.simTime,f.rows.map(r=>r.id));const m=new Map(ref.map(r=>[r.id,r]));for(const r of f.rows){const e=Math.abs(r.v[0]-m.get(r.id).v[0])/2401.78;maxV=Math.max(maxV,e);sumV+=e;n++;}}
const quality={};for(const f of frames)quality[f.quality]=(quality[f.quality]||0)+1;
console.log('aligned frames',frames.length,'complete(125 buses)',frames.filter(f=>f.rows.length===125).length,quality);
console.log('residual time error after sync: max',Math.max(...res).toFixed(2),'ms, p95',[...res].sort((a,b)=>a-b)[Math.floor(res.length*.95)].toFixed(2),'ms');
console.log('voltage error vs ground truth: max',maxV.toFixed(5),'pu, mean',(sumV/n).toFixed(6),'pu');
console.log('naive pairing by raw timestamps would mis-align the PMUs by ≈',(OFF).toFixed(0),'ms (+',(DR*1e-6*12000).toFixed(1),'ms drift over 12 s ) plus up to',(0.5*1000/25).toFixed(0),'ms from the different rates');
for(const p of snap.pmus)console.log('PMU',p.id,'rate',p.measuredRateHz.toFixed(1),'Hz clock',JSON.stringify({o:+p.clock.offsetMs.toFixed(2),d:+p.clock.driftPpm.toFixed(1),j:+p.clock.jitterMs.toFixed(2)}),'latency',p.latencyMs.toFixed(1),'late',p.late,'partial',p.partial,'buf',p.bufferDepth);
console.log('skew diag',snap.skewMs?.toFixed(2),'out fps',snap.align.fps.toFixed(1),'outLag',snap.align.outLagMs.toFixed(0),'ms');
// effect of misalignment on values: compare truth at PMU2's raw-paired time (naive) vs true time, using the 2 Hz oscillation
let naive=0;for(let t=2;t<10;t+=0.01){const a=truth(t,[100])[0].v[0],b=truth(t+OFF/1000,[100])[0].v[0];naive=Math.max(naive,Math.abs(a-b)/2401.78);}
console.log('value error caused by a',OFF,'ms mismatch (bus 100, worst case in 8 s):',naive.toFixed(5),'pu; angle error up to',(Math.abs(18*2*Math.PI/10)*OFF/1000+2*2*Math.PI*2*OFF/1000).toFixed(2),'deg');
process.exit(0);
