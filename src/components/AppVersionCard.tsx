import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { checkForUpdate, versionInfo, type UpdateCheck } from "@/lib/native/ota";

const MESSAGES: Record<UpdateCheck, string> = {
  "up-to-date": "You have the latest version.",
  ready: "Updating…",
  "needs-new-app": "A new version needs the latest app from the download page.",
  offline: "Couldn't check right now. Try again in a moment.",
};

/** Android app only: which version is running, and a way to update right now. */
const AppVersionCard = () => {
  const [version, setVersion] = useState<{ app: string; web: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);

  useEffect(() => {
    versionInfo().then(setVersion).catch(() => {});
  }, []);

  const check = async () => {
    setChecking(true);
    setResult(null);
    // Applies at once when there's a newer version (the app reloads into it).
    const r = await checkForUpdate({ force: true, applyNow: true });
    setResult(r);
    setChecking(false);
  };

  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Ember for Android</p>
        <p className="text-xs text-muted-foreground">
          {version ? `Version ${version.app} · ${version.web}` : "Version …"}
        </p>
        {result && <p className="mt-1 text-xs text-muted-foreground" role="status">{MESSAGES[result]}</p>}
      </div>
      <Button variant="secondary" size="sm" className="shrink-0 rounded-full" onClick={check} disabled={checking}>
        {checking ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
        Check for updates
      </Button>
    </Card>
  );
};

export default AppVersionCard;
