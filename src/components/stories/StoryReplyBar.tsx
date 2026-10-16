import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Send } from "lucide-react";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** The faces in "Tap to send", as WhatsApp shows them over the story. */
const PICKER = ["love", "haha", "wow", "sad", "like", "fire", "party", "angry"];
/** The two quick faces inside the reply box. */
const QUICK = ["haha", "wow"];

interface StoryReplyBarProps {
  onReply: (text: string) => Promise<void> | void;
  onReact: (type: string) => void;
  /** The story waits while you type or pick a face. */
  onPause: (paused: boolean) => void;
}

interface Burst {
  id: number;
  type: string;
}

/**
 * Replying to someone's story, as on WhatsApp: one bar at the bottom (Reply, two quick faces
 * and a heart). Tapping Reply opens "Tap to send" with more faces over the story. A face you
 * tap floats up big at once, with a little buzz, so you know it went.
 */
const StoryReplyBar = ({ onReply, onReact, onPause }: StoryReplyBarProps) => {
  const [text, setText] = useState("");
  const [picking, setPicking] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [hearted, setHearted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);

  const react = (type: string) => {
    haptic(15);
    const id = nextId.current++;
    setBursts((b) => [...b, { id, type }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400);
    if (type === "love") setHearted(true);
    onReact(type);
    close();
  };

  const close = () => {
    setPicking(false);
    input.current?.blur();
  };

  const send = async () => {
    const reply = text.trim();
    if (!reply) return;
    setText("");
    close();
    await onReply(reply);
  };

  // Keeps the box focused (and the keyboard up) while a face is tapped.
  const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

  return (
    <>
      {/* "Tap to send": more faces over the dimmed story while the keyboard is up. */}
      <AnimatePresence>
        {picking && !text && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-30 flex flex-col items-center bg-black/70 px-6 pt-[calc(env(safe-area-inset-top,0px)+6rem)]"
            onPointerDown={keepFocus}
            onClick={close}
          >
            <p className="mb-6 text-[15px] font-semibold text-white">Tap to send</p>
            <div className="grid w-full max-w-sm grid-cols-4 gap-y-6">
              {PICKER.map((type, i) => (
                <motion.button
                  key={type}
                  type="button"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.025, type: "spring", stiffness: 500, damping: 24 }}
                  whileTap={{ scale: 1.25 }}
                  onPointerDown={keepFocus}
                  onClick={(e) => { e.stopPropagation(); react(type); }}
                  aria-label={`Send ${type}`}
                  className="mx-auto"
                >
                  <ReactionEmoji type={type} className="h-14 w-14" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The face you sent, floating up big. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center" aria-live="polite">
        <AnimatePresence>
          {bursts.map((b) => (
            <motion.div
              key={b.id}
              initial={{ y: 0, scale: 0.5, opacity: 0 }}
              animate={{ y: -220, scale: 1.6, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.3, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
              className="absolute flex flex-col items-center"
            >
              <ReactionEmoji type={b.type} className="h-16 w-16 drop-shadow-lg" />
              <span className="mt-1 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-semibold text-white">Sent</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Reply, two quick faces, and the heart (Send once you've typed). */}
      <div className="absolute inset-x-0 bottom-0 z-40 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-6">
        <div className="flex h-12 min-w-0 flex-1 items-center rounded-full bg-white/15 pl-4 pr-1.5 backdrop-blur-md">
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => { setPicking(true); onPause(true); }}
            onBlur={() => { setPicking(false); onPause(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
            placeholder="Reply"
            aria-label="Reply to this story"
            enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/70 focus:outline-none"
          />
          {!text && QUICK.map((type) => (
            <motion.button
              key={type}
              type="button"
              whileTap={{ scale: 1.3 }}
              onPointerDown={keepFocus}
              onClick={() => react(type)}
              aria-label={`Send ${type}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center"
            >
              <ReactionEmoji type={type} className="h-7 w-7" />
            </motion.button>
          ))}
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onPointerDown={keepFocus}
          onClick={() => (text.trim() ? void send() : react("love"))}
          aria-label={text.trim() ? "Send reply" : "Love this story"}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full backdrop-blur-md transition-colors",
            text.trim() ? "bg-primary text-primary-foreground" : "bg-white/15 text-white"
          )}
        >
          {text.trim() ? (
            <Send className="h-5 w-5" />
          ) : (
            <Heart className={cn("h-6 w-6 transition-colors", hearted && "fill-[#ff3b5c] text-[#ff3b5c]")} />
          )}
        </motion.button>
      </div>
    </>
  );
};

export default StoryReplyBar;
