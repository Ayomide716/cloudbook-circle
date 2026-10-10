import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

interface PostContentProps {
  content: string;
}

const PostContent = ({ content }: PostContentProps) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  // Only offer "See more" when the text really is cut off.
  useLayoutEffect(() => {
    const el = textRef.current;
    if (el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [content, expanded]);

  // Parse content and render hashtags and mentions as clickable links
  const parseContent = (text: string) => {
    // Regex patterns for hashtags and mentions
    const hashtagPattern = /#(\w+)/g;
    const mentionPattern = /@(\w+)/g;
    
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    
    // Combined pattern to find links, hashtags and mentions (a link is matched whole, so a
    // "#" inside it isn't taken for a hashtag)
    const combinedPattern = /(https?:\/\/[^\s<>"]+|#\w+|@\w+)/gi;
    let match;
    
    while ((match = combinedPattern.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      
      const matchedText = match[0];
      const key = `${match.index}-${matchedText}`;
      
      if (/^https?:\/\//i.test(matchedText)) {
        // Link: opens in a new tab; punctuation right after it stays as text
        const url = matchedText.replace(/[.,!?;:)\]}'"]+$/, "");
        parts.push(
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="text-primary hover:underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {url}
          </a>
        );
        if (url.length < matchedText.length) parts.push(matchedText.slice(url.length));
      } else if (matchedText.startsWith('#')) {
        // Hashtag
        parts.push(
          <Link
            key={key}
            to={`/explore?q=${encodeURIComponent(matchedText)}`}
            className="text-primary hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {matchedText}
          </Link>
        );
      } else if (matchedText.startsWith('@')) {
        // Mention
        const username = matchedText.slice(1);
        parts.push(
          <Link
            key={key}
            to={`/explore?q=${encodeURIComponent(username)}`}
            className="text-primary hover:underline font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {matchedText}
          </Link>
        );
      }
      
      lastIndex = match.index + matchedText.length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : text;
  };

  return (
    <div className="mt-2.5">
      <p
        ref={textRef}
        className="text-[14px] leading-snug sm:text-base whitespace-pre-wrap break-words"
        // Long posts start folded at 6 lines, as on Facebook.
        style={expanded ? undefined : { display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {parseContent(content)}
      </p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
          className="mt-0.5 text-[14px] font-semibold text-muted-foreground hover:underline sm:text-base"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
};

export default PostContent;
