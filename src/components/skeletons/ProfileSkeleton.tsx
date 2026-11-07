import { Skeleton } from "@/components/ui/skeleton";
import Navigation from "@/components/Navigation";

/**
 * Same layout as the profile: cover to the top of the screen (no top bar on phones), the
 * rounded sheet with photo, name, stats and two buttons, then the chips and details.
 */
const ProfileSkeleton = () => (
  <div aria-busy="true" aria-label="Loading profile">
    <Navigation hideMobileTopBar />
    <div className="max-w-5xl mx-auto sm:px-6">
      <Skeleton className="h-48 sm:h-72 w-full rounded-none sm:rounded-b-2xl" />
    </div>
    <div className="max-w-5xl mx-auto px-0 sm:px-6">
      <div className="relative -mt-5 sm:mt-0 rounded-t-3xl sm:rounded-none bg-card sm:bg-transparent px-4 sm:px-0 pt-3 pb-4">
        {/* Phones: the photo over the cover, then the name across the full width, as the real header. */}
        <Skeleton className="-mt-20 sm:-mt-24 h-[112px] w-[112px] sm:h-40 sm:w-40 rounded-full border-4 border-card sm:border-background" />
        <Skeleton className="mt-3 h-7 w-3/5 max-w-[240px]" />
        <Skeleton className="mt-2.5 h-4 w-2/5 max-w-[170px]" />
        <div className="mt-3 flex -space-x-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-7 rounded-full border-2 border-card" />)}
        </div>
        <Skeleton className="mt-3 h-4 w-4/5 max-w-md" />
        <div className="mt-4 flex gap-2 sm:max-w-md">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        </div>
      </div>
      <div className="flex gap-1.5 border-y border-border bg-card sm:bg-transparent px-3 sm:px-0 py-2 mt-2" aria-hidden="true">
        {["Posts", "Photos", "About"].map((t, i) => (
          <span key={t} className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold ${i === 0 ? "bg-foreground text-background" : "text-foreground"}`}>{t}</span>
        ))}
      </div>
      <div className="mt-2 bg-card sm:bg-transparent p-4 sm:px-0 space-y-3.5">
        <Skeleton className="h-5 w-40" />
        {[60, 50, 45].map((w) => (
          <div key={w} className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ProfileSkeleton;
