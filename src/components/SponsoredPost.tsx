import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SponsoredPostProps {
  campaign: {
    id: string;
    title: string;
    content: string;
    image_url: string | null;
    link_url: string | null;
    cta_text: string;
  };
  currentUserId: string;
}

const SponsoredPost = ({ campaign, currentUserId }: SponsoredPostProps) => {
  const [dismissed, setDismissed] = useState(false);
  const [tracked, setTracked] = useState(false);

  // Track impression on mount
  if (!tracked) {
    setTracked(true);
    supabase
      .from("ad_impressions")
      .insert({ campaign_id: campaign.id, user_id: currentUserId })
      .then(() => {});
  }

  const handleClick = async () => {
    await supabase
      .from("ad_clicks")
      .insert({ campaign_id: campaign.id, user_id: currentUserId });

    if (campaign.link_url) {
      window.open(campaign.link_url, "_blank", "noopener");
    }
  };

  if (dismissed) return null;

  return (
    <Card className="shadow-sm overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary" className="text-xs font-normal">
            Sponsored
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        <h3 className="font-semibold text-sm sm:text-base mb-1">{campaign.title}</h3>
        <p className="text-sm text-muted-foreground mb-3">{campaign.content}</p>
      </div>

      {campaign.image_url && (
        <img
          src={campaign.image_url}
          alt={campaign.title}
          className="w-full max-h-[300px] object-cover"
        />
      )}

      <div className="p-3 sm:p-4 pt-2">
        <Button
          onClick={handleClick}
          className="w-full gap-2"
          variant="default"
        >
          {campaign.cta_text}
          {campaign.link_url && <ExternalLink className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
};

export default SponsoredPost;
