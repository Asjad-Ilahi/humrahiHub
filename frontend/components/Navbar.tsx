import Image from "next/image";
import Link from "next/link";
import Button from "./Button";

const links = [
  { label: "WHAT WE DO", href: "/#what-we-do" },
  { label: "HOW IT WORKS", href: "/#how-it-works" },
  { label: "OUR TRUST", href: "/#our-trust" },
  { label: "FAQS", href: "/#faqs" },
];

export default function Navbar() {
  return (
    <header className="animate-fade-slide-in fixed inset-x-0 top-0 z-50 border-b border-stroke bg-white/95 transition-all duration-300 hover:shadow-sm">
      <nav className="mx-auto flex w-full max-w-[1280px] items-center justify-between px-8 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="HumRahi hub logo" width={44} height={44} />
          <span className="text-2xl font-bold tracking-tight text-secondary">HUMRAHI HUB</span>
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

        <Link href="/#cta">
          <Button variant="joinNow" className="px-7 py-2.5 text-sm font-semibold">
            Join Now
          </Button>
        </Link>
      </nav>
    </header>
  );
}
