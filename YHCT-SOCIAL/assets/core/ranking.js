function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
export function scorePost(post, now=Date.now()) {
  const age = Math.max(0, now - Number(post.createdAt || 0));
  const recency = Math.max(0, 40 - age / 3600000);
  const engagement = Math.log1p(Number(post.likes || 0) * 2 + Number(post.comments || 0) * 3) * 8;
  const expertise = clamp(Number(post.authorExpertise || 0),0,10) * 3;
  const follow = post.followedAuthor ? 18 : 0;
  const accepted = Number(post.acceptedAnswers || 0) * 4;
  return recency + engagement + expertise + follow + accepted;
}
export function rankFeed(posts, now=Date.now()) {
  return [...posts].sort((a,b)=>scorePost(b,now)-scorePost(a,now));
}
export function rankTrending(posts) {
  return [...posts].sort((a,b)=>((b.likes||0)+(b.comments?.length||b.comments||0)*2)-((a.likes||0)+(a.comments?.length||a.comments||0)*2));
}
