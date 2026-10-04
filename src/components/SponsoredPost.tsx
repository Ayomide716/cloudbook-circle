import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeWebsiteUrl } from "@/lib/safe-url";

interface SponsoredPostProps {
  campaign: {
    id: string;
    user_id?: string;
    title: string;
    content: string;
    image_url: string | null;
    link_url: string | null;
    cta_text: string;
  };
  currentUserId: string;
  /** Preview in the Ad Manager: nothing is recorded and the button does nothing. */
  preview?: boolean;
}

const SponsoredPost = ({ campaign, currentUserId, preview = false }: SponsoredPostProps) => {
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Only http(s) links and images: a "javascript:" ad link would otherwise run in our origin.
  const link = safeWebsiteUrl(campaign.link_url);
  const image = safeWebsiteUrl(campaign.image_url);
  const isOwnAd = campaign.user_id === currentUserId;

  // Count an impression once, when at least half the ad has actually been on screen.
  useEffect(() => {
    if (preview || isOwnAd) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        supabase.from("ad_impressions").insert({ campaign_id: campaign.id, user_id: currentUserId }).then(() => {});
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [campaign.id, currentUserId, preview, isOwnAd]);

  const handleClick = () => {
    if (preview) return;
    // Open first, while still inside the tap, or pop-up blockers stop it.
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    if (!isOwnAd) supabase.from("ad_clicks").insert({ campaign_id: campaign.id, user_id: currentUserId }).then(() => {});
  };

  if (dismissed) return null;

  return (
    <Card ref={ref} className="shadow-sm overflow-hidden border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <div className="p-3 sm:p-4">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary" className="text-xs font-normal">
            Sponsored
          </Badge>
          {!preview && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDismissed(true)} aria-label="Hide this ad">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <h3 className="font-semibold text-sm sm:text-base mb-1 break-words">{campaign.title || "Your ad title"}</h3>
        <p className="text-sm text-muted-foreground mb-3 whitespace-pre-wrap break-words">{campaign.content || "Your ad text appears here."}</p>
      </div>

      {image && (
        <img src={image} alt="" loading="lazy" className="w-full max-h-[300px] object-cover" />
      )}

      <div className="p-3 sm:p-4 pt-2">
        <Button onClick={handleClick} className="w-full gap-2" variant="default">
          {campaign.cta_text}
          {link && <ExternalLink className="h-4 w-4" />}
        </Button>
      </div>
    </Card>
  );
};

export default SponsoredPost;
