"use client";

import Link from "next/link";
import { Button, Card } from "@/components/ui";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty full-page">
      <Card style={{ maxWidth: 480, textAlign: "left" }}>
        <span className="eyebrow">WORKSPACE RECOVERY</span>
        <h1 style={{ marginTop: 8 }}>We couldn’t display this view.</h1>
        <p style={{ marginTop: 8 }}>
          Your workspace session or in-memory state may still be available. Try loading the view again or return home.
        </p>
        <div className="actions" style={{ marginTop: 18 }}>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className="button secondary">
            Return Home
          </Link>
        </div>
      </Card>
    </main>
  );
}
