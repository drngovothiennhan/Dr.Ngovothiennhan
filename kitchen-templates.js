
/* Preloaded operational templates: menu, stock issue, warehouse cards */
const MENU_SOURCE_ID='19ptDEihdeXdyJmo3XBaWs_Cm2HK58Fh2';
const ISSUE_SOURCE_ID='1O-abHTe_OAFH6O0Rks13uyxW37p3Ixz8';
const WAREHOUSE_SOURCE_ID='1lv6mNO8GXK6RUDi7FvsO2pcGN9jfDPDp';
state.warehouseItem=state.warehouseItem||'';

const __kitchenPageTemplates=kitchenPage;
kitchenPage=function(){
  ensure(['MenuPlan','StockIssuePlan','WarehouseCatalog','WarehouseLedger'],false);
  if(state.kitchenFocus==='menu')return renderMenuPlanTemplates();
  if(state.kitchenFocus==='issue')return renderStockIssueTemplates();
  if(state.kitchenFocus==='ledger')return renderWarehouseHistory();
  return __kitchenPageTemplates();
};

function sourceLink(id,label){
  return '<a class="btn soft mini" target="_blank" rel="noopener" href="https://drive.google.com/open?id='+encodeURIComponent(id)+'" style="text-decoration:none">'+esc(label)+' ↗</a>';
}

function renderMenuPlanTemplates(){
  const list=objs('MenuPlan').slice().sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Thực đơn đã nạp sẵn</h2><div class="muted">Dữ liệu mẫu lịch sử từ tuần 07/9–11/9/2026. Không tự ghi đè thực đơn hiện tại.</div></div>'+sourceLink(MENU_SOURCE_ID,'Mở file gốc')+'</div>'+
    '<div class="notice ok">Đã nạp '+list.length+' ngày thực đơn vào Master. Có thể dùng làm mẫu tham chiếu khi lập bữa ăn mới.</div>'+
    '<div class="table"><table><thead><tr><th>Ngày</th><th>Ăn sáng</th><th>Sữa sáng</th><th>Nước/trái cây 9g</th><th>Canh trưa</th><th>Món mặn</th><th>Tráng miệng</th><th>Xế</th><th>Sữa xế</th></tr></thead><tbody>'+
    list.map(x=>'<tr><td><b>'+esc(x.Weekday)+'</b><div class="muted">'+esc(x.Date)+'</div></td><td>'+esc(x.Breakfast)+'</td><td>'+esc(x.MorningMilk)+'</td><td>'+esc(x.FruitDrink0900)+'</td><td>'+esc(x.LunchSoup)+'</td><td>'+esc(x.LunchMain)+'</td><td>'+esc(x.Dessert)+'</td><td>'+esc(x.AfternoonMeal)+'</td><td>'+esc(x.AfternoonMilk)+'</td></tr>').join('')+
    '</tbody></table></div></div>';
}

function renderStockIssueTemplates(){
  const list=objs('StockIssuePlan').slice().sort((a,b)=>String(a.Date).localeCompare(String(b.Date))||String(a.ItemCode).localeCompare(String(b.ItemCode)));
  const dates=[...new Set(list.map(x=>x.Date).filter(Boolean))];
  const items=[...new Map(list.map(x=>[x.ItemCode,{code:x.ItemCode,name:x.ItemName,spec:x.Specification,unit:x.Unit}])).values()];
  const by=new Map(list.map(x=>[x.Date+'|'+x.ItemCode,x]));
  const totals=Object.fromEntries(items.map(it=>[it.code,list.filter(x=>x.ItemCode===it.code).reduce((s,x)=>s+Number(x.QtyOut||0),0)]));
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Mẫu xuất kho tuần</h2><div class="muted">Dữ liệu lịch sử 07/9–11/9/2026, dùng làm mẫu tham chiếu.</div></div>'+sourceLink(ISSUE_SOURCE_ID,'Mở file gốc')+'</div>'+
    '<div class="notice"><b>Cần lưu ý nguồn:</b> tiêu đề file ghi “Tuần 2 tháng 9 năm 2025”, nhưng từng ngày trong bảng là 07/9–11/9/2026. Ứng dụng giữ nguyên dấu vết này và đánh dấu REVIEW_YEAR_LABEL.</div>'+
    '<div class="table"><table><thead><tr><th>Ngày</th>'+items.map(i=>'<th>'+esc(i.name)+(i.spec?'<div class="muted">'+esc(i.spec)+'</div>':'')+'</th>').join('')+'</tr></thead><tbody>'+
    dates.map(d=>'<tr><td><b>'+esc((list.find(x=>x.Date===d)||{}).Weekday||'')+'</b><div class="muted">'+esc(d)+'</div></td>'+items.map(i=>'<td>'+esc((by.get(d+'|'+i.code)||{}).QtyOut||'')+' <span class="muted">'+esc(i.unit||'')+'</span></td>').join('')+'</tr>').join('')+
    '<tr><td><b>TỔNG</b></td>'+items.map(i=>'<td><b>'+esc(totals[i.code])+'</b> <span class="muted">'+esc(i.unit||'')+'</span></td>').join('')+'</tr></tbody></table></div></div>';
}

function renderWarehouseHistory(){
  const catalog=objs('WarehouseCatalog');
  const all=objs('WarehouseLedger');
  if(!state.warehouseItem&&catalog[0])state.warehouseItem=catalog[0].ItemCode;
  const current=catalog.find(x=>x.ItemCode===state.warehouseItem)||catalog[0]||{};
  const list=all.filter(x=>!current.ItemCode||x.ItemCode===current.ItemCode).slice().sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Thẻ kho thực phẩm · dữ liệu lịch sử</h2><div class="muted">Nguồn tháng 08/2026. Chỉ dùng đối chiếu lịch sử, không được xem là tồn kho hiện tại.</div></div>'+sourceLink(WAREHOUSE_SOURCE_ID,'Mở thẻ kho gốc')+'</div>'+
    '<div class="toolbar"><select onchange="state.warehouseItem=this.value;renderPage()">'+catalog.map(x=>'<option value="'+esc(x.ItemCode)+'" '+(x.ItemCode===current.ItemCode?'selected':'')+'>'+esc(x.ItemName)+'</option>').join('')+'</select>'+badge(catalog.length+' mặt hàng')+badge(all.length+' dòng lịch sử')+'</div>'+
    (current.ItemCode?'<div class="stats"><div class="stat"><b>'+esc(current.TotalIn||'0')+'</b><span>Tổng nhập nguồn</span></div><div class="stat"><b>'+esc(current.TotalOut||'0')+'</b><span>Tổng xuất nguồn</span></div><div class="stat"><b>'+esc(current.TotalSample||'0')+'</b><span>Lưu mẫu nguồn</span></div><div class="stat"><b>'+esc(current.ReportedCarryForward||'0')+'</b><span>Tồn thực tế mang sang ghi trên mẫu</span></div></div>':'')+
    '<div class="table"><table><thead><tr><th>Ngày</th><th>Nhập</th><th>Xuất</th><th>Lưu mẫu</th><th>Tồn cuối</th><th>Tồn thực tế mang sang</th><th>Ghi chú</th></tr></thead><tbody>'+
    list.map(x=>'<tr><td>'+esc(x.Date)+'</td><td>'+esc(x.QtyIn)+'</td><td>'+esc(x.QtyOut)+'</td><td>'+esc(x.SampleQty)+'</td><td>'+esc(x.EndingQty)+'</td><td>'+esc(x.ActualCarryForward)+'</td><td>'+esc(x.Note)+'</td></tr>').join('')+
    '</tbody></table></div></div>';
}
