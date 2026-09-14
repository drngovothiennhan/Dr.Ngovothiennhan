const nativeFetch=globalThis.fetch?.bind(globalThis);
if(nativeFetch){
  globalThis.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||String(input||'');
    const timeoutMs=url.includes('generativelanguage.googleapis.com')?45_000:url.includes('.supabase.co')?15_000:0;
    if(!timeoutMs||init?.signal) return nativeFetch(input,init);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await nativeFetch(input,{...init,signal:controller.signal});}
    catch(err){
      if(err?.name==='AbortError'){
        const timeoutError=new Error('UPSTREAM_TIMEOUT');
        timeoutError.status=504;
        throw timeoutError;
      }
      throw err;
    }finally{clearTimeout(timer);}
  };
}
