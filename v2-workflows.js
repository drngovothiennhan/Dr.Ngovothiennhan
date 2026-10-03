
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

async function openNewUser(){
  if(state.role!=='ADMIN')return;
  await ensure(['Users'],false);
  document.getElementById('recordTitle').textContent='Tạo người dùng';
  document.getElementById('recordSub').textContent='Bridge mode không cần Writer trực tiếp. Direct mode sẽ cấp quyền Master tương ứng.';
  document.getElementById('recordBody').innerHTML=
    '<div class="formgrid">'+
    '<div class="field wide"><label>Email Google *</label><input id="nuEmail"></div>'+
    '<div class="field"><label>Họ tên</label><input id="nuName"></div>'+
    '<div class="field"><label>Vai trò</label><select id="nuRole"><option>NVYT</option><option>ATTP</option><option>VIEWER</option><option>ADMIN</option></select></div>'+
    '<div class="field wide"><label>Ghi chú</label><input id="nuNote"></div>'+
    '</div><div id="recMsg"></div><div class="actions"><button class="btn soft" onclick="closeRecord()">Hủy</button><button class="btn primary" onclick="saveNewUser()">Tạo tài khoản</button></div>';
  document.getElementById('recordModal').classList.add('open');
}

async function saveNewUser(){
  const msg=document.getElementById('recMsg');
  const email=document.getElementById('nuEmail').value.trim().toLowerCase();
  const role=document.getElementById('nuRole').value;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){msg.innerHTML='<div class="notice red">Email không hợp lệ.</div>';return}
  if(objs('Users').some(x=>String(x.Email||'').toLowerCase()===email)){msg.innerHTML='<div class="notice red">Email đã tồn tại.</div>';return}
  try{
    msg.innerHTML='<div class="notice">Đang tạo user…</div>';
    if(!GoogleSheetsConnector.useBridge())await GoogleSheetsConnector.grantMasterAccess(email,role==='VIEWER'?'reader':'writer');
    await GoogleSheetsConnector.appendRows('Users!A:G',[[
      email,role,'ACTIVE',document.getElementById('nuName').value,new Date().toISOString(),
      state.user?.email||'ADMIN',document.getElementById('nuNote').value
    ]]);
    GoogleSheetsConnector.appendAudit('CREATE_USER_V2','User',email,'Role='+role).catch(()=>{});
    closeRecord();
    await refresh(['Users']);
  }catch(e){msg.innerHTML='<div class="notice red">'+esc(e.message||e)+'</div>'}
}
