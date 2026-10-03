const {chromium}=require('/opt/npm-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}).catch(()=>chromium.launch());
 const p=await b.newPage({viewport:{width:1280,height:900}});
 const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
 p.on('dialog',d=>d.accept(d.type()==='prompt'?(d.defaultValue()||'Bữa trưa'):undefined));
 await p.goto('http://localhost:8787/');
 await p.fill('#lgUser','admin');await p.fill('#lgPass','wrong');await p.click('#lgBtn');
 await p.waitForSelector('.notice.red');console.log('1 wrong pw ->',(await p.textContent('.notice.red')).trim());
 await p.fill('#lgUser','admin');await p.fill('#lgPass','Temp12345');await p.click('#lgBtn');
 await p.waitForSelector('#pwModal.open');console.log('2 forced change modal');
 await p.fill('#pwOld','Temp12345');await p.fill('#pwNew','Matkhau2026');await p.fill('#pwNew2','Matkhau2026');await p.click('#pwModal .btn.primary');
 await p.waitForSelector('#pwModal:not(.open)',{state:'attached'});await p.waitForTimeout(800);
 console.log('3 acct:',(await p.textContent('#acct')).trim());
 await p.click('button[aria-label="Bếp & kho"]');await p.waitForTimeout(800);
 console.log('4 rail:',(await p.$$eval('.rail-btn',e=>e.map(x=>x.textContent.trim()))).join(' | '));
 // new meal
 await p.click('text=+ Bữa ăn');await p.waitForTimeout(1200);
 console.log('5 meal sessions text has Bữa trưa:',(await p.textContent('#main')).includes('Bữa trưa'));
 // add student via admin? students page
 await p.click('button[aria-label="Học sinh"]');await p.waitForTimeout(500);
 await p.click('text=+ Học sinh');await p.fill('#nsName','Nguyễn Văn A');await p.fill('#nsClass','Lá 1');await p.click('text=Tạo hồ sơ');await p.waitForTimeout(1200);
 console.log('6 student listed:',(await p.textContent('#main')).includes('Nguyễn Văn A'));
 // upload doc
 await p.click('button[aria-label="Chứng từ"]');await p.waitForTimeout(500);
 await p.click('text=+ Tải file');
 require('fs').writeFileSync('/tmp/claude-0/t.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64'));
 await p.setInputFiles('#docFile','/tmp/claude-0/t.png');await p.fill('#docType','Hóa đơn');await p.click('#recordBody button[onclick="saveDoc()"]');await p.waitForTimeout(1500);
 console.log('7 doc link:',await p.$$eval('a[href^="/api/file"]',e=>e.length));
 // admin
 await p.click('button[aria-label="Quản trị"]');await p.waitForTimeout(800);
 await p.click('text=+ Tài khoản');await p.fill('#nuUser','lan');await p.fill('#nuName','Lan');await p.click('text=Tạo tài khoản >> nth=-1');await p.waitForTimeout(1200);
 console.log('8 temp pw shown:',(await p.textContent('#recordBody')).includes('Mật khẩu tạm'));
 await p.click('text=Đã ghi lại');await p.waitForTimeout(600);
 await p.click('text=Kiểm tra ngay');await p.waitForTimeout(1000);console.log('9 health:',(await p.textContent('#healthBox')).slice(0,80));
 await p.screenshot({path:'/tmp/claude-0/admin.png'});
 // reload keeps session
 await p.reload();await p.waitForTimeout(1200);console.log('10 after reload acct:',(await p.textContent('#acct')).trim());
 await p.click('#logoutBtn');await p.waitForSelector('#lgUser');console.log('11 logged out');
 console.log('ERRORS:',errs.length?errs:'none');
 await b.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
