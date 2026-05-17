"use client";

import Link from "next/link";
import { useState } from "react";

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
  const [collapsed, setCollapsed] = useState(false);
  const nextStep = steps.find((step) => !step.complete);
  const completedCount = steps.filter((step) => step.complete).length;

  if (completedCount === steps.length) {
    return null;
  }

  return (
    <section className={`home-section setup-guide ${collapsed ? "collapsed" : ""}`} aria-labelledby="setup-guide-heading">
      <button
        type="button"
        className="setup-guide-toggle secondary"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <div>
          <div className="kicker">Suggested Setup Path</div>
          <h2 id="setup-guide-heading">{title}</h2>
        </div>
        <span aria-hidden="true">{collapsed ? "v" : "^"}</span>
      </button>

      {collapsed ? null : (
        <div className="setup-guide-body">
          <div className="section-header-row">
            <p>{description}</p>
            <span className="badge-pill">{completedCount} / {steps.length} done</span>
          </div>

          <div className="setup-checklist">
            {steps.map((step, index) => {
              const isNext = nextStep?.id === step.id;
              return (
                <article key={step.id} className={`setup-step ${step.complete ? "complete" : ""} ${isNext ? "next" : ""}`}>
                  <div className="setup-step-marker" aria-hidden="true">
                    {step.complete ? "OK" : index + 1}
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

          {nextStep ? <p className="setup-next-note">Suggested next step: {nextStep.title}.</p> : null}
          <button type="button" className="setup-guide-collapse secondary" onClick={() => setCollapsed(true)} aria-label="Collapse suggested setup path">
            ^
          </button>
        </div>
      )}
    </section>
  );
}
