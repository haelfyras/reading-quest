"use client";

import { useState } from "react";

export default function BetaDisclaimer() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className={`beta-disclaimer ${collapsed ? "collapsed" : ""}`} aria-labelledby="beta-disclaimer-heading">
      <button
        type="button"
        className="beta-disclaimer-toggle secondary"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span id="beta-disclaimer-heading">Beta Disclaimer</span>
        <span aria-hidden="true">{collapsed ? "v" : "^"}</span>
      </button>

      {!collapsed ? (
        <div className="beta-disclaimer-body">
          <p>
            Reading Quest is in private beta. Quizzes may occasionally contain a wrong answer,
            an unclear question, or a question that does not fit the book. Please report anything
            that feels off so we can improve quiz quality.
          </p>
          <ul className="small-list">
            <li>Use the same device and browser during beta; progress may not sync elsewhere yet.</li>
            <li>Do not enter unnecessary personal information for children.</li>
            <li>Parents should review quiz reports, prize claims, friends, and child settings.</li>
            <li>Audiobooks, read-aloud books, library books, rereading, and assisted reading all count.</li>
          </ul>
          <button type="button" className="beta-disclaimer-collapse secondary" onClick={() => setCollapsed(true)} aria-label="Collapse beta disclaimer">
            ^
          </button>
        </div>
      ) : null}
    </section>
  );
}
