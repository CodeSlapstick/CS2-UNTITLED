const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve('frontend/package.json'))('@playwright/test');
const out=path.resolve('audit-20261112'),base='http://127.0.0.1:13000';
const result={cases:[],errors:[],networkErrors:[]};
const save=()=>fs.writeFileSync(path.join(out,'browser-followup.json'),JSON.stringify(result,null,2));
(async()=>{
 const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addInitScript(()=>{localStorage.setItem('cs2.lang','en');localStorage.setItem('cs2-untitled-theme','dark');});
 const page=await context.newPage();page.setDefaultTimeout(20000);
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)result.networkErrors.push({url:r.url(),status:r.status()});});
 await page.goto(base+'/login');await page.getByTestId('guest-button').click();await page.getByTestId('matches-page').waitFor();
 const matches=await (await context.request.get(base+'/api/matches')).json();const m=matches[0],demo=encodeURIComponent(m.demo_file),root=base+'/matches/'+demo;
 async function check(name,fn){try{result.cases.push({name,status:'passed',detail:await fn()});}catch(e){result.cases.push({name,status:'failed',error:String(e)});}
  await page.screenshot({path:path.join(out,'followup-'+name+'.png'),fullPage:true}).catch(()=>{});save();}
 await check('replay',async()=>{
  await page.goto(root+'/rounds/1');await page.getByTestId('round-view').waitFor();
  const slider=page.locator('input[type="range"]').first();const before=await slider.inputValue();
  await page.locator('.pb-play').click();await page.waitForTimeout(1200);const after=await slider.inputValue();await page.locator('.pb-play').click();
  if(before===after)throw Error('Time did not advance');
  await page.getByTestId('round-strip').getByRole('link',{name:'2',exact:true}).click();
  await page.waitForURL(url=>url.pathname.endsWith('/rounds/2'));
  return {before,after,url:page.url(),rosterRows:await page.getByTestId('roster-row').count()};
 });
 await check('heatmap-wheel',async()=>{
  await page.goto(root+'/heatmap');await page.getByTestId('heatmap-canvas').waitFor();
  const data=await(await context.request.get(base+`/api/review/${demo}/heatmap`)).json();
  const response=page.waitForResponse(r=>r.url().includes('/heatmap?')&&r.url().includes('event=deaths'));
  await page.getByTestId('hm-ev-deaths').click();const filtered=await(await response).json();
  await page.getByTestId('heatmap-box').hover();await page.mouse.wheel(0,-400);await page.waitForTimeout(300);
  const style=await page.locator('.heat-stage').getAttribute('style');if(!style.includes('1.2'))throw Error('Wheel did not zoom');
  return {initialCount:data.count,deathsCount:filtered.count,style,zoomButtonBlocked:true};
 });
 await check('economy',async()=>{
  await page.goto(root+'/economy');await page.getByTestId('econ-breakdown').waitFor();
  const ct=page.getByTestId('econ-outcomes').getByRole('button',{name:'As CT',exact:true});await ct.click();
  const data=await(await context.request.get(base+`/api/review/${demo}/economy`)).json();
  const expand=page.locator('.eo-row-button').first();await expand.click();
  return {rounds:data.rounds.length,ctSelected:await ct.getAttribute('aria-pressed'),expanded:await expand.getAttribute('aria-expanded')};
 });
 await check('analysis-filters',async()=>{
  await page.goto(base+'/analysis');await page.getByTestId('analysis-page').waitFor();
  const r=page.waitForResponse(r=>r.url().includes('/analysis/deaths?')&&r.url().includes('side=ct'));
  await page.locator('.hm-panel').getByRole('button',{name:'As CT',exact:true}).click();const data=await(await r).json();
  return {side:data.side,deaths:data.deaths,cells:data.cells.length};
 });
 await check('pdf-all-sides',async()=>{
  await page.goto(base+'/coach');await page.locator('.pr-download-grid').waitFor();
  await page.locator('.pr-side-filter select').selectOption('all');
  await page.waitForTimeout(1000);
  const download=page.waitForEvent('download',{timeout:180000});await page.locator('.pr-download-grid article').first().getByRole('button').click();
  const file=await download;const filename=path.join(out,'match_mirage_id9_all.pdf');await file.saveAs(filename);
  return {filename,bytes:fs.statSync(filename).size};
 });
 save();await browser.close();console.log(JSON.stringify(result,null,2));
 if(result.cases.some(x=>x.status==='failed'))process.exitCode=1;
})().catch(e=>{result.fatal=String(e);save();console.error(e);process.exitCode=1;});
