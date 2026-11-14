"use client";
import { useState } from "react";
import { Canvas } from "../../../src/components/views/canvas";

// Internal source switching is available only in this isolated test host.
export function FixtureCanvas() {
  const [source, setSource] = useState("demo");
  return (
    <>
      <label style={{ display: "block", padding: "8px 24px", fontSize: 12 }}>
        Canvas data source
        <select
          aria-label="Canvas data source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="demo">Orderly Demo · synthetic fixtures</option>
          <option value="a">Internal snapshot · Next.js App Router</option>
          <option value="b">Internal snapshot · Pages Router</option>
          <option value="c">Internal snapshot · WetScan miniature</option>
          <option value="d">Internal snapshot · partial / malformed</option>
          <option value="e">Internal snapshot · monorepo</option>
          <option value="empty">Internal snapshot · empty</option>
        </select>
      </label>
      <Canvas key={source} source={source} />
    </>
  );
}
