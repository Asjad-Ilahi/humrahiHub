export default function Home() {
  return (
    <main className="min-h-screen bg-background px-6 py-12 font-sans text-text-primary">
      <section className="mx-auto w-full max-w-4xl rounded-2xl border border-stroke bg-card p-10">
        <span className="inline-block rounded-full bg-primary px-4 py-1 text-sm font-semibold text-secondary">
          Welcome
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">HumRahi hub</h1>
        <p className="mt-4 max-w-2xl text-lg text-text-secondary">
          Frontend is ready with Next.js + Tailwind and your brand palette configured.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <div className="rounded-lg border border-stroke bg-background px-4 py-2 text-sm">
            Primary: #AFFF6F
          </div>
          <div className="rounded-lg border border-stroke bg-background px-4 py-2 text-sm">
            Secondary: #131313
          </div>
          <div className="rounded-lg border border-stroke bg-background px-4 py-2 text-sm">
            Card: #F3F3F3
          </div>
        </div>
      </section>
    </main>
  );
}
