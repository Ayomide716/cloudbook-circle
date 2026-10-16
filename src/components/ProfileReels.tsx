import { useNavigate } from "react-router-dom";
import { Heart, Play, Trash2 } from "@/components/icons";

export interface ProfileReel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  likes: number;
}

/** A person's reels as tall tiles, three across. Yours can be deleted from here ("Reel deleted · Undo"). */
const ProfileReels = ({ reels, isOwn, onDelete }: { reels: ProfileReel[]; isOwn: boolean; onDelete: (id: string) => void }) => {
  const navigate = useNavigate();
  return (
      <div className="grid grid-cols-3 gap-0.5 overflow-hidden sm:gap-1 sm:rounded-xl">
        {reels.map((r) => (
          <div key={r.id} className="relative aspect-[9/16] overflow-hidden bg-black">
            <button
              type="button"
              onClick={() => navigate(`/reels/${r.id}`)}
              aria-label={r.caption ? `Open reel: ${r.caption}` : "Open reel"}
              className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {r.thumbnail_url ? (
                <img src={r.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <video src={`${r.video_url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />
              <span className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white drop-shadow">
                <Play className="h-4 w-4 fill-white" aria-hidden="true" />
                {r.likes > 0 && (
                  <>
                    <Heart className="ml-1 h-3.5 w-3.5 fill-white" aria-hidden="true" />
                    {r.likes}
                  </>
                )}
              </span>
            </button>
            {isOwn && (
              <button
                type="button"
                onClick={() => onDelete(r.id)}
                aria-label="Delete reel"
                className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
  );
};

export default ProfileReels;
