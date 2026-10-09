import { useId } from "react";

const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3.1 1.7-2 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z";

// Where the little hearts fly to, around the big one.
const SPARKS = [
  { dx: "-88px", dy: "-70px", size: 18, delay: "0s" },
  { dx: "86px", dy: "-62px", size: 16, delay: "0.04s" },
  { dx: "-100px", dy: "18px", size: 14, delay: "0.08s" },
  { dx: "98px", dy: "26px", size: 18, delay: "0.02s" },
  { dx: "-40px", dy: "-112px", size: 12, delay: "0.06s" },
  { dx: "46px", dy: "-108px", size: 14, delay: "0.1s" },
];

/**
 * The heart that pops over a photo when you double-tap it, as on Instagram: a red-pink heart
 * that bounces in and floats away, with small hearts flying out around it.
 * Render it with a new `key` for each tap so the animation plays again.
 */
const HeartBurst = () => {
  const id = useId().replace(/:/g, "");
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {SPARKS.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={s.size}
          height={s.size}
          className="absolute opacity-0 animate-heart-spark motion-reduce:hidden"
          style={{ ["--dx" as string]: s.dx, ["--dy" as string]: s.dy, animationDelay: s.delay }}
        >
          <path d={HEART} fill={i % 2 ? "#ff8fab" : "#ff3d68"} />
        </svg>
      ))}
      <svg viewBox="0 0 24 24" className="h-28 w-28 animate-heart-pop drop-shadow-[0_6px_18px_rgba(255,40,90,0.55)]">
        <defs>
          <linearGradient id={`heart-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff7a9a" />
            <stop offset="55%" stopColor="#ff2e63" />
            <stop offset="100%" stopColor="#e0004d" />
          </linearGradient>
        </defs>
        <path d={HEART} fill={`url(#heart-${id})`} stroke="white" strokeWidth="0.6" />
      </svg>
    </span>
  );
};

export default HeartBurst;
