import { Button } from "@/components/ui/button";
import { Sparkles, Globe, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedFilterProps {
  filter: 'all' | 'friends' | 'digest';
  onFilterChange: (filter: 'all' | 'friends' | 'digest') => void;
}

const FeedFilter = ({ filter, onFilterChange }: FeedFilterProps) => {
  const filters = [
    { key: 'all' as const, label: 'All', icon: Globe },
    { key: 'friends' as const, label: 'Friends', icon: Users },
    { key: 'digest' as const, label: 'Digest', icon: Sparkles },
  ];

  return (
    <div className="flex gap-1.5 mb-4 max-sm:mb-0 max-sm:px-3 overflow-x-auto scrollbar-hide">
      {filters.map(f => (
        <Button
          key={f.key}
          variant={filter === f.key ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(f.key)}
          className={cn(
            "rounded-full gap-1.5 text-xs sm:text-sm px-3.5 h-8 flex-shrink-0 transition-all",
            filter === f.key && "shadow-md"
          )}
        >
          <f.icon className="h-3.5 w-3.5" />
          {f.label}
        </Button>
      ))}
    </div>
  );
};

export default FeedFilter;
