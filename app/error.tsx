"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main>
      <div className="hero-panel">
        <div>
          <div className="kicker">Quest Interrupted</div>
          <h1>Something went wrong</h1>
          <p>{error.message || "Reading Quest hit a page error."}</p>
        </div>
        <button type="button" className="secondary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
