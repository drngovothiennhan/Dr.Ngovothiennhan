const CAPABILITIES={
  MEMBER:new Set(['post:create','comment:create','profile:update','message:send']),
  MOD:new Set(['post:create','comment:create','profile:update','message:send','moderation:write','thread:pin','operator:mod']),
  SUPER_MOD:new Set(['post:create','comment:create','profile:update','message:send','moderation:write','thread:pin','member:support','operator:mod','operator:super']),
  ADMIN:new Set(['post:create','comment:create','profile:update','message:send','moderation:write','thread:pin','member:support','operator:mod','operator:super','admin:operate','feature:write','ui:theme','role:manage','member:manage','system:backup','system:restore'])
};
const VALID_ROLES=new Set(Object.keys(CAPABILITIES));
export function createAuthSession(input={}){const role=String(input.role||'MEMBER').toUpperCase();return{id:String(input.id||input.mssv||''),mssv:String(input.mssv||input.id||''),name:String(input.name||'Hội viên YHCT'),faculty:String(input.faculty||''),position:String(input.position||'Thành viên'),role:VALID_ROLES.has(role)?role:'MEMBER',authenticated:Boolean(input.id||input.mssv),mustChangePassword:Boolean(input.mustChangePassword),issuedAt:input.issuedAt||Date.now()};}
export function authenticateMember({mssv,password,directory=[]}={}){const id=String(mssv||'').trim();const secret=String(password||'');const member=directory.find(x=>String(x.mssv)===id);if(!member||secret!==id)throw new Error('invalid_credentials');return createAuthSession({...member,authenticated:true,mustChangePassword:true,issuedAt:Date.now()});}
export function can(session,capability){return Boolean(CAPABILITIES[session?.role]?.has(capability));}
export function requireRole(session,roles=[]){const allow=roles.map(x=>String(x).toUpperCase());if(!session?.authenticated||!allow.includes(session.role))throw new Error('forbidden');return session;}
export function operatorMode(session){if(session?.role==='SUPER_MOD')return'SUPER_MOD';if(session?.role==='MOD')return'MOD';return null;}
export function roleLabel(role){return({ADMIN:'Chủ nhiệm · ADMIN',SUPER_MOD:'Phó chủ nhiệm · SUPER MOD',MOD:'Ban quản lý · MOD',MEMBER:'Thành viên'}[String(role||'').toUpperCase()]||'Thành viên');}
