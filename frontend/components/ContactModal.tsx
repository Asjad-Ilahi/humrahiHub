"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Phase = "form" | "success";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ContactModal({ open, onClose }: Props) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setPhase("form");
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return;
    }
    const t = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "form") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, phase]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("success");
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 2400);
  };

  const handleBackdropClick = () => {
    if (phase === "form") onClose();
  };

  if (!open) return null;

  return (
    <div
      className="contact-modal-overlay fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleBackdropClick();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="contact-modal-panel relative w-full max-w-[440px] overflow-hidden rounded-3xl border border-stroke bg-white shadow-[0_24px_80px_-12px_rgba(19,19,19,0.25)]"
      >
        <button
          type="button"
          onClick={() => (phase === "form" ? onClose() : undefined)}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-card hover:text-secondary disabled:pointer-events-none disabled:opacity-40"
          aria-label="Close"
          disabled={phase === "success"}
        >
          <span className="text-xl leading-none">×</span>
        </button>

        {phase === "form" ? (
          <div className="p-8 pt-10 md:p-10 md:pt-12">
            <h2 id={titleId} className="text-2xl font-bold text-secondary md:text-3xl">
              Contact us
            </h2>
            <p className="mt-2 text-sm text-text-secondary md:text-base">
              Tell us how we can help. We read every message.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="contact-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-secondary">
                  Name
                </label>
                <input
                  ref={firstFieldRef}
                  id="contact-name"
                  name="name"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-stroke bg-white px-4 py-3 text-secondary outline-none transition-shadow focus:border-secondary focus:ring-2 focus:ring-secondary/15"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-secondary">
                  Email
                </label>
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-stroke bg-white px-4 py-3 text-secondary outline-none transition-shadow focus:border-secondary focus:ring-2 focus:ring-secondary/15"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="contact-subject" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-secondary">
                  Subject <span className="font-normal normal-case text-text-secondary">(optional)</span>
                </label>
                <input
                  id="contact-subject"
                  name="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-stroke bg-white px-4 py-3 text-secondary outline-none transition-shadow focus:border-secondary focus:ring-2 focus:ring-secondary/15"
                  placeholder="What is this about?"
                />
              </div>
              <div>
                <label htmlFor="contact-message" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-secondary">
                  Message
                </label>
                <textarea
                  id="contact-message"
                  name="message"
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full resize-none rounded-xl border border-stroke bg-white px-4 py-3 text-secondary outline-none transition-shadow focus:border-secondary focus:ring-2 focus:ring-secondary/15"
                  placeholder="How can we help?"
                />
              </div>
              <button
                type="submit"
                className="mt-2 w-full rounded-full bg-secondary py-3.5 text-sm font-semibold uppercase tracking-wide text-primary transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0"
              >
                Submit
              </button>
            </form>
          </div>
        ) : (
          <div className="contact-success-inner flex min-h-[320px] flex-col items-center justify-center px-8 py-14 text-center md:min-h-[360px] md:px-10">
            <div className="contact-success-burst" aria-hidden="true">
              {Array.from({ length: 10 }).map((_, i) => (
                <span
                  key={i}
                  className="contact-success-ray-arm"
                  style={{ transform: `rotate(${i * 36}deg)` }}
                >
                  <span
                    className="contact-success-ray-glow"
                    style={{ animationDelay: `${60 + i * 28}ms` }}
                  />
                </span>
              ))}
            </div>
            <div className="contact-success-icon-wrap">
              <svg className="contact-success-check" viewBox="0 0 52 52" aria-hidden="true">
                <circle className="contact-success-check-circle" cx="26" cy="26" r="22" fill="none" />
                <path className="contact-success-check-mark" fill="none" d="M14 27l8 8 16-20" />
              </svg>
            </div>
            <p className="contact-success-title mt-8 text-xl font-bold text-secondary md:text-2xl">
              Your request has been submitted
            </p>
            <p className="contact-success-sub mt-2 max-w-[280px] text-sm text-text-secondary">
              Thank you. We will get back to you soon.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
