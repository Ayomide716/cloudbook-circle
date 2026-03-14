import { Clock } from "lucide-react";
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
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <Select value={value || "never"} onValueChange={(v) => onChange(v === "never" ? null : v)}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue placeholder="Post expiry" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="never">Never expires</SelectItem>
          <SelectItem value="24h">24 hours</SelectItem>
          <SelectItem value="7d">7 days</SelectItem>
          <SelectItem value="30d">30 days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default PostExpirySelector;
