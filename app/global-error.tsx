"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <div className="hero-panel">
            <div>
              <div className="kicker">Quest Interrupted</div>
              <h1>Something went wrong</h1>
              <p>{error.message || "Reading Quest hit an app error."}</p>
            </div>
            <button type="button" className="secondary" onClick={reset}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
