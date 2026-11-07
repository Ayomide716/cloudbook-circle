import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Usage {
  db_bytes: number;
  db_limit_bytes: number;
  monthly_users: number;
  monthly_users_limit: number;
  total_users: number;
  largest_tables: { name: string; bytes: number }[];
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** The project's usage page on Supabase (bandwidth lives there, not in the database). */
const usagePage = () => {
  const ref = (() => { try { return new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0]; } catch { return ""; } })();
  return ref ? `https://supabase.com/dashboard/project/${ref}/usage` : "https://supabase.com/dashboard";
};

const Meter = ({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) => {
  const pct = Math.min(100, Math.round((100 * used) / Math.max(limit, 1)));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums text-xs", pct >= 80 ? "font-semibold text-destructive" : "text-muted-foreground")}>{text} · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary" role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn("h-full rounded-full", pct >= 80 ? "bg-destructive" : pct >= 60 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
};

/**
 * How close Ember is to the Supabase free plan's limits. The server also checks every morning
 * and sends admins a notification past 80%.
 */
const UsageCard = () => {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    supabase.rpc("admin_usage").then(({ data, error }) => {
      if (error || !data) setFailed(true);
      else setUsage(data as unknown as Usage);
    });
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Supabase usage (free plan)</p>
        <a href={usagePage()} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">
          Bandwidth and more
        </a>
      </div>
      {failed ? (
        <p className="text-xs text-muted-foreground">Couldn't read usage. Run this month's database update (usage alerts) to see it here.</p>
      ) : !usage ? (
        <div className="space-y-3" aria-hidden="true">
          <div className="h-7 animate-pulse rounded bg-secondary" />
          <div className="h-7 animate-pulse rounded bg-secondary" />
        </div>
      ) : (
        <div className="space-y-3">
          <Meter label="Database" used={usage.db_bytes} limit={usage.db_limit_bytes} text={`${mb(usage.db_bytes)} of ${mb(usage.db_limit_bytes)}`} />
          <Meter
            label="People signed in this month"
            used={usage.monthly_users}
            limit={usage.monthly_users_limit}
            text={`${usage.monthly_users.toLocaleString()} of ${usage.monthly_users_limit.toLocaleString()}`}
          />
          {usage.largest_tables.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Biggest: {usage.largest_tables.slice(0, 3).map((t) => `${t.name} ${mb(t.bytes)}`).join(" · ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Bandwidth (egress) isn't visible from the database: check it on Supabase. Admins get a notification each morning anything here passes 80%.</p>
        </div>
      )}
    </Card>
  );
};

export default UsageCard;
