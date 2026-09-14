(()=>{
  const nativeFetch=window.fetch.bind(window);
  function deviceClass(){
    const ua=navigator.userAgent||'';
    if(/Android/i.test(ua)) return 'android';
    if(/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if(/Windows/i.test(ua)) return 'windows';
    if(/Macintosh|Mac OS X/i.test(ua)) return 'macos';
    if(/Linux/i.test(ua)) return 'linux';
    return 'other';
  }
  function viewportClass(){const w=Math.max(document.documentElement.clientWidth||0,window.innerWidth||0);return w<600?'mobile':w<1024?'tablet':'desktop';}
  function captureContext(){
    return {
      schemaVersion:'capture-context-v1',
      deviceClass:deviceClass(),
      viewportClass:viewportClass(),
      cameraApi:Boolean(navigator.mediaDevices?.getUserMedia),
      standalone:Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true)
    };
  }
  window.fetch=async(input,init={})=>{
    try{
      const url=typeof input==='string'?input:input?.url||'';
      if(url.includes('/api/analyze')&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
        const body=JSON.parse(init.body);const meta=captureContext();
        body.topQc={...(body.topQc||body.qc||{}),captureContext:meta};
        if(body.mode==='general') body.bottomQc={...(body.bottomQc||{}),captureContext:meta};
        return nativeFetch(input,{...init,body:JSON.stringify(body)});
      }
    }catch{}
    return nativeFetch(input,init);
  };
})();