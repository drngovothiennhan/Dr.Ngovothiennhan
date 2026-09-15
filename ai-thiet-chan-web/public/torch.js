(()=>{
  const mediaDevices=navigator.mediaDevices;
  if(!mediaDevices?.getUserMedia) return;

  const nativeGetUserMedia=mediaDevices.getUserMedia.bind(mediaDevices);
  let currentTrack=null;
  let currentFacing='';
  let torchSupported=false;
  let torchEnabled=false;

  const $=id=>document.getElementById(id);
  const requestedFacing=constraints=>{
    const facing=constraints?.video?.facingMode;
    if(typeof facing==='string') return facing;
    if(facing&&typeof facing==='object') return facing.exact||facing.ideal||'';
    return '';
  };
  const button=()=>$('toggleTorchBtn');
  const updateButton=()=>{
    const btn=button();
    if(!btn) return;
    const rear=currentFacing==='environment';
    btn.hidden=!(rear&&torchSupported&&currentTrack?.readyState==='live');
    btn.textContent=torchEnabled?'Tắt đèn':'Bật đèn';
    btn.setAttribute('aria-pressed',String(torchEnabled));
  };
  const resetState=()=>{
    currentTrack=null;currentFacing='';torchSupported=false;torchEnabled=false;updateButton();
  };
  const detectTrack=(stream,constraints)=>{
    const track=stream?.getVideoTracks?.()[0]||null;
    currentTrack=track;
    const settings=track?.getSettings?.()||{};
    currentFacing=settings.facingMode||requestedFacing(constraints)||'';
    try{torchSupported=Boolean(track?.getCapabilities?.()?.torch);}catch{torchSupported=false;}
    torchEnabled=false;
    track?.addEventListener?.('ended',()=>{if(currentTrack===track)resetState();},{once:true});
    updateButton();
  };
  async function setTorch(enabled){
    const track=currentTrack;
    if(!track||track.readyState!=='live'||currentFacing!=='environment'||!torchSupported) return false;
    try{
      await track.applyConstraints({advanced:[{torch:Boolean(enabled)}]});
      torchEnabled=Boolean(enabled);updateButton();return true;
    }catch{
      torchEnabled=false;updateButton();return false;
    }
  }
  async function turnOff(){
    if(torchEnabled) await setTorch(false);
    torchEnabled=false;updateButton();
  }

  mediaDevices.getUserMedia=async constraints=>{
    await turnOff();
    const stream=await nativeGetUserMedia(constraints);
    detectTrack(stream,constraints);
    return stream;
  };

  window.addEventListener('DOMContentLoaded',()=>{
    button()?.addEventListener('click',async()=>{await setTorch(!torchEnabled);});
    for(const id of ['closeCameraBtn','captureBtn','switchCameraBtn']) $(id)?.addEventListener('click',()=>{void turnOff();},true);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)void turnOff();});
    updateButton();
  });
})();
