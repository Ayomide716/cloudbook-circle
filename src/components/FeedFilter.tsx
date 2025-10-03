import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FeedFilterProps {
  filter: 'all' | 'friends';
  onFilterChange: (filter: 'all' | 'friends') => void;
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
      </div>
    </Card>
  );
};

export default FeedFilter;