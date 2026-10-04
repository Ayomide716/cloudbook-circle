import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AdCampaign {
  id: string;
  user_id: string;
  title: string;
  content: string;
  image_url: string | null;
  link_url: string | null;
  cta_text: string;
}

export function useAds() {
  const [ads, setAds] = useState<AdCampaign[]>([]);

  useEffect(() => {
    const fetchAds = async () => {
      const { data } = await supabase
        .from("ad_campaigns")
        .select("id, user_id, title, content, image_url, link_url, cta_text")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5);

      setAds((data as AdCampaign[]) || []);
    };

    fetchAds();
  }, []);

  // Return an ad to show at a given feed position (every 5th post)
  const getAdForPosition = (index: number): AdCampaign | null => {
    if (ads.length === 0) return null;
    // Show ad after every 5th post
    if ((index + 1) % 5 === 0) {
      return ads[Math.floor(index / 5) % ads.length];
    }
    return null;
  };

  return { ads, getAdForPosition };
}
