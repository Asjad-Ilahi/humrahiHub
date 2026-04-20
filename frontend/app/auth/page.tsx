import AuthFlow from "@/features/auth/components/AuthFlow";

export default function AuthPage() {
  return (
    <main className="min-h-screen bg-white px-6 pb-16 pt-10 text-text-primary md:px-10">
      <section className="mx-auto w-full max-w-5xl rounded-[36px] border border-stroke bg-gradient-to-b from-card/70 to-white p-6  md:p-10">
        <AuthFlow />
      </section>
    </main>
  );
}
