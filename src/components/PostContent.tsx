import { Link } from "react-router-dom";

interface PostContentProps {
  content: string;
}

const PostContent = ({ content }: PostContentProps) => {
  // Parse content and render hashtags and mentions as clickable links
  const parseContent = (text: string) => {
    // Regex patterns for hashtags and mentions
    const hashtagPattern = /#(\w+)/g;
    const mentionPattern = /@(\w+)/g;
    
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    
    // Combined pattern to find both hashtags and mentions
    const combinedPattern = /(#\w+|@\w+)/g;
    let match;
    
    while ((match = combinedPattern.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      
      const matchedText = match[0];
      const key = `${match.index}-${matchedText}`;
      
      if (matchedText.startsWith('#')) {
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
    <p className="mt-3 text-sm sm:text-base whitespace-pre-wrap break-words">
      {parseContent(content)}
    </p>
  );
};

export default PostContent;
