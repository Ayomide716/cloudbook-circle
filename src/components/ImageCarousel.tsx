import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageCarouselProps {
  images: string[];
  className?: string;
}

const ImageCarousel = ({ images, className }: ImageCarouselProps) => {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <img src={images[0]} alt="Post" className={cn("w-full max-h-[500px] object-cover", className)} />
    );
  }

  return (
    <div className={cn("relative group", className)}>
      <img
        src={images[current]}
        alt={`Photo ${current + 1}`}
        className="w-full max-h-[500px] object-cover"
      />

      {/* Nav arrows */}
      {current > 0 && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          onClick={() => setCurrent((p) => p - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}
      {current < images.length - 1 && (
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          onClick={() => setCurrent((p) => p + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              i === current ? "bg-white scale-110" : "bg-white/50"
            )}
          />
        ))}
      </div>

      {/* Counter */}
      <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
        {current + 1}/{images.length}
      </div>
    </div>
  );
};

export default ImageCarousel;
