"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const STATS = [
  { key: "fund", value: "12,5400 Rupees", label: "Fund Raised" },
  { key: "projects", value: "16+", label: "Active Projects" },
  { key: "community", value: "3,600+", label: "Community Served" },
];

export default function OurTrustSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const tickRef = useRef<number>(0);

  const updateFromScroll = useCallback(() => {
    const el = sectionRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) {
      setProgress(0);
      return;
    }

    const scrolled = Math.min(Math.max(-rect.top, 0), scrollable);
    const p = scrolled / scrollable;
    setProgress(p);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = requestAnimationFrame(updateFromScroll);
    };

    updateFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(tickRef.current);
    };
  }, [updateFromScroll]);

  // Delay start slightly while using nearly the full section scroll range.
  const effectiveProgress = Math.min(1, Math.max(0, (progress - 0.06) / 0.9));
  const maxTrackShift = 100 * (STATS.length - 1) - 150;
  const statTrackShift = effectiveProgress * maxTrackShift;

  return (
    <section
      ref={sectionRef}
      className="relative h-[190vh] w-full bg-transparent"
      aria-label="Our trust and impact"
    >
      <div className="sticky top-24 z-20 h-[calc(100dvh-6rem)] px-6">
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-white">
          <div className="relative z-20 shrink-0 bg-white px-2 pt-2">
            <div className="mx-auto w-full max-w-[900px] text-center">
              <span className="inline-flex rounded-md bg-[#E1FDCB] px-6 py-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                OUR TRUST
              </span>
              <h2 className="mt-6 text-3xl font-bold leading-tight text-secondary md:text-5xl md:leading-[1.15]">
                Together, we turn issues into lasting change
              </h2>
            </div>
          </div>

          <div className="relative mt-20 flex-1 min-h-0 pt-0">
          <div className="relative mt-0 h-full min-h-0 overflow-hidden">
            <div className="absolute left-0 right-0 top-0 z-10 h-16 " />
            <div className="absolute bottom-0 left-0 right-0 z-10 h-16" />

            <div className="relative z-0 h-full overflow-hidden">
              <div
                className="h-[300%]"
                style={{
                  transform: `translateY(-${statTrackShift}%)`,
                  transition: "transform 120ms linear",
                }}
              >
                {STATS.map((stat, index) => (
                  <div key={stat.key} className="relative flex h-1/3 items-start justify-center text-center">
                    {index === 1 && (
                      <div
                        className="mt-20 pointer-events-none absolute inset-x-[-80%] top-1/2 flex -translate-y-1/2 justify-center"
                        aria-hidden
                      >
                        <Image
                          src="/semicircle.svg"
                          alt=""
                          width={2694}
                          height={1024}
                          className="h-auto w-full max-w-[2000px]"
                          sizes="(min-width: 1400px) 1400px, 120vw"
                        />
                      </div>
                    )}

                    <div className="trust-stat-surface relative z-10">
                      <p className="text-5xl font-bold leading-none text-primary md:text-7xl lg:text-8xl">
                        {stat.value}
                      </p>
                      <p className="mt-4 text-lg font-medium text-text-secondary md:text-xl">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
