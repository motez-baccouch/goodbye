import { chromium } from 'playwright-core'
const b=await chromium.launch({channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await b.newPage({viewport:{width:844,height:390}})
const errs=[];p.on('pageerror',e=>errs.push(String(e)))
await p.goto('http://localhost:5199/',{waitUntil:'load'})
await p.waitForTimeout(2800)
await p.getByRole('button',{name:'Start'}).click();await p.waitForTimeout(1200)
// spawn: gate should be CLOSED and sealing the front (do not open)
await p.screenshot({path:'c:/Users/motez/Desktop/work/goodbye/_gateclosed.png'})
// now open + go south to see the Eiffel near the arch
await p.locator('.interact-button').click().catch(()=>{});await p.waitForTimeout(500)
const pos=()=>p.evaluate(()=>window.__gardenPos||{x:0,z:0})
async function tap(keys,ms){for(const k of keys)await p.keyboard.down(k);await p.waitForTimeout(ms);for(const k of keys)await p.keyboard.up(k);await p.waitForTimeout(60)}
async function goTo(tx,tz,tol=0.7,max=80){for(let i=0;i<max;i++){const{x,z}=await pos();const dx=tx-x,dz=tz-z;if(Math.hypot(dx,dz)<tol)return true;const k=[];if(dz<-tol)k.push('ArrowUp');else if(dz>tol)k.push('ArrowDown');if(dx>tol)k.push('d');else if(dx<-tol)k.push('a');if(!k.length)return true;await tap(k,170)}return false}
await goTo(-14,-2);await goTo(-14,-33);await goTo(-3,-39,1.2)
// look south-west toward the Eiffel
const box=await p.locator('.look-surface').boundingBox()
await p.mouse.move(box.x+500,box.y+195);await p.mouse.down();await p.mouse.move(box.x+300,box.y+175,{steps:10});await p.mouse.up()
await p.waitForTimeout(400);await p.screenshot({path:'c:/Users/motez/Desktop/work/goodbye/_eiffel.png'})
console.log('errors:',errs.length)
await b.close();console.log('DONE')
