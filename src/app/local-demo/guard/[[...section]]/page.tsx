import { redirect, notFound } from "next/navigation";
/** Compatibility URL only: existing authenticated Demo Mode owns all UI/state. */
export default async function LegacyGuardDemo({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const section = ((await params).section ?? []).join("/");
  if (
    ![
      "",
      "scans",
      "findings",
      "inventory",
      "remediation",
      "integrity",
      "releases",
    ].includes(section)
  )
    notFound();
  redirect("/app/projects/orderly-demo/guard" + (section ? "/" + section : ""));
}
