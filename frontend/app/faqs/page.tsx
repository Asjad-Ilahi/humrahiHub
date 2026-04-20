const detailedFaqs = [
  {
    q: "What problem does HumRahi Hub solve?",
    a: "HumRahi Hub addresses the \"someone should fix it\" paradox by turning isolated concern into coordinated action. It connects people who care about the same issue and gives them a transparent path from idea to verified impact.",
  },
  {
    q: "Why do good community ideas fail before execution?",
    a: "Most ideas fail because of isolation and trust gaps. People care, but they struggle to find aligned collaborators, and contributors hesitate when systems lack visibility, accountability, and proof of progress.",
  },
  {
    q: "How does the platform bridge the isolation barrier?",
    a: "The system helps community formation around shared concerns. It groups people by real local problems, enables collaboration, and creates momentum so projects are not dependent on a single person.",
  },
  {
    q: "How is transparency enforced in projects?",
    a: "HumRahi Hub is designed so project activity is visible end-to-end: contribution flow, milestones, progress updates, and outcomes. This creates accountability and lets contributors verify that work is actually happening.",
  },
  {
    q: "How are funds secured and controlled?",
    a: "Funds move through a controlled, verifiable process tied to project progress. The goal is to prevent opaque money flow by making each stage observable and reducing misuse risk.",
  },
  {
    q: "Can contributors verify truth and progress in real time?",
    a: "Yes. The product vision is inspired by real-time systems: if people can track deliveries live, they should also be able to track social impact with the same confidence.",
  },
  {
    q: "Is this just another idea-sharing app?",
    a: "No. The mission is not to stop at discussion. HumRahi Hub is intended as an execution system that links people, tracks progress, and pushes projects toward real outcomes.",
  },
  {
    q: "What does success look like for this platform?",
    a: "Success means communities can consistently move from \"someone should fix this\" to \"we fixed this together\" through trusted collaboration, transparent execution, and measurable impact.",
  },
];

export default function FaqsPage() {
  return (
    <main className="min-h-screen bg-white px-6 pb-20 pt-14 text-text-primary">
      <section className="mx-auto w-full max-w-[1100px]">
        <span className="inline-flex rounded-md bg-[#E1FDCB] px-6 py-2 text-xs font-semibold uppercase tracking-wide text-secondary">
          MORE QUESTIONS
        </span>
        <h1 className="mt-6 text-4xl font-bold leading-tight text-secondary md:text-6xl">
          System FAQs and Architecture Intent
        </h1>
        <p className="mt-4 max-w-3xl text-lg text-text-secondary">
          Detailed answers about trust, community formation, transparency, fund control, and how HumRahi Hub turns
          ideas into verified execution.
        </p>

        <div className="mt-10 border-t border-stroke">
          {detailedFaqs.map((faq) => (
            <article key={faq.q} className="border-b border-stroke py-7">
              <h2 className="text-2xl font-semibold text-secondary">{faq.q}</h2>
              <p className="mt-3 text-base leading-relaxed text-text-secondary md:text-lg">{faq.a}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
