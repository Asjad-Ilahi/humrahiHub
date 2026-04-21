"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "./Button";
import { useLandingContact } from "./LandingContactProvider";

const heroImages = ["/broken-road.png", "/broken-manhole.png", "/broken-streetlight.png"];

export default function Hero() {
  const { openContact } = useLandingContact();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsTransitioning(true);
      timeoutRef.current = setTimeout(() => {
        setActiveImageIndex((prev) => (prev + 1) % heroImages.length);
        setIsTransitioning(false);
      }, 900);
    }, 3600);

    return () => {
      clearInterval(timer);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const activeImage = useMemo(() => heroImages[activeImageIndex], [activeImageIndex]);
  const nextImage = useMemo(
    () => heroImages[(activeImageIndex + 1) % heroImages.length],
    [activeImageIndex],
  );

  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 py-16 md:px-6 md:py-28">
      <div className="animate-fade-slide-in text-center">
        <div className="flex flex-wrap items-center justify-center gap-4 text-secondary">
          <h1 className="text-4xl font-bold leading-[1.05] sm:text-5xl md:text-8xl">See a</h1>

          <div className="relative h-[88px] w-[250px] overflow-hidden rounded-full border border-stroke bg-primary shadow-sm sm:h-[115px] sm:w-[340px]">
            <Image
              src={activeImage}
              alt="Civic issue visual"
              fill
              className={`hero-image-base object-cover ${isTransitioning ? "hero-image-exit-flip-up" : ""}`}
              sizes="(max-width: 640px) 250px, 340px"
              priority
            />
            {isTransitioning && (
              <Image
                src={nextImage}
                alt="Next civic issue visual"
                fill
                className="hero-image-enter-flip-up object-cover"
                sizes="(max-width: 640px) 250px, 340px"
              />
            )}
          </div>

          <h1 className="text-4xl font-bold leading-[1.05] sm:text-5xl md:text-8xl">problem</h1>
        </div>

        <h2 className="mt-4 text-4xl font-bold leading-[1.05] text-secondary sm:text-5xl md:text-8xl">
          Share it. Solve it <span className="text-[#76c943]">together</span>
        </h2>

        <div className="mt-10 flex flex-col items-center justify-center gap-5 sm:mt-12 sm:flex-row sm:flex-wrap sm:gap-6">
          <Button variant="joinNow" className="h-[64px] min-w-[220px] text-lg font-normal sm:h-[80px] sm:min-w-50 sm:text-xl">
            JOIN NOW
          </Button>

          <button
            type="button"
            onClick={openContact}
            className="group inline-flex items-center gap-4 text-xl font-normal text-text-secondary transition-colors duration-300 hover:text-secondary"
          >
            CONTACT US
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke transition-transform duration-300 group-hover:translate-x-1">
              ↗
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
