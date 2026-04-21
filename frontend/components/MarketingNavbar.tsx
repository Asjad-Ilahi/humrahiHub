"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Button from "./Button";

const links = [
  { label: "WHAT WE DO", href: "/#what-we-do" },
  { label: "HOW IT WORKS", href: "/#how-it-works" },
  { label: "OUR TRUST", href: "/#our-trust" },
  { label: "FAQS", href: "/#faqs" },
];

export default function MarketingNavbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="animate-fade-slide-in fixed inset-x-0 top-0 z-50 border-b border-stroke bg-white/95 transition-all duration-300 hover:shadow-sm">
      <nav className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="HumRahi hub logo" width={44} height={44} />
          <span className="text-lg font-bold tracking-tight text-secondary sm:text-2xl">HUMRAHI HUB</span>
        </Link>

        <ul className="hidden items-center gap-14 lg:flex">
          {links.map((link) => (
            <li
              key={link.label}
              className="cursor-pointer text-sm font-medium text-secondary transition-colors duration-300 hover:text-text-secondary"
            >
              <Link href={link.href}>{link.label}</Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="text-sm font-semibold text-secondary hover:text-text-secondary">
            Log in
          </Link>
          <Link href="/auth">
            <Button variant="joinNow" className="px-7 py-2.5 text-sm font-semibold">
              Join Now
            </Button>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stroke text-secondary lg:hidden"
          aria-expanded={menuOpen}
          aria-label="Toggle menu"
        >
          {menuOpen ? "×" : "☰"}
        </button>
      </nav>
      {menuOpen && (
        <div className="border-t border-stroke bg-white px-4 py-4 lg:hidden">
          <ul className="space-y-3">
            {links.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="block text-sm font-medium text-secondary"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-3">
            <Link href="/login" onClick={() => setMenuOpen(false)} className="text-sm font-semibold text-secondary">
              Log in
            </Link>
            <Link href="/auth" onClick={() => setMenuOpen(false)}>
              <Button variant="joinNow" className="px-5 py-2 text-sm font-semibold">
                Join Now
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
