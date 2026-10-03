
/* App Y tế VK V2.1 — five-region workspace controller */
document.body.classList.add('layout-compact');
state.lastSync=state.lastSync||null;
state.layoutTab=state.layoutTab||{};
state.kitchenFocus=state.kitchenFocus||'meal';

const LAYOUT_META={
  today:{icon:'⌂',title:'Hôm nay',desc:'Việc ưu tiên và cảnh báo trong ngày'},
  students:{icon:'⌕',title:'Học sinh',desc:'Danh sách, hồ sơ và dòng thời gian'},
  health:{icon:'✚',title:'Y tế',desc:'Thuốc, khám sức khỏe, tiêm chủng và sơ cứu'},
  kitchen:{icon:'♨',title:'Bếp & kho',desc:'Kiểm thực, lưu mẫu và tồn kho'},
  records:{icon:'▤',title:'Hồ sơ',desc:'Tài liệu, nguồn dữ liệu và truyền thông'},
  admin:{icon:'⚙',title:'Quản trị',desc:'Người dùng, phân quyền và cấu hình'}
};

function railHtml(){
  const entries=['today','students','health','kitchen','records'].concat(state.role==='ADMIN'?['admin']:[]);
  return '<nav class="left-rail">'+entries.map(p=>
    '<button class="rail-btn '+(state.page===p?'active':'')+'" onclick="go(\''+p+'\')" aria-label="'+esc(LAYOUT_META[p].title)+'">'+
    '<span>'+LAYOUT_META[p].icon+'</span><span class="rail-label">'+esc(LAYOUT_META[p].title)+'</span></button>'
  ).join('')+'<div class="rail-spacer"></div><div class="rail-avatar">'+esc((state.user?.name||state.user?.email||'YT').split(/\s+/).map(x=>x[0]).slice(-2).join('').toUpperCase())+'</div></nav>';
}

function contextItems(page){
  if(page==='today') return [
    ['overview','▦','Tổng quan',null],
    ['meds','💊','Thuốc hôm nay',pendingMeds().length],
    ['sick','🦠','Nghỉ bệnh',sickAbsence().length],
    ['kitchen','🍲','ATTP hôm nay',dueSamples().length],
    ['tasks','✓','Việc đang mở',openTasks().length]
  ];
  if(page==='students') return [
    ['all','👧','Tất cả học sinh',activeStudentCount()],
    ['class','▦','Theo lớp',objs('Classes').length||15],
    ['inactive','↪','Nghỉ / chuyển trường',inactiveEnrollmentCount()],
    ['review','!','Chờ xác minh',objs('IdentityReview').filter(x=>String(x.Status).toUpperCase()==='OPEN').length]
  ];
  if(page==='health') return [
    ['meds','💊','Thuốc hôm nay',pendingMeds().length],
    ['screen','🩺','Khám sức khỏe',objs('HealthScreenings').length],
    ['vaccines','💉','Tiêm chủng',objs('Immunizations').length],
    ['incidents','🩹','Sơ cứu / tai nạn',objs('Incidents').length],
    ['disease','🦠','Nghỉ bệnh / dịch',objs('DiseaseSurveillance').length]
  ];
  if(page==='kitchen') return [
    ['meal','🍽','Bữa ăn hôm nay',todayMealCount()],
    ['b1','1','Kiểm thực B1',objs('FoodB1').length],
    ['b2','2','Kiểm thực B2',objs('FoodB2').length],
    ['b3','3','Kiểm thực B3',objs('FoodB3').length],
    ['sample','🧪','Lưu mẫu',objs('FoodSamples').length],
    ['inventory','📦','Kho thực phẩm / sữa',expiringLots().length]
  ];
  if(page==='records') return [
    ['docs','▤','Tài liệu & chứng từ',objs('Documents').length],
    ['sources','⇄','Nguồn dữ liệu',objs('SourceRegistry').length],
    ['communication','📣','Truyền thông',objs('Communication').length],
    ['staging','◫','Import / staging',objs('SourceRegistry').filter(x=>/STAGING|REVIEW/i.test(x.ImportStatus||'')).length]
  ];
  return [
    ['overview','⚙','Tổng quan hệ thống',null],
    ['users','👤','Người dùng',objs('Users').length],
    ['identity','!','Identity review',objs('IdentityReview').filter(x=>String(x.Status).toUpperCase()==='OPEN').length],
    ['config','⌘','Cấu hình',null]
  ];
}
function inactiveEnrollmentCount(){return objs('Enrollments').filter(x=>String(x.Status||'').toUpperCase()!=='ACTIVE').length}
function todayMealCount(){return objs('MealSessions').filter(x=>String(x.Date||'').slice(0,10)===today()).length}

function currentContextKey(){
  if(state.page==='health')return state.healthTab||'meds';
  if(state.page==='kitchen')return state.kitchenFocus||'meal';
  return state.layoutTab[state.page]||({today:'overview',students:'all',records:'docs',admin:'overview'}[state.page]||'overview');
}
function sidebarHtml(){
  const m=LAYOUT_META[state.page]||LAYOUT_META.today,active=currentContextKey();
  return '<aside class="context-sidebar"><div class="context-head"><b>'+esc(m.title)+'</b><small>'+esc(m.desc)+'</small></div><div class="context-group-label">ĐIỀU HƯỚNG</div>'+
    contextItems(state.page).map(([key,icon,label,count])=>
      '<button class="context-btn '+(active===key?'on':'')+'" onclick="selectContext(\''+key+'\')"><span>'+icon+'</span><span>'+esc(label)+'</span>'+(count==null?'':'<span class="count">'+count+'</span>')+'</button>'
    ).join('')+'</aside>';
}

function tabItems(page){
  if(page==='today')return [['overview','Tổng quan'],['meds','Thuốc hôm nay'],['kitchen','Bếp & kho'],['tasks','Công việc']];
  if(page==='students')return [['all','Danh sách'],['class','Theo lớp'],['inactive','Nghỉ / chuyển'],['review','Chờ xác minh']];
  if(page==='health')return [['meds','Thuốc hôm nay'],['screen','Khám sức khỏe'],['vaccines','Tiêm chủng'],['incidents','Sơ cứu'],['disease','Dịch']];
  if(page==='kitchen')return [['meal','Bữa ăn'],['b1','B1'],['b2','B2'],['b3','B3'],['sample','Lưu mẫu'],['inventory','Kho']];
  if(page==='records')return [['docs','Tài liệu'],['sources','Nguồn dữ liệu'],['communication','Truyền thông'],['staging','Staging']];
  return [['overview','Tổng quan'],['users','Người dùng'],['identity','Xác minh'],['config','Cấu hình']];
}
function tabsHtml(){
  const a=currentContextKey();
  return '<div class="workspace-tabs">'+tabItems(state.page).map(([k,l])=>'<button class="'+(a===k?'active':'')+'" onclick="selectContext(\''+k+'\')">'+esc(l)+'</button>').join('')+'</div>';
}

function selectContext(key){
  if(state.page==='health'){state.healthTab=key;renderPage();return}
  if(state.page==='kitchen'){
    state.kitchenFocus=key;renderPage();
    setTimeout(()=>scrollKitchenFocus(key),60);return
  }
  state.layoutTab[state.page]=key;
  if(state.page==='today'){
    if(key==='meds'){state.healthTab='meds';go('health');return}
    if(key==='kitchen'){go('kitchen');return}
    if(key==='tasks'){document.querySelector('#main .assistant')?.scrollIntoView({behavior:'smooth'});return}
  }
  if(state.page==='students'&&key==='review'){ensure(['IdentityReview'],true);return}
  if(state.page==='records'){
    const map={docs:'documentsPanel',sources:'sourcesPanel',communication:'communicationPanel'};
    setTimeout(()=>document.getElementById(map[key]||'documentsPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
  }
  if(state.page==='admin'&&key==='config'){openSetup();return}
  renderPage();
}
function scrollKitchenFocus(key){
  if(key==='inventory'){document.getElementById('inventoryCard')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  const el=document.querySelector('.stepper');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
}

function sectionHeaderHtml(){
  const m=LAYOUT_META[state.page]||LAYOUT_META.today;
  let action='';
  if(state.page==='students'&&canWrite('Students'))action='<button class="btn primary mini" onclick="openNewStudent()">+ Học sinh</button>';
  if(state.page==='health'&&canWrite('Incidents'))action='<button class="btn primary mini" onclick="quickNewIncident()">+ Sơ cứu</button>';
  if(state.page==='kitchen'&&canWrite('MealSessions'))action='<button class="btn primary mini" onclick="newMealSession()">+ Bữa ăn</button>';
  if(state.page==='records'&&canWrite('Documents'))action='<button class="btn primary mini" onclick="openDocumentUpload()">+ Tài liệu</button>';
  if(state.page==='admin'&&state.role==='ADMIN')action='<button class="btn primary mini" onclick="openNewUser()">+ User</button>';
  return '<div class="main-section-head"><div class="grow"><h1>'+esc(m.title)+'</h1><div class="muted">App Y tế VK / '+esc(m.title)+' · '+esc(m.desc)+'</div></div>'+action+'</div>';
}

function rightPanelHtml(){
  if(state.page==='today'){
    return '<aside class="right-sidebar"><h3>Việc cần chú ý</h3>'+
      quickMetric('💊','Thuốc chưa ghi nhận',pendingMeds().length,'selectContext("meds")')+
      quickMetric('📦','Lô ≤ 7 ngày HSD',expiringLots().length,'go("kitchen");setTimeout(()=>selectContext("inventory"),80)')+
      quickMetric('🧪','Mẫu đến hạn',dueSamples().length,'go("kitchen")')+
      quickMetric('🦠','Nghỉ bệnh hôm nay',sickAbsence().length,'state.healthTab="disease";go("health")')+
      '<div class="quick-block"><b>Thao tác nhanh</b><div class="quick-actions"><button class="btn soft" onclick="state.healthTab=\\'meds\\';go(\\'health\\')">Thuốc</button><button class="btn soft" onclick="quickNewIncident()">Sơ cứu</button><button class="btn soft" onclick="go(\\'students\\')">Tìm trẻ</button><button class="btn soft" onclick="go(\\'records\\')">Tài liệu</button></div></div></aside>';
  }
  if(state.page==='students'){
    return '<aside class="right-sidebar"><h3>Tổng quan học sinh</h3>'+
      quickMetric('👧','Đang học',activeStudentCount(),'')+
      quickMetric('↪','Nghỉ / chuyển',inactiveEnrollmentCount(),'')+
      quickMetric('!','Chờ xác minh',objs('IdentityReview').filter(x=>String(x.Status).toUpperCase()==='OPEN').length,'selectContext("review")')+
      '<div class="quick-block"><b>Quy tắc định danh</b><div class="muted">Ưu tiên mã định danh → mã học sinh → họ tên + ngày sinh + giới tính → review thủ công.</div></div></aside>';
  }
  if(state.page==='health'){
    const incidentsToday=objs('Incidents').filter(x=>String(x.OccurredAt||'').slice(0,10)===today()).length;
    return '<aside class="right-sidebar"><h3>Y tế hôm nay</h3>'+
      quickMetric('💊','Thuốc đang chờ',pendingMeds().length,'state.healthTab="meds";renderPage()')+
      quickMetric('🩹','Sự cố hôm nay',incidentsToday,'state.healthTab="incidents";renderPage()')+
      quickMetric('🦠','Nghỉ bệnh',sickAbsence().length,'state.healthTab="disease";renderPage()')+
      '<div class="quick-block"><b>An toàn thuốc</b><div class="muted">Chỉ ghi nhận đã dùng khi có MedicationOrder hợp lệ và người thực hiện xác nhận.</div></div></aside>';
  }
  if(state.page==='kitchen'){
    return '<aside class="right-sidebar"><h3>Bếp & kho</h3>'+
      quickMetric('🍽','Bữa hôm nay',todayMealCount(),'selectContext("meal")')+
      quickMetric('📦','Lô gần HSD',expiringLots().length,'selectContext("inventory")')+
      quickMetric('🧪','Mẫu cần xử lý',dueSamples().length,'selectContext("sample")')+
      '<div class="quick-block"><b>Quy trình chuẩn</b><div class="muted">B1 nhận thực phẩm → B2 chế biến → B3 trước khi ăn → lưu mẫu. Mỗi bước dùng chung MealSessionID.</div></div></aside>';
  }
  if(state.page==='records'){
    const staging=objs('SourceRegistry').filter(x=>/STAGING|REVIEW/i.test(x.ImportStatus||'')).length;
    return '<aside class="right-sidebar"><h3>Hồ sơ & nguồn</h3>'+
      quickMetric('▤','Tài liệu',objs('Documents').length,'selectContext("docs")')+
      quickMetric('⇄','Nguồn dữ liệu',objs('SourceRegistry').length,'selectContext("sources")')+
      quickMetric('◫','Nguồn staging',staging,'selectContext("staging")')+
      '<div class="quick-block"><b>Nguyên tắc</b><div class="muted">File nguồn giữ nguyên. Import qua preview/mapping trước khi ghi Master.</div></div></aside>';
  }
  const bridge=GoogleSheetsConnector.getConfig().bridgeUrl;
  return '<aside class="right-sidebar"><h3>Trạng thái hệ thống</h3>'+
    quickMetric('👤','Người dùng',objs('Users').length,'selectContext("users")')+
    quickMetric('!','Identity review',objs('IdentityReview').filter(x=>String(x.Status).toUpperCase()==='OPEN').length,'selectContext("identity")')+
    '<div class="quick-block"><b>Data access</b><div class="muted">'+(bridge?'Apps Script Bridge đang cấu hình.':'Direct mode đang hoạt động; Bridge source đã sẵn sàng.')+'</div></div>'+
    '<div class="quick-actions"><button class="btn soft" onclick="openSetup()">Cấu hình</button><button class="btn soft" onclick="window.open(\\'https://docs.google.com/spreadsheets/d/169Iu_tlE8LkbSLsNiEsnTdkjyLSsVzDM7_fQl_HTXUI/edit\\',\\'_blank\\')">Master</button></div></aside>';
}
function quickMetric(icon,label,value,action){
  const safeAction=action?String(action).replace(/&/g,'&amp;').replace(/"/g,'&quot;'):'';
  const onclick=safeAction?' onclick="'+safeAction+'" style="cursor:pointer"':'';
  return '<div class="quick-block"'+onclick+'><div class="row" style="padding:0"><span style="font-size:19px">'+icon+'</span><div class="grow"><b>'+esc(label)+'</b><div class="muted">'+esc(value)+'</div></div></div></div>';
}

function statusBarHtml(){
  const mode=GoogleSheetsConnector.useBridge()?'BRIDGE':'DIRECT';
  const sync=state.lastSync?state.lastSync.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'chưa đồng bộ';
  return '<div class="status-bar"><span class="status-item"><i class="status-dot '+(navigator.onLine?'':'off')+'"></i>'+(navigator.onLine?'Online':'Offline')+'</span>'+
    '<span class="status-item hide-mobile">Đồng bộ: '+esc(sync)+'</span><span class="status-item">Role: '+esc(state.role||'—')+'</span>'+
    '<span class="status-item hide-mobile">Data: '+mode+'</span><span class="status-spacer"></span><span class="status-item">V2.1 Layout</span></div>';
}

const __ensureLayout=ensure;
ensure=async function(keys,rerender=true){
  const result=await __ensureLayout(keys,false);
  state.lastSync=new Date();
  if(rerender&&state.authorized)renderPage();
  return result;
};
refresh=async function(keys){
  keys.forEach(k=>state.loaded.delete(k));
  return ensure(keys,true);
};

renderShell=function(page='today'){
  if(!state.authorized)return renderLogin();
  state.page=page;
  document.getElementById('root').innerHTML=
    '<div class="workspace">'+railHtml()+sidebarHtml()+
    '<section class="center-stage">'+tabsHtml()+sectionHeaderHtml()+'<main id="main"></main></section>'+
    rightPanelHtml()+'</div><div id="layoutStatus">'+statusBarHtml()+'</div>';
  renderPage();
};

go=function(p){
  state.page=p;
  renderShell(p);
  const need={
    students:['Students','Enrollments','Classes','IdentityReview'],
    health:['HealthScreenings','Immunizations','MedicationOrders','MedicationAdministrations','Incidents','DiseaseSurveillance','Attendance'],
    kitchen:['MealSessions','FoodB1','FoodB2','FoodB3','FoodSamples','Inventory'],
    records:['Documents','SourceRegistry','Communication'],
    admin:['Users','IdentityReview','AuditLog','Config','Classes','SchoolYears','Enrollments']
  }[p]||[];
  if(need.length)ensure(need,true);
};

renderPage=function(){
  const m=document.getElementById('main');if(!m)return;
  m.innerHTML=(pages[state.page]||pages.today)();
  const right=document.querySelector('.right-sidebar');
  if(right){const temp=document.createElement('div');temp.innerHTML=rightPanelHtml();const fresh=temp.firstElementChild;if(fresh)right.replaceWith(fresh)}
  const status=document.getElementById('layoutStatus');if(status)status.innerHTML=statusBarHtml();
  const tabs=document.querySelector('.workspace-tabs');if(tabs)tabs.outerHTML=tabsHtml();
  const side=document.querySelector('.context-sidebar');if(side)side.outerHTML=sidebarHtml();
};

function quickNewIncident(){
  state.healthTab='incidents';go('health');
  setTimeout(()=>{if(canWrite('Incidents'))openGeneric('Incidents')},120);
}

/* Give record/source sections stable anchors for sidebar shortcuts */
const __recordsPageLayout=recordsPage;
recordsPage=function(){
  const html=__recordsPageLayout();
  return html
    .replace('<div class="grid2">','<div id="documentsPanel" class="grid2">')
    .replace('<div class="card"><h2>Nguồn dữ liệu</h2>','<div id="sourcesPanel" class="card"><h2>Nguồn dữ liệu</h2>')
    .replace('<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Truyền thông y tế</h2>','<div id="communicationPanel" class="card"><div class="row"><div class="grow"><h2 style="margin:0">Truyền thông y tế</h2>');
};

/* Student sidebar filters: all / class / inactive / review */
const __studentsPageLayout=studentsPage;
studentsPage=function(){
  const mode=state.layoutTab.students||'all';
  if(mode==='review'){
    ensure(['IdentityReview'],false);
    const list=objs('IdentityReview');
    return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Chờ xác minh định danh</h2><div class="muted">Không tự ghép các trường hợp chưa chắc chắn.</div></div></div>'+
      (list.length?'<div class="table"><table><thead><tr><th>Loại</th><th>Nguồn</th><th>Khóa nguồn</th><th>StudentID</th><th>Độ tin cậy</th><th>Trạng thái</th></tr></thead><tbody>'+list.map(x=>'<tr><td>'+esc(x.CandidateType)+'</td><td>'+esc(x.Source)+'</td><td>'+esc(x.SourceKey)+'</td><td>'+esc(x.StudentID)+'</td><td>'+esc(x.Confidence)+'</td><td>'+badge(x.Status||'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Không có trường hợp chờ xác minh.</div>')+'</div>';
  }
  if(mode==='inactive'){
    const students=objs('Students'),sm=new Map(students.map(s=>[s.StudentID,s]));
    const list=objs('Enrollments').filter(e=>String(e.Status||'').toUpperCase()!=='ACTIVE');
    return '<div class="card"><h2>Nghỉ / chuyển trường</h2><div class="muted">Giữ nguyên Student; chỉ thay trạng thái Enrollment.</div>'+
      (list.length?'<div class="table" style="margin-top:10px"><table><thead><tr><th>Học sinh</th><th>Lớp</th><th>Trạng thái</th><th>Ngày kết thúc</th></tr></thead><tbody>'+list.map(e=>'<tr><td>'+esc(sm.get(e.StudentID)?.FullName||e.StudentID)+'</td><td>'+esc(e.ClassNameSnapshot)+'</td><td>'+badge(e.Status||'')+'</td><td>'+esc(e.EndDate||'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Chưa có Enrollment không hoạt động.</div>')+'</div>';
  }
  if(mode==='class'){
    const classes=[...new Set(objs('Enrollments').filter(e=>String(e.Status||'').toUpperCase()==='ACTIVE').map(e=>e.ClassNameSnapshot).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'vi'));
    const current=state.selectedClass||classes[0]||'';
    if(!state.selectedClass&&current)state.selectedClass=current;
    const students=objs('Students'),sm=new Map(students.map(s=>[s.StudentID,s]));
    const list=objs('Enrollments').filter(e=>String(e.Status||'').toUpperCase()==='ACTIVE'&&e.ClassNameSnapshot===current);
    return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Theo lớp</h2><div class="muted">'+list.length+' học sinh</div></div><select onchange="state.selectedClass=this.value;renderPage()">'+classes.map(c=>'<option '+(c===current?'selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div><div class="table"><table><thead><tr><th>Học sinh</th><th>Ngày sinh</th><th>Giới tính</th><th></th></tr></thead><tbody>'+list.map(e=>{const s=sm.get(e.StudentID)||{};return'<tr><td><b>'+esc(s.FullName||e.StudentID)+'</b></td><td>'+esc(s.DOB||'')+'</td><td>'+esc(s.Gender||'')+'</td><td><button class="btn soft mini" onclick="openProfile(\\''+esc(e.StudentID)+'\\')">Hồ sơ</button></td></tr>'}).join('')+'</tbody></table></div></div>';
  }
  return __studentsPageLayout();
};

window.addEventListener('online',()=>{if(state.authorized)renderPage()});
window.addEventListener('offline',()=>{if(state.authorized)renderPage()});
