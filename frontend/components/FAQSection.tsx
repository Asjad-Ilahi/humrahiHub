"use client";

import Link from "next/link";
import { useState } from "react";

const faqs = [
  {
    q: "What is the purpose of this platform?",
    a: "This platform is designed to connect people who care about the same problems and help them work together to create real, measurable impact instead of just discussing issues.",
  },
  {
    q: "How does the system ensure trust and transparency?",
    a: "Every contribution, progress update, and key action is tracked with clear visibility so communities can verify what is happening and where resources are being used.",
  },
  {
    q: "How can I contribute to a project?",
    a: "You can join causes aligned with your interests, collaborate with others, and support initiatives through verified participation and transparent funding flows.",
  },
  {
    q: "Can I track the impact of my contribution?",
    a: "Yes. The platform is built around visible progress, accountability, and proof of outcomes, so contributors can see real-world impact over time.",
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section id="faqs" className="mx-auto w-full max-w-[1280px] px-6 pb-14 pt-16">
      <div className="text-center">
        <span className="inline-flex rounded-md bg-[#E1FDCB] px-6 py-2 text-xs font-semibold uppercase tracking-wide text-secondary">
          FREQUENTLY ASKED QUESTIONS
        </span>
        <h2 className="mx-auto mt-6 max-w-7xl text-4xl font-bold leading-tight text-secondary md:text-6xl">
          Find quick answers to common questions about how the platform works
        </h2>
      </div>

      <div className="mx-auto mt-12 w-full max-w-[1180px] border-t border-stroke">
        {faqs.map((item, i) => (
          <div key={item.q} className="border-b border-stroke py-6">
            <button
              className="flex w-full items-center justify-between text-left text-[20px] font-medium text-secondary md:text-[26px]"
              onClick={() => setOpenIndex((curr) => (curr === i ? -1 : i))}
              type="button"
            >
              <span>{item.q}</span>
              <span className="ml-6 text-text-secondary">{openIndex === i ? "−" : "+"}</span>
            </button>
            {openIndex === i && (
              <p className="mt-4 max-w-5xl text-base leading-relaxed text-text-secondary md:text-lg">{item.a}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 flex items-center justify-center gap-6">
        <Link
          href="/faqs"
          className="rounded-full border border-secondary px-6 py-2.5 text-sm font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white"
        >
          More Questions
        </Link>
        <Link href="#cta" className="group inline-flex items-center gap-3 text-sm font-medium text-text-secondary">
          CONTACT US
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-stroke transition-transform duration-300 group-hover:translate-x-0.5">
            ↗
          </span>
        </Link>
      </div>
    </section>
  );
}
