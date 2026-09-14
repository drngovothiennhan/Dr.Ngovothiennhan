(()=>{
  const $=id=>document.getElementById(id);
  const els={
    total:$('qualityTotal'),general:$('qualityGeneral'),qc:$('qualityQc'),confidence:$('qualityConfidence'),
    dataState:$('qualityDataState'),device:$('qualityDevice'),camera:$('qualityCamera'),pwa:$('qualityPwa'),refresh:$('qualityRefreshBtn')
  };
  if(!els.total) return;
  const pct=n=>`${Math.round(Math.max(0,Math.min(1,Number(n)||0))*100)}%`;
  function deviceClass(){
    const ua=navigator.userAgent||'';
    if(/Android/i.test(ua)) return 'Android';
    if(/iPhone|iPad|iPod/i.test(ua)) return 'iOS/iPadOS';
    if(/Windows/i.test(ua)) return 'Windows';
    if(/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
    if(/Linux/i.test(ua)) return 'Linux';
    return 'Thiết bị khác';
  }
  function renderDevice(){
    els.device.textContent=deviceClass();
    els.camera.textContent=navigator.mediaDevices?.getUserMedia?'Camera API sẵn sàng':'Không có Camera API';
    const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
    els.pwa.textContent=standalone?'Đang chạy dạng ứng dụng':'Đang chạy trong trình duyệt';
  }
  async function load(){
    if(els.refresh) els.refresh.disabled=true;
    try{
      const r=await fetch('/api/cases?limit=100',{cache:'no-store'});const d=await r.json();
      if(!r.ok) throw new Error(d?.error||`HTTP ${r.status}`);
      const cases=Array.isArray(d.cases)?d.cases:[];
      const total=cases.length;
      const general=cases.filter(x=>x.assessment_mode==='general').length;
      const goodTop=cases.filter(x=>x.top_qc_grade==='good').length;
      const qcCandidate=cases.filter(x=>x.top_qc_grade!=='poor'&&(x.assessment_mode!=='general'||x.bottom_qc_grade!=='poor')).length;
      els.total.textContent=String(total);
      els.general.textContent=total?`${general}/${total}`:'0';
      els.qc.textContent=total?pct(goodTop/total):'—';
      els.confidence.textContent=total?pct(qcCandidate/total):'—';
      const metricLabel=els.confidence.closest('.quality-metric')?.querySelector('span');if(metricLabel)metricLabel.textContent='Ca đạt QC tối thiểu';
      els.dataState.textContent=total
        ?`Kho hiện có ${total} ca. ${qcCandidate}/${total} ca đạt bộ lọc QC tối thiểu để xem xét cho dữ liệu huấn luyện. Production hiện chưa có nhãn đồng thuận chuyên gia nên chưa dùng các chỉ số này để khẳng định độ chính xác lâm sàng.`
        :'Kho chưa có ca. Chưa có dữ liệu để đánh giá khả năng máy học.';
      els.dataState.classList.toggle('warn',true);
    }catch{
      els.total.textContent=els.general.textContent=els.qc.textContent=els.confidence.textContent='—';
      els.dataState.textContent='Không tải được thống kê dữ liệu lúc này. Chức năng phân tích chính không bị ảnh hưởng.';
      els.dataState.classList.toggle('warn',true);
    }finally{if(els.refresh)els.refresh.disabled=false;}
  }
  renderDevice();load();
  els.refresh?.addEventListener('click',load);
})();
