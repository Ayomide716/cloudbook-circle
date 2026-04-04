import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface FeedFilterProps {
  filter: 'all' | 'friends' | 'digest';
  onFilterChange: (filter: 'all' | 'friends' | 'digest') => void;
}

const FeedFilter = ({ filter, onFilterChange }: FeedFilterProps) => {
  return (
    <Card className="p-4 mb-4">
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onFilterChange('all')}
          className="flex-1"
        >
          All Posts
        </Button>
        <Button
          variant={filter === 'friends' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onFilterChange('friends')}
          className="flex-1"
        >
          Friends Only
        </Button>
        <Button
          variant={filter === 'digest' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onFilterChange('digest')}
          className="flex-1 gap-1"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Digest
        </Button>
      </div>
    </Card>
  );
};

export default FeedFilter;
