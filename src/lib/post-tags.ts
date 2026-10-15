/**
 * Friends tagged in posts ("Ayo is with Tolu and 2 others"). Cards ask one at a time; the asks
 * made together are sent as one query, and answers are kept for the visit.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PostTag {
  id: string;
  full_name: string | null;
}

const cache = new Map<string, PostTag[]>();
const waiting = new Map<string, ((tags: PostTag[]) => void)[]>();
let timer: number | undefined;

async function flush() {
  timer = undefined;
  const ids = [...waiting.keys()];
  const found = new Map<string, PostTag[]>(ids.map((id) => [id, []]));
  const { data: rows, error } = await supabase.from("post_tags").select("post_id, user_id").in("post_id", ids);
  if (!error && rows?.length) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", [...new Set(rows.map((r) => r.user_id))]);
    const byId = new Map((people ?? []).map((p) => [p.id, p]));
    for (const r of rows) {
      const p = byId.get(r.user_id);
      if (p) found.get(r.post_id)!.push(p);
    }
  }
  for (const id of ids) {
    const tags = found.get(id) ?? [];
    cache.set(id, tags);
    waiting.get(id)?.forEach((done) => done(tags));
    waiting.delete(id);
  }
}

export function loadPostTags(postId: string): Promise<PostTag[]> {
  const known = cache.get(postId);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    waiting.set(postId, [...(waiting.get(postId) ?? []), resolve]);
    timer ??= window.setTimeout(() => void flush(), 30);
  });
}

/** Tags saved with a new post: shown at once, without asking the database again. */
export function rememberPostTags(postId: string, tags: PostTag[]) {
  cache.set(postId, tags);
}

export function usePostTags(postId: string): PostTag[] {
  const [tags, setTags] = useState<PostTag[]>(() => cache.get(postId) ?? []);
  useEffect(() => {
    let live = true;
    void loadPostTags(postId).then((t) => live && setTags(t));
    return () => { live = false; };
  }, [postId]);
  return tags;
}
