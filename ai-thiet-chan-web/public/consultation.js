(()=>{
  const $=id=>document.getElementById(id);
  const form=$('chatForm'),input=$('chatInput'),log=$('chatLog'),startBtn=$('startInquiryBtn'),progress=$('inquiryProgress'),resultCard=$('resultCard');
  const historyToggle=$('toggleHistoryBtn'),historyPanel=$('historyPanel');

  if(historyToggle&&historyPanel){
    historyPanel.hidden=true;
    historyToggle.setAttribute('aria-expanded','false');
    historyToggle.addEventListener('click',()=>{
      const open=historyPanel.hidden;
      historyPanel.hidden=!open;
      historyToggle.textContent=open?'Ẩn lịch sử':'Xem lịch sử';
      historyToggle.setAttribute('aria-expanded',String(open));
    });
  }

  if(!form||!input||!log||!startBtn||!progress) return;

  const questions=[
    {label:'Hàn – nhiệt',text:'1/10 · Hàn – nhiệt: Bạn có sợ lạnh, lạnh tay chân, sốt/nóng trong, hay lúc nóng lúc lạnh không? Khi nào rõ nhất?'},
    {label:'Mồ hôi',text:'2/10 · Mồ hôi: Bạn có tự ra mồ hôi, mồ hôi trộm ban đêm, ra nhiều, ít hoặc không ra mồ hôi không?'},
    {label:'Đầu – thân',text:'3/10 · Đầu – thân: Có đau đầu, chóng mặt, đau mỏi thân thể, đau lưng, nặng người hay tê yếu không? Nêu vị trí và tính chất nếu có.'},
    {label:'Đại – tiểu tiện',text:'4/10 · Đại – tiểu tiện: Đại tiện và tiểu tiện gần đây thế nào: táo/lỏng, số lần, màu; tiểu nhiều/ít, trong/vàng, tiểu đêm hay đau buốt?'},
    {label:'Ăn uống',text:'5/10 · Ăn uống: Ăn ngon không, ăn ít/nhiều, có đầy bụng, ợ, chướng hoặc buồn nôn không? Thích đồ nóng hay lạnh?'},
    {label:'Ngực – sườn – bụng',text:'6/10 · Ngực – sườn – bụng: Có tức ngực, hồi hộp, khó thở, tức hạ sườn, đau bụng hoặc vùng thượng vị không? Có liên quan ăn uống hay cảm xúc không?'},
    {label:'Tai – nghe',text:'7/10 · Tai – nghe: Có ù tai, giảm nghe, cảm giác tai nặng hoặc chóng mặt kèm theo không? Nếu không có, trả lời “không”.'},
    {label:'Khát – nước uống',text:'8/10 · Khát – nước uống: Có khát không, uống nhiều hay ít, thích nước nóng/lạnh, có khô miệng hoặc khô họng không?'},
    {label:'Bệnh cũ – thuốc',text:'9/10 · Bệnh cũ – thuốc: Có bệnh đã biết, đợt tương tự trước đây hoặc thuốc/thực phẩm bổ sung đang dùng không? Nếu có kinh nguyệt và thấy thay đổi liên quan, có thể nêu thêm.'},
    {label:'Khởi phát – diễn tiến',text:'10/10 · Khởi phát – diễn tiến: Triệu chứng bắt đầu khi nào, sau yếu tố gì nếu nhận thấy, và hiện tăng/giảm hoặc thay đổi ra sao?'}
  ];

  const inquiry={active:false,index:0,answers:[],completed:false,transcript:''};
  let pendingFinalPrompt='';
  const nativeFetch=window.fetch.bind(window);

  function bubble(text,who='bot'){
    const div=document.createElement('div');div.className=`bubble ${who}`;div.textContent=text;log.appendChild(div);log.scrollTop=log.scrollHeight;
  }
  function setProgress(){
    if(inquiry.completed) progress.textContent='Đã đủ 10/10 mục';
    else if(inquiry.active) progress.textContent=`Đang hỏi ${Math.min(inquiry.index+1,10)}/10`;
    else progress.textContent='Chưa bắt đầu';
  }
  function resetInquiry(clearLog=false){
    inquiry.active=false;inquiry.index=0;inquiry.answers=[];inquiry.completed=false;inquiry.transcript='';pendingFinalPrompt='';
    startBtn.textContent='Bắt đầu Thập vấn';setProgress();
    if(clearLog){log.innerHTML='';bubble('Sau khi phân tích ảnh lưỡi, nhấn “Bắt đầu Thập vấn”. Tôi sẽ hỏi lần lượt 10 nhóm triệu chứng rồi mới đưa ra nhận định biện chứng có tính chất tham khảo.');}
  }
  function askCurrent(){const q=questions[inquiry.index];if(q)bubble(q.text);setProgress();}
  function transcriptText(){return questions.map((q,i)=>`${i+1}. ${q.label}: ${inquiry.answers[i]||'Không trả lời'}`).join('\n');}
  function finalPrompt(){
    return `[THAP_VAN_CONTEXT]\nĐây là dữ liệu Vấn chẩn theo Thập vấn do chính người dùng trả lời. Chỉ dùng kết quả thiệt chẩn hiện tại do hệ thống gửi kèm, hệ tri thức hiện có và các câu trả lời dưới đây; tuyệt đối không tự thêm triệu chứng hoặc dữ kiện.\n\n${inquiry.transcript}\n\nNHIỆM VỤ: Đưa ra “Nhận định biện chứng tham khảo” ngắn gọn, gồm: (1) dữ kiện thiệt chẩn nhìn thấy; (2) dữ kiện Thập vấn có giá trị đối chiếu; (3) thể/tính chất YHCT phù hợp nhất CHỈ khi hệ tri thức hiện có hỗ trợ; nếu chưa đủ thì ghi rõ chưa đủ căn cứ; (4) dữ kiện còn thiếu hoặc mâu thuẫn. Không chẩn đoán xác định, không kê đơn, không tự thêm mạch chẩn và không thay thế khám/tứ chẩn trực tiếp.`;
  }

  startBtn.addEventListener('click',()=>{
    if(resultCard?.hidden){bubble('Hãy phân tích ảnh lưỡi trước để Thập vấn có thể được đối chiếu với thiệt chẩn hiện tại.');return;}
    inquiry.active=true;inquiry.index=0;inquiry.answers=[];inquiry.completed=false;inquiry.transcript='';pendingFinalPrompt='';
    log.innerHTML='';bubble('Bắt đầu Vấn chẩn theo Thập vấn. Mỗi lần trả lời một mục; nếu không có triệu chứng, bạn có thể trả lời “không”.');
    startBtn.textContent='Bắt đầu lại';askCurrent();input.focus();
  });

  form.addEventListener('submit',ev=>{
    if(!inquiry.active)return;
    const answer=input.value.trim();
    if(!answer){ev.preventDefault();ev.stopImmediatePropagation();return;}
    inquiry.answers[inquiry.index]=answer;
    if(inquiry.index<questions.length-1){
      ev.preventDefault();ev.stopImmediatePropagation();
      input.value='';bubble(answer,'user');inquiry.index+=1;askCurrent();input.focus();return;
    }
    inquiry.transcript=transcriptText();inquiry.active=false;inquiry.completed=true;pendingFinalPrompt=finalPrompt();startBtn.textContent='Vấn chẩn lại';setProgress();
  },true);

  window.fetch=async(inputArg,init={})=>{
    const url=typeof inputArg==='string'?inputArg:inputArg?.url||'';
    const method=String(init?.method||'GET').toUpperCase();
    if(url.includes('/api/chat')&&method==='POST'&&typeof init?.body==='string'){
      try{
        const body=JSON.parse(init.body);
        if(pendingFinalPrompt){body.message=pendingFinalPrompt;pendingFinalPrompt='';}
        else if(inquiry.completed&&inquiry.transcript&&typeof body.message==='string'){
          body.message=`[THAP_VAN_CONTEXT]\nDữ liệu Thập vấn đã hoàn thành:\n${inquiry.transcript}\n\nCâu hỏi tiếp theo của người dùng: ${body.message}\nHãy tiếp tục trả lời dựa trên kết quả thiệt chẩn hiện tại + đúng dữ liệu Thập vấn này; không tự thêm triệu chứng, không chẩn đoán xác định và không kê đơn.`;
        }
        return nativeFetch(inputArg,{...init,body:JSON.stringify(body)});
      }catch{return nativeFetch(inputArg,init);}
    }
    if(url.includes('/api/analyze')&&method==='POST'){
      const response=await nativeFetch(inputArg,init);
      if(response.ok) queueMicrotask(()=>resetInquiry(true));
      return response;
    }
    return nativeFetch(inputArg,init);
  };

  resetInquiry(false);
})();
