import { Clock } from "@/components/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PostExpirySelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

const PostExpirySelector = ({ value, onChange }: PostExpirySelectorProps) => {
  return (
    // A small chip next to "Public", as Facebook shows a post's settings under your name.
    <Select value={value || "never"} onValueChange={(v) => onChange(v === "never" ? null : v)}>
      <SelectTrigger
        aria-label="When the post disappears"
        className="h-6 w-auto gap-1 rounded-md border-0 bg-secondary px-2 text-xs font-semibold text-muted-foreground focus:ring-1 [&>svg:last-child]:h-3 [&>svg:last-child]:w-3"
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <SelectValue placeholder="Never expires" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="never">Never expires</SelectItem>
        <SelectItem value="24h">Disappears in 24 hours</SelectItem>
        <SelectItem value="7d">Disappears in 7 days</SelectItem>
        <SelectItem value="30d">Disappears in 30 days</SelectItem>
      </SelectContent>
    </Select>
  );
};

export default PostExpirySelector;
