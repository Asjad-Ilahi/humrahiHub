"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "joinNow" | "walletInfo" | "donate" | "follow" | "reportIssue" | "topup" | "withdraw";

type ButtonProps = {
  variant: ButtonVariant;
  children: ReactNode;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const variantClasses: Record<ButtonVariant, string> = {
  joinNow:
    "rounded-full bg-primary text-secondary px-10 py-3 text-base font-semibold transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md",
  walletInfo:
    "rounded-full bg-secondary text-primary px-8 py-3 text-base font-medium transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md",
  donate:
    "rounded-full bg-primary text-secondary px-10 py-3 text-[30px] leading-none font-medium transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md",
  follow:
    "rounded-full bg-[#e8e8e8] text-secondary px-8 py-3 text-[30px] leading-none font-medium transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md",
  reportIssue:
    "rounded-[12px] bg-primary text-secondary px-5 py-2.5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
  topup:
    "rounded-[12px] bg-primary text-secondary px-6 py-2.5 text-sm font-semibold transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
  withdraw:
    "rounded-[12px] border-2 border-secondary bg-white px-6 py-2.5 text-sm font-semibold text-secondary transition-all duration-300 hover:bg-card active:scale-[0.98]",
};

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="3" stroke="#AFFF6F" strokeWidth="1.6" />
      <circle cx="16.5" cy="12" r="1.7" fill="#AFFF6F" />
    </svg>
  );
}

function DonateIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21c-2.9-2.1-6.5-4.8-6.5-8.5A3.5 3.5 0 0 1 9 9c1.3 0 2.3.6 3 1.5.7-.9 1.7-1.5 3-1.5a3.5 3.5 0 0 1 3.5 3.5c0 3.7-3.6 6.4-6.5 8.5Z"
        stroke="#131313"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 5v6" stroke="#131313" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 8h6" stroke="#131313" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function Button({
  variant,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${variantClasses[variant]} ${className}`} {...props}>
      <span className="inline-flex items-center justify-center gap-2">
        {variant === "walletInfo" && <WalletIcon />}
        {variant === "reportIssue" && <span className="text-lg font-bold leading-none">+</span>}
        <span>{children}</span>
        {variant === "donate" && <DonateIcon />}
        {variant === "follow" && <span className="text-3xl leading-none">+</span>}
      </span>
    </button>
  );
}
