import { useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { testPush, type PushTestStep } from "@/lib/push-test";

/** Sends you a test notification and says which step fails, if one does (lib/push-test). */
const PushTestCard = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; steps: PushTestStep[] } | null>(null);

  const run = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testPush());
    } catch {
      setResult({ ok: false, steps: [{ ok: false, text: "The test couldn't run. Check your connection." }] });
    }
    setTesting(false);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Push notifications</p>
          <p className="text-xs text-muted-foreground">Sends a test notification to you, on this device.</p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0 rounded-full" onClick={run} disabled={testing}>
          {testing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Test
        </Button>
      </div>
      {result && (
        <ul className="mt-3 space-y-1.5" role="status">
          {result.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs">
              {s.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
              <span className="break-words">{s.text}</span>
            </li>
          ))}
          {result.ok && <li className="text-xs font-medium">All good. Close the app to see the notification if it doesn't show.</li>}
        </ul>
      )}
    </Card>
  );
};

export default PushTestCard;
