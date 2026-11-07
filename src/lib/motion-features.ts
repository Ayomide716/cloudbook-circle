/**
 * Framer Motion's animation features, loaded after the app starts (LazyMotion in App.tsx), so
 * the first screen doesn't wait for them. domMax because tabs use layoutId.
 */
import { domMax } from "framer-motion";

export default domMax;
