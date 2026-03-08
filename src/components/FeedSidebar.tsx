import { Link } from "react-router-dom";

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
  { href: "/groups", icon: "👨‍👩‍👧‍👦", label: "Groups" },
  { href: "/pages", icon: "🏢", label: "Pages" },
  { href: "/watch", icon: "📺", label: "Watch" },
  { href: "/reels", icon: "🎬", label: "Reels" },
  { href: "/saved", icon: "🔖", label: "Saved" },
  { href: "/events", icon: "📅", label: "Events" },
  { href: "/marketplace", icon: "🛒", label: "Marketplace" },
];

const FeedSidebar = ({ currentUser }: FeedSidebarProps) => {
  return (
    <aside className="hidden lg:block space-y-2">
      <div className="sticky top-20 space-y-1">
        <Link
          to={`/profile/${currentUser.id}`}
          className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all duration-200 hover:shadow-sm group"
        >
          <img
            src={currentUser.avatar_url || "/placeholder.svg"}
            alt=""
            className="w-9 h-9 rounded-full object-cover"
          />
          <span className="text-[15px] font-medium">{currentUser.full_name}</span>
        </Link>
        {sidebarLinks.map((link, i) => (
          <Link
            key={link.href}
            to={link.href}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-all duration-200 hover:shadow-sm group"
          >
            <span className="text-xl group-hover:scale-110 transition-transform duration-200">{link.icon}</span>
            <span className="text-[15px] font-medium">{link.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
};

export default FeedSidebar;
