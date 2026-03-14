import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Eye, TrendingDown, Coffee, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ScreenTimeWidget = () => {
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 60000);
      setSessionMinutes(elapsed);

      // Show break reminder every 30 minutes
      if (elapsed > 0 && elapsed % 30 === 0 && !dismissed) {
        setShowBreakReminder(true);
      }
    }, 60000); // Update every minute

    // Also track in localStorage for daily totals
    const today = new Date().toISOString().split("T")[0];
    const stored = JSON.parse(localStorage.getItem("cloudbook_screen_time") || "{}");
    if (!stored[today]) stored[today] = 0;

    const saveInterval = setInterval(() => {
      const todayKey = new Date().toISOString().split("T")[0];
      const data = JSON.parse(localStorage.getItem("cloudbook_screen_time") || "{}");
      data[todayKey] = (data[todayKey] || 0) + 1;
      localStorage.setItem("cloudbook_screen_time", JSON.stringify(data));
    }, 60000);

    return () => {
      clearInterval(interval);
      clearInterval(saveInterval);
    };
  }, [dismissed]);

  const getTodayTotal = () => {
    const today = new Date().toISOString().split("T")[0];
    const stored = JSON.parse(localStorage.getItem("cloudbook_screen_time") || "{}");
    return (stored[today] || 0) + sessionMinutes;
  };

  const getWeekTotal = () => {
    const stored = JSON.parse(localStorage.getItem("cloudbook_screen_time") || "{}");
    const now = new Date();
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      total += stored[key] || 0;
    }
    return total + sessionMinutes;
  };

  const formatTime = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const todayTotal = getTodayTotal();
  const weekAvg = Math.round(getWeekTotal() / 7);

  return (
    <>
      {/* Floating time pill */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowWidget(!showWidget)}
        className="fixed bottom-20 right-4 md:bottom-20 md:right-6 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-strong text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Clock className="h-3.5 w-3.5" />
        {formatTime(sessionMinutes)}
      </motion.button>

      {/* Expanded widget */}
      <AnimatePresence>
        {showWidget && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-32 right-4 md:bottom-32 md:right-6 z-40 w-64"
          >
            <Card className="p-4 glass-strong border-border/50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Eye className="h-4 w-4 text-primary" />
                  Screen Time
                </h3>
                <button onClick={() => setShowWidget(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{formatTime(sessionMinutes)}</p>
                  <p className="text-[10px] text-muted-foreground">This session</p>
                </div>
                <div className="bg-secondary/50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{formatTime(todayTotal)}</p>
                  <p className="text-[10px] text-muted-foreground">Today</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingDown className="h-3.5 w-3.5" />
                <span>Weekly avg: {formatTime(weekAvg)}/day</span>
              </div>

              {todayTotal > 120 && (
                <p className="text-xs text-amber-500 flex items-center gap-1">
                  <Coffee className="h-3 w-3" />
                  Consider taking a break! 
                </p>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Break reminder overlay */}
      <AnimatePresence>
        {showBreakReminder && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm"
          >
            <Card className="p-4 glass-strong border-primary/20 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Coffee className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Time for a break! ☕</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    You've been on CloudBook for {formatTime(sessionMinutes)}. Stretch, grab water, or step outside for a moment.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setShowBreakReminder(false); setDismissed(true); }}>
                      Dismiss for today
                    </Button>
                    <Button size="sm" className="text-xs h-7" onClick={() => setShowBreakReminder(false)}>
                      Got it!
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ScreenTimeWidget;
