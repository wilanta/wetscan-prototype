"use client";
import { useSyncExternalStore } from "react";
import { GuardWorkbench } from "./workbench";
import { useDemo } from "@/components/demo-provider";
const subscribe = () => () => {};
/** Do not expose editable SSR forms before their browser handlers are ready. */
export function GuardDemoWorkspace({ section }: { section: string }) {
  const { resetVersion } = useDemo();
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!ready) return <p role="status">Preparing local browser tools…</p>;
  return (
    <GuardWorkbench
      key={resetVersion}
      section={section === "/" ? "" : section}
      fixtureWorkflow={process.env.NODE_ENV !== "production"}
    />
  );
}

/** Native disclosure controls also wait for hydration, so early clicks are not lost. */
export function GuardDemoExamples({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <details inert={!ready} aria-busy={!ready}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}
