import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUp } from "@/components/icons";
import { motion, AnimatePresence } from "framer-motion";
import { dbChannel } from "@/lib/realtime";

interface NewPostsBannerProps {
  onRefresh: () => void;
  lastFetchTime: Date;
  /** Your own new posts are already at the top, so they don't count. */
  currentUserId?: string;
}

const NewPostsBanner = ({ onRefresh, lastFetchTime, currentUserId }: NewPostsBannerProps) => {
  const [newCount, setNewCount] = useState(0);
  const countRef = useRef(0);

  useEffect(() => {
    const channel = dbChannel("new-posts-banner")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        if ((payload.new as { user_id?: string }).user_id === currentUserId) return;
        countRef.current += 1;
        setNewCount(countRef.current);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Reset count when lastFetchTime changes (user refreshed)
  useEffect(() => {
    countRef.current = 0;
    setNewCount(0);
  }, [lastFetchTime]);

  const handleClick = () => {
    onRefresh();
    countRef.current = 0;
    setNewCount(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AnimatePresence>
      {newCount > 0 && (
        <motion.button
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          onClick={handleClick}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full gradient-brand text-primary-foreground text-sm font-semibold shadow-lg hover:shadow-xl transition-shadow"
        >
          <ArrowUp className="h-4 w-4" />
          {newCount} new post{newCount !== 1 ? "s" : ""}
        </motion.button>
      )}
    </AnimatePresence>
  );
};

export default NewPostsBanner;
