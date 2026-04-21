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
    <section className="mx-auto w-full max-w-[1280px] px-6 py-20 md:py-28">
      <div className="animate-fade-slide-in text-center">
        <div className="flex flex-wrap items-center justify-center gap-4 text-secondary">
          <h1 className="text-5xl font-bold leading-[1.05] md:text-8xl">See a</h1>

          <div className="relative h-[115px] w-[340px] overflow-hidden rounded-full border border-stroke bg-primary shadow-sm">
            <Image
              src={activeImage}
              alt="Civic issue visual"
              fill
              className={`hero-image-base object-cover ${isTransitioning ? "hero-image-exit-flip-up" : ""}`}
              sizes="340px"
              priority
            />
            {isTransitioning && (
              <Image
                src={nextImage}
                alt="Next civic issue visual"
                fill
                className="hero-image-enter-flip-up object-cover"
                sizes="340px"
              />
            )}
          </div>

          <h1 className="text-5xl font-bold leading-[1.05] md:text-8xl">problem</h1>
        </div>

        <h2 className="mt-4 text-5xl font-bold leading-[1.05] text-secondary md:text-8xl">
          Share it. Solve it <span className="text-[#76c943]">together</span>
        </h2>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-6">
          <Button variant="joinNow" className="min-w-50 text-xl font-normal h-[80px]">
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
