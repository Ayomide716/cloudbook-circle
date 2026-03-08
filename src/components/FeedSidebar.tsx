import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import OnlineFriendsWidget from "./OnlineFriendsWidget";

interface FeedSidebarProps {
  currentUser: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

const sidebarLinks = [
  { href: "/friends", icon: "👥", label: "Friends" },
  { href: "/messages", icon: "💬", label: "Messages" },
  { href: "/groups", icon: "🏘️", label: "Communities" },
  { href: "/pages", icon: "📄", label: "Pages" },
  { href: "/watch", icon: "📺", label: "Watch" },
  { href: "/reels", icon: "🎬", label: "Reels" },
  { href: "/saved", icon: "🔖", label: "Saved" },
  { href: "/events", icon: "📅", label: "Events" },
  { href: "/marketplace", icon: "🛍️", label: "Marketplace" },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
};

const FeedSidebar = ({ currentUser }: FeedSidebarProps) => {
  return (
    <aside className="hidden lg:block space-y-2">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="sticky top-20 space-y-1"
      >
        <motion.div variants={item}>
          <Link
            to={`/profile/${currentUser.id}`}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary/80 transition-all duration-200 group"
          >
            <img
              src={currentUser.avatar_url || "/placeholder.svg"}
              alt=""
              className="w-10 h-10 rounded-xl object-cover ring-2 ring-border/50 group-hover:ring-primary/30 transition-all"
            />
            <div>
              <span className="text-sm font-semibold font-display block">{currentUser.full_name}</span>
              <span className="text-xs text-muted-foreground">View profile</span>
            </div>
          </Link>
        </motion.div>
        
        {sidebarLinks.map((link) => (
          <motion.div key={link.href} variants={item}>
            <Link
              to={link.href}
              className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-secondary/80 transition-all duration-200 group"
            >
              <span className="text-xl w-8 h-8 flex items-center justify-center rounded-xl bg-secondary/60 group-hover:scale-110 transition-transform duration-200">{link.icon}</span>
              <span className="text-sm font-medium">{link.label}</span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </aside>
  );
};

export default FeedSidebar;