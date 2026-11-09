import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, Loader2 } from "@/components/icons";
import DarkStatusBar from "@/components/DarkStatusBar";
import { haptic } from "@/lib/haptics";
import { emberPathFromCode } from "@/lib/qr";

interface QrScannerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Point the camera at someone's Ember QR code to open their profile, as on Instagram. The
 * reader (jsQR) only loads when the scanner opens.
 */
const QrScanner = ({ open, onClose }: QrScannerProps) => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "denied" | "not-ember">("starting");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    setStatus("starting");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    (async () => {
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import("jsqr"),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }),
        ]);
        stream = media;
        if (stopped) { media.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = media;
        await v.play().catch(() => {});
        setStatus("scanning");
        let lastNotEmber = "";
        const tick = () => {
          if (stopped) return;
          if (v.readyState >= 2 && ctx && v.videoWidth) {
            // A smaller copy is plenty for a QR code and much faster to read.
            const scale = Math.min(1, 640 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * scale);
            canvas.height = Math.round(v.videoHeight * scale);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              const path = emberPathFromCode(code.data);
              if (path) {
                haptic(15);
                onClose();
                navigate(path);
                return;
              }
              if (code.data !== lastNotEmber) { lastNotEmber = code.data; setStatus("not-ember"); }
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        if (!stopped) setStatus("denied");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, navigate, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[130] flex flex-col bg-black text-white animate-in fade-in-0 duration-200" role="dialog" data-state="open" aria-label="Scan a QR code">
      <DarkStatusBar />
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <div className="relative flex items-center justify-between px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)]">
        <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40" aria-label="Close">
          <X className="h-6 w-6" />
        </button>
      </div>
      {/* The frame to put the code in. */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative h-64 w-64 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
          {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl"]).map((c) => (
            <span key={c} className={`absolute h-10 w-10 border-white ${c}`} aria-hidden="true" />
          ))}
          {status === "starting" && <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin" />}
        </div>
      </div>
      <p className="relative px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center text-[15px]" aria-live="polite">
        {status === "denied"
          ? "Ember needs your camera to scan. Allow it in your phone's settings, then try again."
          : status === "not-ember"
            ? "That code isn't an Ember profile. Point at someone's Ember QR code."
            : "Point your camera at a friend's Ember QR code"}
      </p>
    </div>,
    document.body,
  );
};

export default QrScanner;
