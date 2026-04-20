"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const steps = [
  {
    num: "01",
    title: "Report an Issue",
    description:
      "Spot a community problem. Create a report with a title, description, and funding goal.",
    footer: "hashtags" as const,
    hashtags: ["#PotholeProblem", "#CleanWaterAccess"],
  },
  {
    num: "02",
    title: "Set a Goal",
    description:
      "Choose how much funding is needed. Every contribution is tracked openly for the community.",
    footer: "slider" as const,
  },
  {
    num: "03",
    title: "Community Funds",
    description:
      "Others chip in to support your cause. Funds are held securely until the goal is reached.",
    footer: "blockchain" as const,
  },
  {
    num: "04",
    title: "Real Impact",
    description:
      "When fully funded, work begins. The community can track progress every step of the way.",
    footer: "workers" as const,
  },
];

export default function HowHumrahiHubWorksSection() {
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
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="mx-auto w-full max-w-[1280px] bg-white px-6 pb-24 pt-8"
    >
      <div
        className={`reveal-scroll-item text-center transition-all duration-700 ease-out ${
          visible ? "reveal-scroll-visible" : "reveal-scroll-hidden"
        }`}
        style={{ transitionDelay: "0ms" }}
      >
        <span className="inline-flex rounded-lg bg-primary/45 px-8 py-2.5 text-sm font-semibold tracking-wide text-secondary">
          HOW HUMRAHI HUB WORKS
        </span>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => (
          <article
            key={step.num}
            className={`reveal-scroll-item flex flex-col rounded-[56px] border border-[#efefef] bg-white p-6 transition-all duration-700 ease-out ${
              visible ? "reveal-scroll-visible" : "reveal-scroll-hidden"
            }`}
            style={{ transitionDelay: `${120 + index * 100}ms` }}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#ececec] text-sm font-semibold text-secondary">
              {step.num}
            </div>

            <h3 className="mt-6 text-xl font-bold leading-tight text-secondary md:text-2xl">
              {step.title}
            </h3>

            <p className="mt-4 flex-1 text-[15px] leading-relaxed text-text-secondary md:text-base">
              {step.description}
            </p>

            <div className="mt-0 min-h-[12px] border-stroke/60 ">
              {step.footer === "hashtags" && (
                <p className="text-xs font-medium text-text-secondary">
                  {step.hashtags?.join(" ")}
                </p>
              )}
              {step.footer === "slider" && (
                <div className="relative h-9 w-[240px]">
                  <Image
                    src="/slider.png"
                    alt="Funding goal slider"
                    fill
                    className="object-contain object-left"
                    sizes="200px"
                  />
                </div>
              )}
              {step.footer === "blockchain" && (
                <div className="relative h-10 w-[160px]">
                  <Image
                    src="/securebyblockchain.png"
                    alt="Secured by Blockchain"
                    fill
                    className="object-contain object-left"
                    sizes="240px"
                  />
                </div>
              )}
              {step.footer === "workers" && (
                <div className="relative h-14 w-[140px]">
                  <Image
                    src="/certifiedworkers.png"
                    alt="Certified Workers"
                    fill
                    className="object-contain object-left"
                    sizes="220px"
                  />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
