export function createCommunityState(){ return {followedTopics:[], acceptedAnswers:{}, reputation:{}, pinnedThreads:[]}; }
export function followTopic(state, topicId){
  const set=new Set(state.followedTopics||[]); set.has(topicId)?set.delete(topicId):set.add(topicId);
  return {...state,followedTopics:[...set]};
}
export function acceptAnswer(state,{threadId,answerId,answerAuthorId}){
  return {...state,acceptedAnswers:{...state.acceptedAnswers,[threadId]:answerId},reputation:{...state.reputation,[answerAuthorId]:(state.reputation?.[answerAuthorId]||0)+10}};
}
export function pinThread(state,threadId){ const s=new Set(state.pinnedThreads||[]); s.add(threadId); return {...state,pinnedThreads:[...s]}; }
export function topicStats(posts, topic){ const list=posts.filter(p=>p.topic===topic); return {posts:list.length,comments:list.reduce((n,p)=>n+(p.comments?.length||0),0)}; }
