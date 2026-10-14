import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { VideoJob } from "@/lib/video-jobs";

/** "Preparing video… 40%" / "Uploading… 80%" / "Ready" under a picked video. */
const VideoJobStatus = ({ job, className }: { job: VideoJob | null; className?: string }) => {
  if (!job) return null;
  if (job.phase === "failed") {
    return <p className={cn("text-xs text-destructive", className)} role="alert">{job.error || "This video couldn't be uploaded."}</p>;
  }
  if (job.phase === "done") return <p className={cn("text-xs text-muted-foreground", className)}>Video ready</p>;
  return (
    <div className={cn("w-full space-y-1", className)}>
      <Progress value={job.progress} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        {job.phase === "preparing" ? `Preparing video… ${job.progress}%` : `Uploading… ${job.progress}%`}
        {" · you can post now"}
      </p>
    </div>
  );
};

export default VideoJobStatus;
