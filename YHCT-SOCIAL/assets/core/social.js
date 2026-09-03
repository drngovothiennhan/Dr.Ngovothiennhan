export const COMMENT_PREVIEW_LIMIT = 3;
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MEDIA = new Set(['image/jpeg','image/png','image/webp']);

export function previewComments(comments = [], expanded = false) {
  const list = Array.isArray(comments) ? comments : [];
  return expanded ? [...list] : list.slice(-COMMENT_PREVIEW_LIMIT);
}

export function validateMedia(file) {
  if (!file) return {ok:true, reason:null};
  if (!ACCEPTED_MEDIA.has(file.type)) return {ok:false, reason:'unsupported_type'};
  if (file.size > MAX_MEDIA_BYTES) return {ok:false, reason:'too_large'};
  return {ok:true, reason:null};
}

export function toggleSetItem(items = [], id) {
  const set = new Set(items);
  set.has(id) ? set.delete(id) : set.add(id);
  return [...set];
}

export function toggleReaction(reactions = {}, postId, reaction) {
  const next = {...reactions};
  if (next[postId] === reaction) delete next[postId];
  else next[postId] = reaction;
  return next;
}

export function createPost({id, authorId, authorName, body, topic='Cộng đồng', createdAt=Date.now(), media=null}) {
  const clean = String(body ?? '').trim();
  if (!clean && !media) throw new Error('post_empty');
  return {id, authorId, authorName, body:clean, topic, createdAt, media, likes:0, comments:[], authorExpertise:1};
}

export function addComment(post, comment) {
  if (!post || !comment) throw new Error('invalid_comment');
  return {...post, comments:[...(post.comments || []), comment]};
}
