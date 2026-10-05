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
        <div className="flex items-end gap-4">
          <Skeleton className="-mt-14 sm:-mt-20 h-28 w-28 sm:h-40 sm:w-40 shrink-0 rounded-full border-4 border-card sm:border-background" />
          <div className="flex-1 space-y-2 pb-2">
            <Skeleton className="h-6 w-3/4 max-w-[220px]" />
            <Skeleton className="h-4 w-1/2 max-w-[160px]" />
          </div>
        </div>
        <Skeleton className="mt-4 h-4 w-4/5 max-w-md" />
        <Skeleton className="mt-2 h-4 w-3/5 max-w-sm" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-1.5 border-y border-border bg-card sm:bg-transparent px-3 sm:px-0 py-2 mt-2" aria-hidden="true">
        {["All", "Photos", "Videos", "Albums"].map((t, i) => (
          <span key={t} className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold ${i === 0 ? "bg-primary/10 text-primary" : "text-foreground"}`}>{t}</span>
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
