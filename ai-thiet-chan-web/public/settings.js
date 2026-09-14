(()=>{
  const STORAGE_KEY='aiThietChanDefaultMode';
  const dialog=document.getElementById('settingsDialog');
  const openBtn=document.getElementById('settingsBtn');
  const closeBtn=document.getElementById('settingsCloseBtn');
  const normalSetting=document.getElementById('settingsNormalMode');
  const generalSetting=document.getElementById('settingsGeneralMode');
  const normalMode=document.getElementById('normalModeBtn');
  const generalMode=document.getElementById('generalModeBtn');
  const aiState=document.getElementById('settingsAiState');
  const storeState=document.getElementById('settingsStoreState');
  const versionState=document.getElementById('settingsVersion');
  if(!dialog||!openBtn||!normalSetting||!generalSetting) return;

  function readMode(){
    try{return localStorage.getItem(STORAGE_KEY)==='general'?'general':'normal';}catch{return 'normal';}
  }
  function saveMode(mode){try{localStorage.setItem(STORAGE_KEY,mode);}catch{}}
  function paint(mode){
    normalSetting.classList.toggle('active',mode==='normal');
    generalSetting.classList.toggle('active',mode==='general');
    normalSetting.setAttribute('aria-pressed',String(mode==='normal'));
    generalSetting.setAttribute('aria-pressed',String(mode==='general'));
  }
  function applyMode(mode){
    saveMode(mode);paint(mode);
    const target=mode==='general'?generalMode:normalMode;
    if(target&&!target.classList.contains('active')) target.click();
  }
  async function refreshStatus(){
    try{
      const r=await fetch('/api/health',{cache:'no-store'});const d=await r.json();
      if(!r.ok||!d.ok) throw new Error('health');
      if(aiState) aiState.textContent=d.providerConfigured?'Gemini máy chủ · sẵn sàng':'Chưa cấu hình';
      if(storeState) storeState.textContent=d.caseCollection?.storeReady?'Tự động · sẵn sàng':'Đang kết nối';
      if(versionState) versionState.textContent=d.version||'—';
    }catch{
      if(aiState) aiState.textContent='Không kiểm tra được';
      if(storeState) storeState.textContent='Không kiểm tra được';
    }
  }
  function open(){paint(readMode());refreshStatus();if(typeof dialog.showModal==='function') dialog.showModal();else dialog.setAttribute('open','');}
  function close(){if(typeof dialog.close==='function') dialog.close();else dialog.removeAttribute('open');}

  openBtn.addEventListener('click',open);
  closeBtn?.addEventListener('click',close);
  normalSetting.addEventListener('click',()=>applyMode('normal'));
  generalSetting.addEventListener('click',()=>applyMode('general'));
  dialog.addEventListener('click',e=>{if(e.target===dialog) close();});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});

  const initial=readMode();paint(initial);
  queueMicrotask(()=>applyMode(initial));
})();
