export function mergeNotifications(existing=[], incoming=[]){
  const byId=new Map();
  for(const item of existing) byId.set(item.id,{...item});
  for(const item of incoming) byId.set(item.id,{...byId.get(item.id),...item});
  return [...byId.values()].sort((a,b)=>(b.at||0)-(a.at||0) || String(b.id).localeCompare(String(a.id)));
}
export function markAllRead(items=[]){ return items.map(x=>({...x,read:true})); }
export function unreadCount(items=[]){ return items.filter(x=>!x.read).length; }
