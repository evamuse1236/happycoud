/** Related archive comments are context, never invented conversation replies. */
export function relatedComments(comment, comments, limit = 3) {
  const thread = new Set([comment.id, ...comment.conversation.map(c => String(c.id))]);
  return comments.filter(c => !thread.has(c.id) && (
    (comment.postUrl && c.postUrl === comment.postUrl) || (comment.author && c.author === comment.author)
  )).sort((a,b) => Number(b.postUrl === comment.postUrl) - Number(a.postUrl === comment.postUrl)).slice(0,limit);
}
