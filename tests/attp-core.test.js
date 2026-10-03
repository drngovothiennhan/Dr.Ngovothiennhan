const assert=require('assert');
const C=require('../attp-core.js');
let n=0;const t=(name,fn)=>{try{fn();n++;console.log('ok  ',name)}catch(e){console.log('FAIL',name,'\n    ',e.message);process.exitCode=1}};

t('ngày VN d/m/y',()=>{assert.equal(C.toDate('03/10/2026'),'2026-10-03');assert.equal(C.toDate('3-10-26'),'2026-10-03');assert.equal(C.toDate('2026-10-03'),'2026-10-03')});
t('ngày sai bị từ chối',()=>{assert.equal(C.toDate('31/02/2026'),'');assert.equal(C.toDate('13/13/2026'),'');assert.equal(C.toDate('abc'),'')});
t('giờ',()=>{assert.equal(C.toDT('03/10/2026 07:30'),'2026-10-03T07:30');assert.equal(C.toDT('03/10/2026 7h05'),'2026-10-03T07:05');assert.equal(C.toDT('03/10/2026 25:00'),'')});
t('serial Excel',()=>{assert.equal(C.toDate(46298),'2026-10-03');assert.equal(C.toDT(46298.3125),'2026-10-03T07:30')});
t('số kiểu VN',()=>{assert.equal(C.parseNum('12,5'),12.5);assert.equal(C.parseNum('1.200'),1200);assert.equal(C.parseNum('1,200.5'),1200.5);assert.ok(Number.isNaN(C.parseNum('abc')));assert.equal(C.parseNum(3),3)});
t('đơn vị',()=>{assert.equal(C.normUnit('Kg'),'kg');assert.equal(C.normUnit('lít'),'lít');assert.equal(C.normUnit('LIT'),'lít');assert.equal(C.normUnit('hộp'),'hộp')});
t('đạt/không đạt',()=>{assert.equal(C.normOK('Đạt'),'Đạt');assert.equal(C.normOK('dat'),'Đạt');assert.equal(C.normOK('Không đạt'),'Không đạt');assert.equal(C.normOK('ko'),'Không đạt');assert.equal(C.normOK('✓'),'Đạt');assert.equal(C.normOK('x'),'x')});
t('norm giữ chữ Đ hoa',()=>{assert.equal(C.norm('Đậu hũ'),'dauhu')});
t('nhận diện cột B1',()=>{
  const h=['STT','Tên thực phẩm','Số lượng','ĐVT','Nơi cung cấp','Số hóa đơn','HSD','Cảm quan','Ghi chú'];
  const m=C.mapHeaders(h,'b1');
  assert.deepEqual(m,['','FoodName','Quantity','Unit','SupplierName','InvoiceNo','ExpiryDate','SensoryResult','Action']);
});
t('tìm dòng tiêu đề lệch',()=>{
  const mx=[['SỔ KIỂM THỰC 3 BƯỚC'],[''],['Tên thực phẩm','Số lượng','Đơn vị','Ngày nhập'],['Thịt heo',5,'kg','03/10/2026']];
  assert.equal(C.detectHeaderRow(mx,'b1'),2);
});
t('dựng dòng + bỏ dòng tổng',()=>{
  const mx=[['Tên thực phẩm','Số lượng','Đơn vị','Ngày nhập','Cảm quan'],['Thịt heo','5,5','Kg','03/10/2026','dat'],['Tổng','','','',''],['','','','','']];
  const m=C.mapHeaders(mx[0],'b1');const rows=C.buildRows(mx,0,m,'b1');
  assert.equal(rows.length,1);assert.deepEqual([rows[0].v.Quantity,rows[0].v.Unit,rows[0].v.ReceivedAt,rows[0].v.SensoryResult],['5.5','kg','2026-10-03','Đạt']);
});
const ctx={today:'2026-10-03',sessionDate:'2026-10-03',now:new Date('2026-10-03T08:00:00').getTime()};
const good={FoodName:'Thịt heo',FoodCategory:'Tươi sống/đông lạnh',ReceivedAt:'2026-10-03T06:30',Quantity:'5.5',Unit:'kg',SupplierName:'Cơ sở A',InvoiceNo:'HD01',SensoryResult:'Đạt'};
t('B1 hợp lệ',()=>{const r=C.validateRow('b1',{v:{...good}},ctx);assert.equal(r.errs.length,0,JSON.stringify(r.errs))});
t('B1 hết hạn → lỗi',()=>{const r=C.validateRow('b1',{v:{...good,ExpiryDate:'2026-10-01'}},ctx);assert.ok(r.errs.some(x=>x.k==='ExpiryDate'))});
t('B1 hạn trước ngày nhập → lỗi',()=>{const r=C.validateRow('b1',{v:{...good,ExpiryDate:'2026-10-03',ReceivedAt:'2026-10-03T06:30'}},{...ctx,today:'2026-10-02'});assert.equal(r.errs.filter(x=>x.k==='ExpiryDate').length,0);const r2=C.validateRow('b1',{v:{...good,ExpiryDate:'2026-10-02',ReceivedAt:'2026-10-03T06:30'}},{...ctx,today:'2026-10-01'});assert.ok(r2.errs.some(x=>x.k==='ExpiryDate'))});
t('B1 khô thiếu HSD → lỗi',()=>{const r=C.validateRow('b1',{v:{...good,FoodName:'Gạo',FoodCategory:'Khô/bao gói sẵn/phụ gia'}},ctx);assert.ok(r.errs.some(x=>x.k==='ExpiryDate'))});
t('B1 số lượng 0 / tương lai',()=>{assert.ok(C.validateRow('b1',{v:{...good,Quantity:'0'}},ctx).errs.some(x=>x.k==='Quantity'));assert.ok(C.validateRow('b1',{v:{...good,ReceivedAt:'2026-10-09T06:30'}},ctx).errs.some(x=>x.k==='ReceivedAt'))});
t('Không đạt cần xử lý',()=>{const r=C.validateRow('b1',{v:{...good,SensoryResult:'Không đạt'}},ctx);assert.ok(r.errs.some(x=>x.k==='Action'))});
t('thiếu cảm quan → lỗi, không tự điền',()=>{const v={...good};delete v.SensoryResult;assert.ok(C.validateRow('b1',{v},ctx).errs.some(x=>x.k==='SensoryResult'))});
t('nhóm do máy đoán không được tự lưu',()=>{const v={...good};delete v.FoodCategory;const row={v};const r=C.validateRow('b1',row,ctx);assert.ok(r.errs.some(x=>x.k==='FoodCategory'));assert.equal(row.guessCat,'Tươi sống/đông lạnh')});
t('B2 chế biến trước sơ chế → lỗi',()=>{const r=C.validateRow('b2',{v:{DishName:'Canh',Servings:'100',PrepCompletedAt:'2026-10-03T09:00',CookCompletedAt:'2026-10-03T08:00',ProcessorHygiene:'Đạt',EquipmentHygiene:'Đạt',AreaHygiene:'Đạt',SensoryResult:'Đạt'}},ctx);assert.ok(r.errs.some(x=>x.k==='CookCompletedAt'))});
t('B3 ăn trước chia → lỗi',()=>{const r=C.validateRow('b3',{v:{DishName:'Canh',Servings:'100',PortionCompletedAt:'2026-10-03T11:00',MealStartAt:'2026-10-03T10:00',ServingUtensilsCondition:'Đạt',MenuMatched:'Đạt',SensoryResult:'Đạt'}},ctx);assert.ok(r.errs.some(x=>x.k==='MealStartAt'))});
t('chống trùng',()=>{
  const ex=[{FoodName:'Thịt heo',InvoiceNo:'HD01',ReceivedAt:'2026-10-03T06:30',Quantity:'5.5'}];
  const rows=[{v:{...good}},{v:{...good,FoodName:'Cá',Quantity:'2'}},{v:{...good,FoodName:'Cá',Quantity:'2'}}];
  C.markDuplicates('b1',rows,ex);
  assert.ok(rows[0].dup);assert.equal(rows[1].dup,'');assert.ok(rows[2].dup);
});
t('OCR dòng hàng',()=>{
  const txt='PHIẾU GIAO HÀNG\nNgày giao: 03/10/2026\nSố phiếu: PG-0123\nĐiện thoại: 0901 234 567\n1. Thịt heo ba rọi 5,5 kg\n2 Cá basa phi lê 3 kg\nRau muống 4 bó\nTổng cộng 12 kg';
  const r=C.parseOcrText(txt);
  assert.equal(r.items.length,3,JSON.stringify(r.items));
  assert.deepEqual(r.items[0],{FoodName:'Thịt heo ba rọi',Quantity:'5.5',Unit:'kg'});
  assert.equal(r.ctx.received,'2026-10-03');assert.equal(r.ctx.invoice,'PG-0123');
});
t('dựng dòng ghi Sheet đúng số cột',()=>{
  const m={id:'FS1-1',sessionId:'M1',evidence:'f',status:'VERIFIED',user:'u',now:'t'};
  assert.equal(C.toSheetRow('b1',good,m).length,26);assert.equal(C.toSheetRow('b2',{},{...m,meal:'x'}).length,16);assert.equal(C.toSheetRow('b3',{},{...m,meal:'x'}).length,14);
  assert.equal(C.toSheetRow('b1',good,m)[3],'Thịt heo');assert.equal(C.toSheetRow('b1',good,m)[7],'5.5');
});
console.log(n+' test đạt');
t('mẫu Excel: nhãn cột tự nhận diện đủ',()=>{
  ['b1','b2','b3'].forEach(tg=>{
    const f=C.SCHEMAS[tg].fields,m=C.mapHeaders(f.map(x=>x.label),tg);
    assert.deepEqual(m,f.map(x=>x.k),tg+': '+JSON.stringify(m));
  });
});
t('chỉ có giờ',()=>{
  const f=C.SCHEMAS.b2.fields.find(x=>x.k==='PrepCompletedAt');
  assert.equal(C.normalizeValue(f,0.3125),'T07:30');assert.equal(C.normalizeValue(f,'7h05'),'T07:05');assert.equal(C.normalizeValue(f,'03/10/2026 07:30'),'2026-10-03T07:30');
});
