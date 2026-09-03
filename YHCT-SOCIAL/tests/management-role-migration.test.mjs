import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const txt=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('v2.6 management refresh migration matches latest workbook authority', async()=>{
  const sql=await txt('database/004_management_role_refresh.sql');
  for (const [mssv,role] of [
    ['2413120084','ADMIN'],['2213120022','SUPER_MOD'],['2413120089','SUPER_MOD'],
    ['2413120092','MOD'],['2213120019','MOD'],['2413120063','MOD'],['2413120055','MOD'],
    ['2413120099','MOD'],['2413120072','MOD'],['2513120049','MOD'],
    ['2513060068','MEMBER'],['2413120079','MEMBER'],['2413120004','MEMBER']
  ]) {
    assert.match(sql,new RegExp(`UPDATE users SET role='${role}'[^;]+mssv='${mssv}'`,'s'),`${mssv} -> ${role}`);
  }
  assert.match(sql,/DS CLB YHCT\.xlsx/);
  assert.match(sql,/BEGIN[\s\S]*COMMIT/);
  const runner=await txt('infra/google/migrate-cloudsql.sh');
  assert.match(runner,/004_management_role_refresh\.sql/);
});
