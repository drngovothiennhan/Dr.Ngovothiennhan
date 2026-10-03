
async function openNewStudent(){
  await ensure(['Students','Enrollments','Classes'],false);
  document.getElementById('recordTitle').textContent='Thêm học sinh';
  document.getElementById('recordSub').textContent='Tạo StudentID và Enrollment năm học hiện tại trong cùng thao tác.';
  document.getElementById('recordBody').innerHTML=
    '<div class="formgrid">'+
    '<div class="field wide"><label>Họ và tên *</label><input id="nsName"></div>'+
    '<div class="field"><label>Ngày sinh</label><input id="nsDob" type="date"></div>'+
    '<div class="field"><label>Giới tính</label><select id="nsGender"><option></option><option>Nam</option><option>Nữ</option></select></div>'+
    '<div class="field"><label>Lớp hiện tại</label><input id="nsClass" list="classListV2"></div>'+
    '<div class="field"><label>Mã định danh/CCCD</label><input id="nsNid"></div>'+
    '<div class="field"><label>Phụ huynh</label><input id="nsGuardian"></div>'+
    '<div class="field"><label>Điện thoại</label><input id="nsPhone"></div>'+
    '<div class="field wide"><label>Địa chỉ</label><input id="nsAddress"></div>'+
    '<div class="field wide"><label>Lưu ý sức khỏe</label><textarea id="nsHealth"></textarea></div>'+
    '</div><datalist id="classListV2">'+objs('Classes').map(x=>'<option value="'+esc(x.ClassName)+'">').join('')+'</datalist>'+
    '<div id="recMsg"></div><div class="actions"><button class="btn soft" onclick="closeRecord()">Hủy</button><button class="btn primary" onclick="saveNewStudent()">Tạo hồ sơ</button></div>';
  document.getElementById('recordModal').classList.add('open');
}

async function saveNewStudent(){
  const msg=document.getElementById('recMsg');
  const name=document.getElementById('nsName').value.trim();
  if(!name){msg.innerHTML='<div class="notice red">Họ tên là bắt buộc.</div>';return}
  const nid=document.getElementById('nsNid').value.trim();
  const dob=document.getElementById('nsDob').value;
  const gender=document.getElementById('nsGender').value;
  const cls=document.getElementById('nsClass').value.trim();
  const key=nid?norm(nid):[norm(name),dob,norm(gender)].join('|');
  const duplicate=objs('Students').some(s=>
    (nid&&norm(s.NationalID)===norm(nid))||
    (!nid&&[norm(s.FullName),String(s.DOB||''),norm(s.Gender)].join('|')===key)
  );
  if(duplicate){msg.innerHTML='<div class="notice red">Có hồ sơ trùng định danh hoặc họ tên + ngày sinh + giới tính. Hãy mở hồ sơ hiện có.</div>';return}
  const studentId=nid?'STU-'+nid.replace(/\D/g,''):'STU-'+Date.now();
  const now=new Date().toISOString();
  const sh=(state.data.Students||[])[0]||[],eh=(state.data.Enrollments||[])[0]||[];
  const sm={
    StudentID:studentId,FullName:name,DOB:dob,Gender:gender,Class:cls,
    GuardianName:document.getElementById('nsGuardian').value,
    GuardianPhone:document.getElementById('nsPhone').value,BHYT:'',NationalID:nid,
    Address:document.getElementById('nsAddress').value,HealthNotes:document.getElementById('nsHealth').value,
    Status:'ACTIVE',Source:'APP_V2_MANUAL',UpdatedAt:now
  };
  const classObj=objs('Classes').find(x=>norm(x.ClassName)===norm(cls));
  const em={
    EnrollmentID:'ENR-'+studentId.replace(/^STU-/,''),
    StudentID:studentId,SchoolYearID:'SY-2026-2027',ClassID:classObj?.ClassID||'',
    ClassNameSnapshot:cls,Status:'ACTIVE',StartDate:today(),EndDate:'',
    Source:'APP_V2_MANUAL',UpdatedAt:now
  };
  try{
    msg.innerHTML='<div class="notice">Đang tạo Student + Enrollment…</div>';
    await GoogleSheetsConnector.appendRows('Students!A:'+colLetter(sh.length),[sh.map(x=>sm[x]??'')]);
    await GoogleSheetsConnector.appendRows('Enrollments!A:'+colLetter(eh.length),[eh.map(x=>em[x]??'')]);
    GoogleSheetsConnector.appendAudit('CREATE_STUDENT_V2','Student',studentId,'Student + Enrollment').catch(()=>{});
    closeRecord();
    await refresh(['Students','Enrollments']);
  }catch(e){msg.innerHTML='<div class="notice red">'+esc(e.message||e)+'</div>'}
}


function openNewUser(){
  if(state.role!=='ADMIN')return;
  document.getElementById('recordTitle').textContent='Tạo tài khoản';
  document.getElementById('recordSub').textContent='Hệ thống sẽ cấp mật khẩu tạm; người dùng đổi mật khẩu ở lần đăng nhập đầu.';
  document.getElementById('recordBody').innerHTML=
    '<div class="formgrid">'+
    '<div class="field"><label>Tên đăng nhập * (chữ thường, số)</label><input id="nuUser" autocapitalize="none" placeholder="vd: lan"></div>'+
    '<div class="field"><label>Họ tên</label><input id="nuName"></div>'+
    '<div class="field"><label>Vai trò</label><select id="nuRole"><option value="NVYT">NVYT – nhân viên y tế</option><option value="ATTP">ATTP – bếp/kiểm thực</option><option value="VIEWER">VIEWER – chỉ xem</option><option value="ADMIN">ADMIN – quản trị</option></select></div>'+
    '</div><div id="recMsg"></div><div class="actions"><button class="btn soft" onclick="closeRecord()">Hủy</button><button class="btn primary" onclick="saveNewUser()">Tạo tài khoản</button></div>';
  document.getElementById('recordModal').classList.add('open');
}
function showTempPw(title,username,pw){
  document.getElementById('recordTitle').textContent=title;document.getElementById('recordSub').textContent='';
  document.getElementById('recordBody').innerHTML='<div class="notice ok"><div>Tên đăng nhập: <b>'+esc(username)+'</b></div><div>Mật khẩu tạm: <b style="font-size:20px;letter-spacing:1px;user-select:all">'+esc(pw)+'</b></div></div><div class="muted">Hãy gửi cho người dùng ngay — mật khẩu này chỉ hiện một lần. Họ sẽ được yêu cầu đổi khi đăng nhập.</div><div class="actions"><button class="btn primary" onclick="closeRecord()">Đã ghi lại</button></div>';
  document.getElementById('recordModal').classList.add('open');
}
async function saveNewUser(){
  const msg=document.getElementById('recMsg'),u=document.getElementById('nuUser').value.trim().toLowerCase();
  try{
    msg.innerHTML='<div class="notice">Đang tạo…</div>';
    const r=await GoogleSheetsConnector.admin('createUser',{username:u,name:document.getElementById('nuName').value.trim(),role:document.getElementById('nuRole').value});
    GoogleSheetsConnector.appendAudit('CREATE_USER','User',u,'Role='+document.getElementById('nuRole').value).catch(()=>{});
    showTempPw('Đã tạo tài khoản',r.username,r.tempPassword);await refresh(['Users']);
  }catch(e){msg.innerHTML='<div class="notice red">'+esc(e.message||e)+'</div>'}
}
async function resetUserPw(u){
  if(!confirm('Đặt lại mật khẩu cho "'+u+'"? Người này sẽ bị đăng xuất.'))return;
  try{const r=await GoogleSheetsConnector.admin('resetPassword',{username:u});GoogleSheetsConnector.appendAudit('RESET_PASSWORD','User',u,'').catch(()=>{});showTempPw('Mật khẩu tạm mới',r.username,r.tempPassword)}catch(e){alert(e.message)}
}
async function toggleUser(u,status){
  try{await GoogleSheetsConnector.admin('setUser',{username:u,status});GoogleSheetsConnector.appendAudit('SET_USER','User',u,status).catch(()=>{});await refresh(['Users'])}catch(e){alert(e.message)}
}
async function changeUserRole(u,role){
  try{await GoogleSheetsConnector.admin('setUser',{username:u,role});GoogleSheetsConnector.appendAudit('SET_USER','User',u,'Role='+role).catch(()=>{});await refresh(['Users'])}catch(e){alert(e.message);await refresh(['Users'])}
}
async function runHealth(){
  const box=document.getElementById('healthBox');if(!box)return;box.innerHTML='<div class="muted">Đang kiểm tra…</div>';
  try{const d=await GoogleSheetsConnector.healthCheck();box.innerHTML=(d.allOk?'<div class="notice ok">Hệ thống hoạt động bình thường.</div>':'<div class="notice red">Có mục cần xử lý.</div>')+d.checks.map(c=>'<div class="row"><div class="grow"><b>'+esc(c.check)+'</b><div class="muted">'+esc(c.msg||'')+'</div></div>'+badge(c.ok?'OK':'LỖI',c.ok?'':'red')+'</div>').join('')}catch(e){box.innerHTML='<div class="notice red">'+esc(e.message)+'</div>'}
}

const fileKey=d=>{const v=d.FileID||d.DriveFileID||d.DriveID||Object.values(d)[4]||'';return String(v).startsWith('files/')?v:''};
recordsPage=function(){
  ensure(['Documents'],false);
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Hộp chứng từ</h2><div class="muted">Toa thuốc · hóa đơn · phiếu giao hàng · ảnh lưu mẫu.</div></div>'+(canWrite('Documents')?'<button class="btn primary" onclick="openDocumentUpload()">+ Tải file</button>':'')+'</div>'+
    '<div class="table"><table><thead><tr><th>Ngày</th><th>Loại</th><th>File</th><th>Ghi chú</th></tr></thead><tbody>'+
    objs('Documents').slice().reverse().slice(0,300).map(d=>'<tr><td>'+esc(String(d.CapturedAt||'').slice(0,10))+'</td><td>'+esc(d.DocumentType)+'</td><td>'+(fileKey(d)?'<a class="link" href="/api/file?id='+encodeURIComponent(fileKey(d))+'">'+esc(d.FileName||'Mở file')+' ↗</a>':esc(d.FileName||''))+'</td><td>'+esc(d.Notes||d.Note||'')+'</td></tr>').join('')+'</tbody></table></div></div>';
};
adminPage=function(){
  ensure(['Users','AuditLog'],false);
  const me=state.user?.username;
  return '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Tài khoản người dùng</h2><div class="muted">Mỗi người một tài khoản. Nên giữ tối đa khoảng 10 người.</div></div><button class="btn primary mini" onclick="openNewUser()">+ Tài khoản</button></div>'+
    objs('Users').map(u=>{const on=String(u.Status).toUpperCase()==='ACTIVE';return'<div class="row"><div class="grow"><b>'+esc(u.DisplayName||u.Email)+'</b> <span class="muted">('+esc(u.Email)+')</span><div class="muted">'+(on?'Đang hoạt động':'Đã khóa')+'</div></div>'+
      '<select onchange="changeUserRole(\''+esc(u.Email)+'\',this.value)">'+['ADMIN','NVYT','ATTP','VIEWER'].map(r=>'<option '+(r===u.Role?'selected':'')+'>'+r+'</option>').join('')+'</select> '+
      '<button class="btn soft mini" onclick="resetUserPw(\''+esc(u.Email)+'\')">Đặt lại MK</button> '+
      (u.Email===me?'':'<button class="btn '+(on?'danger':'soft')+' mini" onclick="toggleUser(\''+esc(u.Email)+'\',\''+(on?'DISABLED':'ACTIVE')+'\')">'+(on?'Khóa':'Mở khóa')+'</button>')+'</div>'}).join('')+'</div>'+
    '<div class="card"><div class="row"><div class="grow"><h2 style="margin:0">Tình trạng hệ thống</h2></div><button class="btn soft mini" onclick="runHealth()">Kiểm tra ngay</button></div><div id="healthBox" class="muted">Bấm "Kiểm tra ngay".</div></div>';
};
