import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<>"]+)/gi;

/** Text with its web links tappable (opening in a new tab). Trailing punctuation stays text. */
const LinkedText = ({ text, className }: { text: string; className?: string }) => (
  <>
    {text.split(URL_RE).map((part, i) => {
      if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
      const url = part.replace(/[.,!?;:)\]}'"]+$/, "");
      return (
        <Fragment key={i}>
          <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className={`break-all ${className ?? ""}`} onClick={(e) => e.stopPropagation()}>
            {url}
          </a>
          {part.slice(url.length)}
        </Fragment>
      );
    })}
  </>
);

export default LinkedText;
