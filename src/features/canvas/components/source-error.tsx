"use client";
import Link from "next/link";
import { Button } from "@/components/ui";
export function SourceError({ message }: { message: string }) {
  return (
    <div className="page">
      <h1>Repository map unavailable</h1>
      <p role="alert">{message}</p>
      <div className="actions">
        <Button onClick={() => window.location.reload()}>
          Retry source analysis
        </Button>
        <Link href="/app/projects">Back to repositories</Link>
      </div>
    </div>
  );
}
