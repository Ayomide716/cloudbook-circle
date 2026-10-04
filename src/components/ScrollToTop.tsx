import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Start each newly opened page at the top; Back/Forward keep the browser's scroll position. */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return null;
};

export default ScrollToTop;
