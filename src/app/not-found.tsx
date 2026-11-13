import Link from "next/link";
export default function NotFound() {
  return (
    <main className="empty full-page">
      <h1>That page isn’t on this map.</h1>
      <p>Return to the demo workspace and keep exploring.</p>
      <Link href="/app" className="button primary">
        Open workspace
      </Link>
    </main>
  );
}
