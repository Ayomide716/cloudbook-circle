import { useState, useRef, useEffect, ImgHTMLAttributes, memo } from "react";
import { cn } from "@/lib/utils";

interface LazyImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
  blurHash?: string;
}

// Detect WebP support once
let webpSupported: boolean | null = null;
const checkWebP = (): Promise<boolean> => {
  if (webpSupported !== null) return Promise.resolve(webpSupported);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { webpSupported = true; resolve(true); };
    img.onerror = () => { webpSupported = false; resolve(false); };
    img.src = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJYgCdAEO/hepAA==";
  });
};

// Convert Supabase storage URLs to WebP format when supported
const getOptimizedSrc = (src: string, supportsWebP: boolean): string => {
  if (!src || !supportsWebP) return src;
  // For Supabase storage URLs, we can request format transformation
  if (src.includes("supabase") && src.includes("/storage/") && !src.includes(".svg")) {
    const url = new URL(src);
    url.searchParams.set("format", "webp");
    url.searchParams.set("quality", "80");
    return url.toString();
  }
  return src;
};

const LazyImage = memo(({ src, alt, className, fallback = "/placeholder.svg", blurHash, ...props }: LazyImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const [supportsWebP, setSupportsWebP] = useState(true);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkWebP().then(setSupportsWebP);
  }, []);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset state when src changes
  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [src]);

  const optimizedSrc = src && !error ? getOptimizedSrc(src, supportsWebP) : fallback;

  return (
    <div ref={imgRef} className={cn("relative overflow-hidden", className)}>
      {/* Blur-up placeholder with gradient shimmer */}
      {!loaded && (
        <div className="absolute inset-0 bg-muted">
          {/* Animated shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/40 to-transparent animate-shimmer" />
        </div>
      )}
      {inView && (
        <img
          src={optimizedSrc}
          alt={alt || ""}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-500 ease-out",
            loaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setLoaded(true)}
          onError={(e) => {
            if (!error) {
              setError(true);
              (e.target as HTMLImageElement).src = fallback;
              setLoaded(true);
            }
          }}
          loading="lazy"
          decoding="async"
          {...props}
        />
      )}
    </div>
  );
});

LazyImage.displayName = "LazyImage";

export default LazyImage;
