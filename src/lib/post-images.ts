/** Every photo on a post, in order. Older posts only have `image_url`. */
export function postImages(post: { image_url?: string | null; image_urls?: string[] | null }): string[] {
  if (post.image_urls && post.image_urls.length > 0) return post.image_urls;
  return post.image_url ? [post.image_url] : [];
}
