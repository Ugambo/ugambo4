const { chromium } = require('playwright'); const fs=require('fs');
const pass = fs.readFileSync(process.argv[2],'utf8').match(/Password: (\S+)/)[1];
(async()=>{ const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1280,height:900}}); const p=await c.newPage();
await p.goto('http://localhost:8888/wp-login.php'); await p.fill('#user_login','explorekatsina_admin'); await p.fill('#user_pass',pass); await Promise.all([p.waitForNavigation(),p.click('#wp-submit')]);
await p.goto('http://localhost:8888/wp-admin/admin.php?page=ai1wm_export'); await p.waitForTimeout(3000);
await p.getByText('Advanced options').first().click(); await p.waitForTimeout(600);
for (const n of ['options[no_spam_comments]','options[no_post_revisions]','options[no_muplugins]']) { await p.locator(`input[name="${n}"]`).check({force:true}); }
await p.evaluate(()=>{ const f=document.querySelector('#ai1wm-export-form'); const i=document.createElement('input'); i.type='hidden'; i.name='options[compression_type]'; i.value='gzip'; f.appendChild(i); });
await p.getByText('Export site to', { exact: false }).first().click(); await p.waitForTimeout(800);
await p.locator('#ai1wm-export-file').click();
const t0=Date.now(); let href=null;
while (Date.now()-t0 < 40*60*1000) { href = await p.locator('a[href*=".wpress"]').first().getAttribute('href').catch(()=>null); if (href) break; await p.waitForTimeout(3000); }
console.log('EXPORTED', !!href);
await b.close(); })();
