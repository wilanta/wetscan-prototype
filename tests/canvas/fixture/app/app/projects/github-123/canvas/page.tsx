// Browser fixture: the real LiveCanvas (CAN-008 overlay wiring) with a fixed authorized graph; transport is mocked.
import { Suspense } from "react";
import { LiveCanvas } from "@/features/canvas/components/live-canvas";
import { s10Graph } from "../../../../../s10-graph";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Suspense fallback={<p>Preparing…</p>}>
      <LiveCanvas
        projectId="github-123"
        initialEntry={{
          graph: s10Graph(),
          repositoryName: "fixture/wetscan-web",
          scope: "s10-fixture-scope",
        }}
      />
    </Suspense>
  );
}
