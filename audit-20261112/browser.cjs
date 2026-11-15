const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const req = createRequire(path.resolve('frontend/package.json'));
const { chromium } = req('@playwright/test');
const out = path.resolve('audit-20261112');
const results = { cases: [], errors: [], console: [], networkErrors: [], api: [] };
const save = () => fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(results,null,2));
(async()=>{
 const browser = await chromium.launch({headless:true});
 const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addInitScript(()=>{localStorage.setItem('cs2.lang','en');localStorage.setItem('cs2-untitled-theme','dark');});
 const page = await context.newPage();
 page.setDefaultTimeout(20000);
 page.on('pageerror',e=>{results.errors.push({url:page.url(),error:e.message});save();});
 page.on('console',m=>{if(m.type()==='error')results.console.push({url:page.url(),text:m.text()});});
 page.on('response',r=>{if(r.status()>=400)results.networkErrors.push({url:r.url(),status:r.status()});});
 page.on('requestfailed',r=>results.networkErrors.push({url:r.url(),failure:r.failure()}));
 async function check(name,fn){
   try { const detail=await fn();results.cases.push({name,status:'passed',detail}); }
   catch(e){results.cases.push({name,status:'failed',error:String(e)});}
   await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true}).catch(()=>{});save();
 }
 await check('guest',async()=>{
   await page.goto('http://127.0.0.1:13000/login');
   await page.getByTestId('guest-button').click();
   await page.getByTestId('matches-page').waitFor();
   const r=await context.request.get('http://127.0.0.1:13000/api/matches');
   results.matches=await r.json();return results.matches;
 });
 const match=results.matches?.[0];
 if(!match)throw Error('No guest match');
 const demo=encodeURIComponent(match.demo_file), root=`http://127.0.0.1:13000/matches/${demo}`;
 async function api(url){const r=await context.request.get('http://127.0.0.1:13000'+url);const body=await r.json();
  const name=`response-${results.api.length}.json`;fs.writeFileSync(path.join(out,name),JSON.stringify(body,null,2));
  results.api.push({url,status:r.status(),file:name});save();return body;}
 await check('replay',async()=>{
   await page.goto(`${root}/rounds/1`); await page.getByTestId('round-view').waitFor();
   const positions=await api(`/api/review/${demo}/rounds/1/positions`);
   const slider=page.locator('input[type="range"]').first();
   const before=await slider.inputValue();await page.locator('.pb-play').click();
   await page.waitForTimeout(1200);const after=await slider.inputValue();await page.locator('.pb-play').click();
   if(before===after)throw Error('Replay time did not advance');
   await page.getByTestId('round-strip').getByRole('link',{name:'2',exact:true}).click();
   await page.waitForURL('**/rounds/2');
   return {before,after,positionsKeys:Object.keys(positions),rosterRows:await page.getByTestId('roster-row').count(),rounds:[1,2]};
 });
 await check('heatmap',async()=>{
   await page.goto(`${root}/heatmap`);await page.getByTestId('heatmap-canvas').waitFor();
   const initial=await api(`/api/review/${demo}/heatmap`);
   await page.getByTestId('hm-ev-deaths').click();
   await page.waitForURL('**/*ev=deaths*');
   await page.locator('.map-zoom button').first().click();
   return {count:initial.count,zoom:await page.locator('.heat-stage').getAttribute('style'),filtered:await api(`/api/review/${demo}/heatmap?event=deaths&rounds=1`)};
 });
 await check('economy',async()=>{
   await page.goto(`${root}/economy`);await page.getByTestId('econ-breakdown').waitFor();
   const data=await api(`/api/review/${demo}/economy`);
   await page.getByTestId('econ-outcomes').getByRole('button',{name:'CT',exact:true}).click();
   return {rounds:data.rounds?.length,keys:Object.keys(data),ctSelected:await page.getByTestId('econ-outcomes').getByRole('button',{name:'CT',exact:true}).getAttribute('aria-pressed')};
 });
 await check('analysis',async()=>{
   await page.goto('http://127.0.0.1:13000/analysis');await page.getByTestId('analysis-page').waitFor();
   await page.waitForTimeout(1500);
   const data=await api(`/api/analysis/deaths?demo=${demo}&scope=upload&map=${match.map_name}`);
   const ct=page.locator('.an-filters').getByRole('button',{name:'CT',exact:true});
   if(await ct.count())await ct.click();
   return {keys:Object.keys(data),body:(await page.locator('main').innerText()).slice(0,5000)};
 });
 await check('opening',async()=>{
   await page.goto('http://127.0.0.1:13000/analysis?tool=opening-route');
   await page.locator('.opening-play-button').waitFor();
   const catalog=await api('/api/opening-route/catalog');
   const initial=await page.locator('.opening-clock').innerText();
   await page.locator('.opening-play-button').click();await page.waitForTimeout(1200);
   const after=await page.locator('.opening-clock').innerText();await page.locator('.opening-play-button').click();
   if(initial===after)throw Error('Opening playback time did not advance');
   return {catalogRows:catalog.length,initial,after,markers:await page.getByTestId('opening-live-marker').count()};
 });
 await check('coach',async()=>{
   await page.goto('http://127.0.0.1:13000/coach');await page.waitForTimeout(2000);
   return {body:(await page.locator('main').innerText()).slice(0,6000),response:await api(`/api/coach/${demo}`)};
 });
 await check('pdf-export',async()=>{
   await page.goto('http://127.0.0.1:13000/coach');
   const download=page.waitForEvent('download',{timeout:180000});
   await page.locator('.pr-download-grid article').first().getByRole('button').click();
   const file=await download;const filename=path.join(out,file.suggestedFilename());await file.saveAs(filename);
   results.pdf=filename;return {filename,bytes:fs.statSync(filename).size,header:fs.readFileSync(filename).subarray(0,8).toString()};
 });
 save();await browser.close();
 console.log(JSON.stringify({cases:results.cases.map(x=>({name:x.name,status:x.status,error:x.error})),errors:results.errors,networkErrors:results.networkErrors,pdf:results.pdf},null,2));
})().catch(e=>{results.fatal=String(e);save();console.error(e);process.exitCode=1;});
