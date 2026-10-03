import {DatabaseSync} from 'node:sqlite';
export function makeEnv(){
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

const call=async(path,body,tok,method='POST',extra={})=>{const r=await handle(new Request('http://x'+path,{method,headers:{'content-type':'application/json',...(tok?{authorization:'Bearer '+tok}:{}),...extra},body:method==='GET'?undefined:JSON.stringify(body)}),env);return r.json()};
const act=(tok,action,payload)=>call('/api/call',{action,payload},tok);

return{db,DB,FILES,store,env:{DB,FILES}};}
