import Link from "next/link";

export type SetupStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  complete: boolean;
};

export default function SetupGuide({
  title,
  description,
  steps,
}: {
  title: string;
  description: string;
  steps: SetupStep[];
}) {
  const nextStep = steps.find((step) => !step.complete);
  const completedCount = steps.filter((step) => step.complete).length;

  return (
    <section className="home-section setup-guide" aria-labelledby="setup-guide-heading">
      <div className="section-header-row">
        <div>
          <div className="kicker">Suggested Setup Path</div>
          <h2 id="setup-guide-heading">{title}</h2>
          <p>{description}</p>
        </div>
        <span className="badge-pill">{completedCount} / {steps.length} done</span>
      </div>

      <div className="setup-checklist">
        {steps.map((step, index) => {
          const isNext = nextStep?.id === step.id;
          return (
            <article key={step.id} className={`setup-step ${step.complete ? "complete" : ""} ${isNext ? "next" : ""}`}>
              <div className="setup-step-marker" aria-hidden="true">
                {step.complete ? "✓" : index + 1}
              </div>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
                <Link href={step.href}>
                  <button type="button" className={isNext ? "suggested-action" : "secondary"}>
                    {step.complete ? "Review" : step.actionLabel}
                  </button>
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {nextStep ? (
        <p className="setup-next-note">Suggested next step: {nextStep.title}.</p>
      ) : (
        <p className="setup-next-note">Setup path complete. Keep reading, reviewing, and adjusting goals as your family learns what works.</p>
      )}
    </section>
  );
}
