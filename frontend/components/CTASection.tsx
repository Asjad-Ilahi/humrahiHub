import Link from "next/link";

export default function CTASection() {
  return (
    <section id="cta" className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-[#02050b] px-8 py-10 md:px-12 md:py-12">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[680px] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle,rgba(129,154,204,0.45)_0%,rgba(2,5,11,0)_70%)]" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <h3 className="text-4xl font-bold leading-tight text-primary md:text-6xl">Join and fix your community</h3>
          <Link
            href="#"
            className="rounded-full bg-primary px-8 py-3 text-sm font-semibold uppercase tracking-wide text-secondary transition-transform duration-300 hover:-translate-y-0.5"
          >
            Join Now
          </Link>
        </div>
      </div>
    </section>
  );
}
