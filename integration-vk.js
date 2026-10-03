
/* App Y tế VK ↔ Vành Khuyên School Health v2 integration surface */
const VANH_KHUYEN_URL='https://vanh-khuyen-school-health-v2.vercel.app/';

pages.portal=portalPage;

function portalPage(){
  ensure(['PortalProjection','IntegrationQueue','Students','Enrollments','HealthScreenings','Attendance'],false);
  const mode=state.layoutTab.portal||'portal';
  if(mode==='projection')return portalProjectionPage();
  if(mode==='queue')return portalQueuePage();
  if(mode==='bridge')return portalBridgePage();
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Cổng Trường Mầm non Vành Khuyên 3</h2><div class="muted">Mở trong cùng hệ thống; App Y tế VK vẫn là lõi nghiệp vụ và dữ liệu y tế.</div></div><a class="btn primary" target="_blank" rel="noopener" href="'+VANH_KHUYEN_URL+'" style="text-decoration:none">Mở cửa sổ riêng ↗</a></div>'+
    '<div class="portal-card"><b>Liên kết giao diện đã bật.</b><div class="muted">Cổng Vành Khuyên được nhúng bên dưới. Dữ liệu chia sẻ được chuẩn bị qua PortalProjection và IntegrationQueue, không công khai Master Sheet.</div></div>'+
    '<iframe src="'+VANH_KHUYEN_URL+'?from=app-y-te-vk" title="Vành Khuyên School Health v2" style="width:100%;height:72vh;border:1px solid var(--line);border-radius:16px;background:#fff" loading="lazy"></iframe></div>';
}

function portalProjectionPage(){
  const list=objs('PortalProjection').filter(x=>x.StudentID);
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Dữ liệu tối thiểu chia sẻ cho cổng trường</h2><div class="muted">Không đưa bệnh sử chi tiết, toa thuốc, chứng từ hay dữ liệu ATTP sang cổng phụ huynh.</div></div><button class="btn soft" onclick="queuePortalRefresh()">Tạo yêu cầu đồng bộ</button></div>'+
    '<div class="stats"><div class="stat"><b>'+list.length+'</b><span>Projection học sinh</span></div><div class="stat"><b>'+new Set(list.map(x=>x.ClassName).filter(Boolean)).size+'</b><span>Lớp</span></div><div class="stat"><b>'+objs('IntegrationQueue').filter(x=>String(x.Status||'').toUpperCase()!=='DONE').length+'</b><span>Đang chờ đồng bộ</span></div><div class="stat"><b>V2</b><span>Schema bridge</span></div></div>'+
    '<div class="table"><table><thead><tr><th>StudentID</th><th>Họ tên</th><th>Lớp</th><th>Ngày sinh</th><th>Giới tính</th></tr></thead><tbody>'+list.slice(0,500).map(x=>'<tr><td>'+esc(x.StudentID)+'</td><td><b>'+esc(x.FullName)+'</b></td><td>'+esc(x.ClassName)+'</td><td>'+esc(x.DOB)+'</td><td>'+esc(x.Gender)+'</td></tr>').join('')+'</tbody></table></div></div>';
}

function portalQueuePage(){
  const q=objs('IntegrationQueue').slice().reverse();
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Hàng đợi đồng bộ</h2><div class="muted">Các thay đổi được ghi thành sự kiện để bridge xử lý khi endpoint tích hợp được bật.</div></div><button class="btn primary" onclick="queuePortalRefresh()">+ Yêu cầu refresh</button></div>'+
    (q.length?'<div class="table"><table><thead><tr><th>Thời gian</th><th>Hướng</th><th>Sự kiện</th><th>Entity</th><th>Trạng thái</th><th>Lỗi</th></tr></thead><tbody>'+q.slice(0,300).map(x=>'<tr><td>'+esc(fmtDT(x.CreatedAt))+'</td><td>'+esc(x.Direction)+'</td><td>'+esc(x.EventType)+'</td><td>'+esc(x.EntityType+' '+x.EntityID)+'</td><td>'+badge(x.Status||'')+'</td><td>'+esc(x.LastError||'')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">Chưa có sự kiện đồng bộ.</div>')+'</div>';
}

function portalBridgePage(){
  const cfg=GoogleSheetsConnector.getConfig(),bridge=cfg.bridgeUrl;
  return '<div class="card"><h2>Cầu nối dữ liệu hai ứng dụng</h2>'+
    '<div class="portal-card"><b>App Y tế VK</b><div class="muted">Nguồn dữ liệu nghiệp vụ chính: Student / Enrollment / y tế / ATTP / Audit.</div></div>'+
    '<div class="portal-card"><b>Vành Khuyên School Health v2</b><div class="muted">Cổng phụ huynh, giáo viên/lớp và thông tin trường học.</div></div>'+
    '<div class="notice '+(bridge?'ok':'')+'"><b>Bridge:</b> '+(bridge?'đã có URL cấu hình trên trình duyệt này.':'mã bridge đã chuẩn bị nhưng Web App chưa được deploy/nhập URL, nên đồng bộ server-to-server chưa chạy.')+'</div>'+
    '<div class="toolbar"><a class="btn soft" href="'+VANH_KHUYEN_URL+'" target="_blank" rel="noopener" style="text-decoration:none">Mở Vành Khuyên</a><button class="btn soft" onclick="openSetup()">Cấu hình Bridge</button><button class="btn primary" onclick="queuePortalRefresh()">Xếp hàng đồng bộ projection</button></div>'+
    '<div class="attp-law"><b>Phạm vi chia sẻ:</b> StudentID, Enrollment, lớp, tên/ngày sinh/giới tính và các chỉ số sức khỏe tối thiểu được duyệt. Toa thuốc, hồ sơ bệnh chi tiết, chứng từ và dữ liệu ATTP không được đẩy sang cổng phụ huynh.</div></div>';
}

async function queuePortalRefresh(){
  const now=new Date().toISOString(),id='Q-'+Date.now();
  const payload={schema:'portal-projection-v2',source:'APP_Y_TE_VK',target:'VANH_KHUYEN_V2',requestedBy:state.user?.email||'',at:now};
  try{
    await GoogleSheetsConnector.appendRows('IntegrationQueue!A:L',[[
      id,now,'OUTBOUND','PORTAL_PROJECTION_REFRESH','PortalProjection','ALL',JSON.stringify(payload),'PENDING','0','','',now
    ]]);
    GoogleSheetsConnector.appendAudit('PORTAL_SYNC_QUEUE','IntegrationQueue',id,'Vanh Khuyen projection refresh').catch(()=>{});
    await refresh(['IntegrationQueue']);
    alert('Đã tạo yêu cầu đồng bộ. Bridge sẽ xử lý khi endpoint server-to-server được bật.');
  }catch(e){alert(e.message||e)}
}
