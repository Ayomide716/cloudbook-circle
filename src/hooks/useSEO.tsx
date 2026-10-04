import { useEffect } from "react";

interface SEOProps {
  title: string;
  description?: string;
}

const BASE_TITLE = "CloudBook";

export function useSEO({ title, description }: SEOProps) {
  useEffect(() => {
    const fullTitle = title === "Home" ? BASE_TITLE : `${title} | ${BASE_TITLE}`;
    document.title = fullTitle;

    if (description) {
      const meta = document.querySelector('meta[name="description"]');
      if (meta) {
        meta.setAttribute("content", description);
      }
    }

    return () => {
      document.title = `${BASE_TITLE} - Connect with Friends & Build Community`;
    };
  }, [title, description]);
}
