import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {handle,backup} from '../worker/index.js';
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE sheet_rows(sheet TEXT,n INTEGER,data TEXT,PRIMARY KEY(sheet,n)) WITHOUT ROWID;
CREATE TABLE users(username TEXT PRIMARY KEY,name TEXT,role TEXT,status TEXT DEFAULT 'ACTIVE',pw TEXT,must_change INTEGER DEFAULT 0,fails INTEGER DEFAULT 0,locked_until INTEGER DEFAULT 0,created_at TEXT);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,username TEXT,expires INTEGER);
CREATE TABLE settings(k TEXT PRIMARY KEY,v TEXT);`);
const norm=a=>a.map(x=>x===undefined?null:x);
const stmt=sql=>{let args=[];const o={bind(...a){args=a;return o},
 async first(){return db.prepare(sql).get(...norm(args))??null},
 async all(){return{results:db.prepare(sql).all(...norm(args))}},
 async run(){db.prepare(sql).run(...norm(args));return{}},_run(){db.prepare(sql).run(...norm(args))},_all(){return{results:db.prepare(sql).all(...norm(args))}}};return o};
const DB={prepare:stmt,async batch(list){db.exec('BEGIN');try{const r=list.map(s=>s._all());db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}}};
const store=new Map();
const FILES={async put(k,v){const b=v&&v.getReader?Buffer.from(await new Response(v).arrayBuffer()):v;store.set(k,b)},async get(k){return store.has(k)?{body:store.get(k),httpMetadata:{}}:null},async list({prefix=''}={}){return{objects:[...store.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}},async delete(k){store.delete(k)}};
const env={DB,FILES};
const call=async(path,body,tok,method='POST',extra={})=>{const r=await handle(new Request('http://x'+path,{method,headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{}),...extra},body:method==='GET'?undefined:JSON.stringify(body)}),env);return r.json()};
const act=(tok,action,payload)=>call('/api/call',{action,payload},tok);
// seed admin via temp: insert using createUser needs admin; seed manually with known hash by using resetPassword path impossible -> insert hash through module? use sync of hashing: login after direct insert
import {webcrypto} from 'node:crypto';
const enc=new TextEncoder();
async function hash(pw){const salt=webcrypto.getRandomValues(new Uint8Array(16));const k=await webcrypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);const h=new Uint8Array(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},k,256));return 'pbkdf2$100000$'+Buffer.from(salt).toString('base64')+'$'+Buffer.from(h).toString('base64')}
db.prepare("INSERT INTO users(username,name,role,pw,must_change) VALUES('admin','Admin','ADMIN',?,0)").run(await hash('Pass1234'));
db.prepare("INSERT INTO settings VALUES('sync_key','k123456789')").run();
let t=0;const ok=(n)=>console.log('ok',++t,n);
// login
assert.equal((await call('/api/login',{username:'admin',password:'bad'})).ok,false);
const L=await call('/api/login',{username:'admin',password:'Pass1234'});assert.ok(L.token);const A=L.token;ok('login');
assert.equal((await act('nope','whoami')).ok,false);ok('auth required');
// sync import
const H=['MealSessionID','Date','Meal','Note'];
const imp=(b)=>call('/api/sync/import',b,null,'POST',{'x-sync-key':'k123456789'});
assert.equal((await call('/api/sync/import',{sheet:'MealSessions',rows:[H]})).ok,false);
assert.equal((await imp({sheet:'MealSessions',reset:true,rows:[H,['M1','2026-10-01','Trưa','']]})).rows,2);
assert.equal((await imp({sheet:'FoodStep1',reset:true,rows:[['MealSessionID','FoodName','X']]})).ok,true);ok('sync import');
let r=await act(A,'readRanges',{ranges:['MealSessions!A1:D500']});assert.deepEqual(r.values[0],[H,['M1','2026-10-01','Trưa']]);ok('read trims trailing blanks');
r=await act(A,'appendRows',{range:'MealSessions!A:D',rows:[['M2','2026-10-02','Sáng'],['M3','2026-10-03','Chiều','n']]});assert.equal(r.updatedRows,2);
r=await act(A,'readRanges',{ranges:['MealSessions!A2:A10','MealSessions!B3:C3']});assert.deepEqual(r.values[0].map(x=>x[0]),['M1','M2','M3']);assert.deepEqual(r.values[1],[['2026-10-02','Sáng']]);ok('append+range');
assert.equal((await act(A,'appendRows',{range:'FoodStep1!A:C',rows:[['M1','','']]})).ok,false);ok('validation');
assert.equal((await act(A,'appendRows',{range:'Nope!A:C',rows:[['a']]})).ok,false);
r=await act(A,'updateRange',{range:'MealSessions!D3',rows:[['ghi chú']]});assert.equal(r.updatedRows,1);
r=await act(A,'readRanges',{ranges:['MealSessions!A3:D3']});assert.equal(r.values[0][0][3],'ghi chú');ok('update');
assert.equal((await act(A,'updateRange',{range:'MealSessions!A1',rows:[['x']]})).ok,false);ok('header protected');
// users
r=await act(A,'createUser',{username:'hao',name:'Hảo',role:'NVYT'});assert.ok(r.tempPassword);
const H2=await call('/api/login',{username:'hao',password:r.tempPassword});assert.ok(H2.token&&H2.user.mustChange);
assert.equal((await act(H2.token,'readRanges',{ranges:['MealSessions!A1:D5']})).ok,false);ok('must change pw gate');
assert.equal((await act(H2.token,'changePassword',{oldPassword:r.tempPassword,newPassword:'abc'})).ok,false);
assert.equal((await act(H2.token,'changePassword',{oldPassword:r.tempPassword,newPassword:'Newpass99'})).ok,true);
assert.equal((await act(H2.token,'readRanges',{ranges:['MealSessions!A1:D5']})).ok,true);
assert.equal((await act(H2.token,'readRanges',{ranges:['Users!A:G']})).ok,false);ok('role limits');
assert.equal((await act(H2.token,'createUser',{username:'zz1',role:'ADMIN'})).ok,false);
r=await act(A,'readRanges',{ranges:['Users!A:G']});assert.equal(r.values[0].length,3);
assert.equal((await act(A,'setUser',{username:'admin',status:'DISABLED'})).ok,false);ok('last admin kept');
await act(A,'setUser',{username:'hao',status:'DISABLED'});assert.equal((await call('/api/login',{username:'hao',password:'Newpass99'})).ok,false);ok('disable');
// lockout
for(let i=0;i<5;i++)await call('/api/login',{username:'admin',password:'bad'});
const lk=await call('/api/login',{username:'admin',password:'Pass1234'});assert.equal(lk.ok,false);assert.match(lk.error,/khóa/);ok('lockout');
db.prepare("UPDATE users SET locked_until=0,fails=0 WHERE username='admin'").run();
// upload
const fd=new FormData();fd.append('file',new File([new Uint8Array([1,2,3])],'a b.png',{type:'image/png'}));
let u=await (await handle(new Request('http://x/api/upload',{method:'POST',headers:{authorization:'Bearer '+A},body:fd}),env)).json();assert.ok(u.id,JSON.stringify(u));
const fr=await handle(new Request('http://x/api/file?id='+encodeURIComponent(u.id),{headers:{authorization:'Bearer '+A}}),env);assert.equal(fr.status,200);ok('upload/file');
const fd2=new FormData();fd2.append('file',new File(['x'],'a.exe',{type:'application/x-msdownload'}));
assert.equal((await (await handle(new Request('http://x/api/upload',{method:'POST',headers:{authorization:'Bearer '+A},body:fd2}),env)).json()).ok,false);
// backup/export/health
await backup(env);assert.ok([...store.keys()].some(k=>k.startsWith('backup/')));
const ex=await call('/api/sync/export',null,null,'GET',{'x-sync-key':'k123456789'});assert.equal(ex.sheets.MealSessions.length,4);ok('backup/export');
const hl=await act(A,'health',{});assert.equal(hl.ok,true);console.log(hl.checks.filter(c=>!c.ok).map(c=>c.check).join(', '));
console.log('ALL PASS');
