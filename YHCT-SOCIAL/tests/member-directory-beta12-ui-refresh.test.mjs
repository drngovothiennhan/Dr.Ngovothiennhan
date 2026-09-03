import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {members, memberImportAudit} from '../assets/modules/members.js';

const txt=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const byMssv=id=>members.find(x=>x.mssv===id);

test('latest DS CLB YHCT workbook becomes 159 accounts with updated management roles',()=>{
  const counts=members.reduce((m,x)=>(m[x.role]=(m[x.role]||0)+1,m),{});
  assert.equal(members.length,159);
  assert.deepEqual(counts,{ADMIN:1,SUPER_MOD:2,MOD:7,MEMBER:149});
  assert.equal(byMssv('2413120084')?.role,'ADMIN');
  assert.equal(byMssv('2213120022')?.role,'SUPER_MOD');
  assert.equal(byMssv('2413120089')?.role,'SUPER_MOD');
  for(const id of ['2413120092','2213120019','2413120063','2413120055','2413120099','2413120072','2513120049']) assert.equal(byMssv(id)?.role,'MOD',id);
  for(const id of ['2513060068','2413120079','2413120004']) assert.equal(byMssv(id)?.role,'MEMBER',id);
  assert.equal(memberImportAudit.sourceFile,'DS CLB YHCT.xlsx');
});

test('latest source keeps known duplicate/conflict audit without exposing phone data',()=>{
  assert.equal(memberImportAudit.rawRows,174);
  assert.equal(memberImportAudit.uniqueAccounts,159);
  assert.equal(memberImportAudit.duplicateMssvCount,15);
  assert.equal(memberImportAudit.conflicts.some(x=>x.mssv==='2413120131'),true);
  assert.equal(members.some(x=>Object.hasOwn(x,'phone')||Object.hasOwn(x,'sdt')),false);
});

test('UI preserves beta1.2 information architecture while refreshing traditional medicine icons and palette',async()=>{
  const html=await txt('yhct-social/index.html');
  const css=await txt('assets/styles/app.css');
  for(const label of ['Trang chủ','Cộng đồng','Khám phá','Thông báo','Tin nhắn','Hồ sơ']) assert.match(html,new RegExp(label));
  for(const marker of ['beta-shell','beta-left-rail','beta-main-column','beta-right-rail','beta-mobile-nav']) assert.match(html,new RegExp(marker));
  for(const icon of ['data-icon="home"','data-icon="community"','data-icon="discover"','data-icon="notifications"','data-icon="messages"','data-icon="profile"']) assert.match(html,new RegExp(icon));
  assert.match(css,/--beta-primary:/);
  assert.match(css,/--beta-surface:/);
  assert.match(css,/--yhct-accent:/);
  assert.match(css,/\.nav-icon/);
  assert.doesNotMatch(html,/🏡|🏮|🌿|🔔|🧑‍⚕/);
});

test('mobile beta layout remains compact and stable with five primary destinations plus More',async()=>{
  const html=await txt('yhct-social/index.html');
  assert.match(html,/data-route="home"[\s\S]*data-route="community"[\s\S]*data-route="discover"[\s\S]*data-route="notifications"[\s\S]*data-route="profile"/);
  assert.match(html,/data-action="mobile-more"/);
});

test('admin data-quality panel reflects latest directory conflicts and beta1.2 refresh milestone',async()=>{
  const js=await txt('assets/admin.js');
  assert.match(js,/memberImportAudit\.roleConflicts/);
  assert.match(js,/2\.6\.0 · beta12-ui-refresh/);
});
