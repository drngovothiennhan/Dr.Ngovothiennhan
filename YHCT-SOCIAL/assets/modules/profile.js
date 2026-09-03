export function deriveProfileProgress(stats={}){
  const points=(stats.posts||0)*4+(stats.acceptedAnswers||0)*18+(stats.helpfulReactions||0)+(stats.eventsJoined||0)*5;
  const level=Math.max(1,Math.floor(points/50)+1);
  const badges=[];
  if((stats.posts||0)>=10) badges.push('Người đóng góp');
  if((stats.acceptedAnswers||0)>=3) badges.push('Cố vấn cộng đồng');
  if((stats.helpfulReactions||0)>=50) badges.push('Hữu ích');
  if((stats.eventsJoined||0)>=3) badges.push('Kết nối YHCT');
  return {points,level,badges,nextLevelAt:level*50};
}
export function normalizeProfile(profile={}){
  return {id:profile.id||'',name:String(profile.name||'Hội viên YHCT').trim(),specialty:String(profile.specialty||'Y học cổ truyền').trim(),bio:String(profile.bio||'').slice(0,280)};
}
