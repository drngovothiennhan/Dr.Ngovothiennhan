import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {webcrypto} from 'node:crypto';
import {makeEnv} from './shim.mjs';import {handle} from '../worker/index.js';
const {db,env}=makeEnv();
const enc=new TextEncoder();
async function hash(pw){const salt=webcrypto.getRandomValues(new Uint8Array(16));const k=await webcrypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);const h=new Uint8Array(await webcrypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},k,256));return 'pbkdf2$100000$'+Buffer.from(salt).toString('base64')+'$'+Buffer.from(h).toString('base64')}
db.prepare("INSERT INTO users(username,name,role,pw,must_change) VALUES('admin','Admin','ADMIN',?,1)").run(await hash('Temp12345'));
const H={
 Students:'StudentID,FullName,DOB,Gender,Class,GuardianName,GuardianPhone,BHYT,NationalID,Address,HealthNotes,Status,Source,UpdatedAt',
 Enrollments:'EnrollmentID,StudentID,SchoolYearID,ClassID,ClassNameSnapshot,Status,StartDate,EndDate,Source,UpdatedAt',
 MealSessions:'MealSessionID,Date,Meal,A,B,C,D,E,Status,CreatedAt,Servings,CreatedBy,F,G',
 FoodSampleLog:'SampleID,MealSessionID,SampleName,Meal,Servings,Amount,Unit,Container,TempC,CollectedAt,DestroyAt,Note,CollectedBy,DestroyedBy,Sealed,Min24h,AmountOK,Hold,Photo,CreatedAt,DestroyedAt,Condition,Release',
 Documents:'DocumentID,DocumentType,StudentID,LinkedEntity,FileID,FileName,MimeType,CapturedAt,VerificationStatus,Status,Notes',
 AuditLog:'AuditID,At,User,Role,Action,EntityType,EntityID,Before,After,Source,Note',
 FoodStep1:'x',FoodStep2:'x',FoodStep3:'x',Inventory:'x',OCRInbox:'x',Tasks:'x',Classes:'x',SchoolYears:'x',Attendance:'x',HealthScreenings:'x',Immunizations:'x',MedicationOrders:'x',MedicationAdministrations:'x',Incidents:'x',DiseaseSurveillance:'x',WarehouseCatalog:'x',WarehouseLedger:'x'};
Object.entries(H).forEach(([k,v])=>db.prepare('INSERT INTO sheet_rows VALUES(?,1,?)').run(k,JSON.stringify(v.split(','))));
const root=path.resolve('public'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer(async(q,r)=>{
 try{
  if(q.url.startsWith('/api/')){
   const chunks=[];for await(const c of q)chunks.push(c);
   const res=await handle(new Request('http://localhost:8787'+q.url,{method:q.method,headers:q.headers,body:['GET','HEAD'].includes(q.method)?undefined:Buffer.concat(chunks),duplex:'half'}),env);
   r.writeHead(res.status,Object.fromEntries(res.headers));r.end(Buffer.from(await res.arrayBuffer()));return}
  let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);
  if(!f.startsWith(root)||!fs.existsSync(f)){r.writeHead(404);return r.end('nf')}
  r.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));
 }catch(e){r.writeHead(500);r.end(String(e))}
}).listen(8787,()=>console.log('up'));
