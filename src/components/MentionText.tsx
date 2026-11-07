import { Fragment } from "react";
import { Link } from "react-router-dom";
import { MENTION_RE } from "@/lib/mentions";

/** Text with saved @mentions shown as the person's name, linking to their profile (comments). */
const MentionText = ({ text }: { text: string }) => {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(MENTION_RE.source, "g"))) {
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <Link key={at} to={`/profile/${m[2]}`} className="font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
        {m[1]}
      </Link>
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
};

export default MentionText;
