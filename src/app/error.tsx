"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty full-page">
      <h1>We couldn’t display this view.</h1>
      <p>
        Your in-memory demo state may still be available. Try the view again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
