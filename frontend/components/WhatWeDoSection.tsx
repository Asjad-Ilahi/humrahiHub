"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function WhatWeDoSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="mx-auto w-full max-w-[1280px] px-6 pb-24 pt-6"
    >
      <div className="text-center">
        <span
          className={`reveal-scroll-item inline-flex rounded-lg bg-primary/45 px-10 py-2 text-sm font-semibold text-secondary transition-all duration-700 ease-out ${
            visible ? "reveal-scroll-visible" : "reveal-scroll-hidden"
          }`}
          style={{ transitionDelay: "0ms" }}
        >
          WHAT WE DO
        </span>

        <p
          className={`reveal-scroll-item mx-auto mt-10 max-w-[1160px] text-[32px] font-semibold leading-[1.42] tracking-[-0.01em] text-secondary md:text-[56px] md:leading-[1.26] transition-all duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            visible ? "reveal-scroll-visible" : "reveal-scroll-hidden"
          }`}
          style={{ transitionDelay: "120ms" }}
        >
          <span className="text-[#a7a7a7]">We </span>
          connect people facing local problems{" "}
          <span className="mx-1 inline-flex h-14 w-14 translate-y-1 items-center justify-center rounded-full bg-[#e9f10d] md:h-[60px] md:w-[60px]">
            <Image src="/wifi-issue.svg" alt="problem icon" width={30} height={30} />
          </span>
          <span className="text-[#a7a7a7]"> with those willing to help </span>
          solve them, making it{" "}
          <span className="text-[#a7a7a7]">easy to fund </span>
          <span className="mx-1 inline-flex h-14 w-14 translate-y-1 items-center justify-center rounded-full bg-primary md:h-[60px] md:w-[60px]">
            <Image src="/refund.svg" alt="fund icon" width={30} height={30} />
          </span>
          , support, and take real action within the community{" "}
          <span className="mx-1 inline-flex h-14 w-14 translate-y-1 items-center justify-center rounded-full bg-[#9dc4f0] md:h-[60px] md:w-[60px]">
            <Image src="/community.svg" alt="community icon" width={30} height={30} />
          </span>
        </p>

        <div
          className={`reveal-scroll-item mt-12 transition-all duration-700 ease-out ${
            visible ? "reveal-scroll-visible" : "reveal-scroll-hidden"
          }`}
          style={{ transitionDelay: "280ms" }}
        >
          <button className="group inline-flex items-center gap-4 text-xl font-medium text-text-secondary transition-colors duration-300 hover:text-secondary">
            LEARN MORE
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke transition-transform duration-300 group-hover:translate-x-1">
              ↗
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
