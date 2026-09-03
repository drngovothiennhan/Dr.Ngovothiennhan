const blocked=new Set(['email','phone','freeText','medicalText','fullName','address']);
export function sanitizeResearchPayload(payload={}){
  return Object.fromEntries(Object.entries(payload).filter(([k,v])=>!blocked.has(k)&&['string','number','boolean'].includes(typeof v)).map(([k,v])=>[k,typeof v==='string'?v.slice(0,64):v]));
}
export function buildResearchEvent(name,payload={},at=Date.now()){
  return {schemaVersion:1,name:String(name),at,payload:sanitizeResearchPayload(payload)};
}
