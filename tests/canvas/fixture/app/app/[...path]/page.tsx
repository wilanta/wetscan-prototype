import ProductionPage from "../../../../../../src/app/app/[...path]/page";
import { CanvasPage } from "../../../../../../src/features/canvas/components/canvas-page";
import { visualGraph } from "../../../../visual-graphs";
export default async function Page(props: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ scenario?: string; revision?: string | string[] }>;
}) {
  const { path } = await props.params;
  if (path.join("/") === "projects/layout-fixture/canvas") {
    const { scenario = "small" } = await props.searchParams;
    return <CanvasPage initialGraph={visualGraph(scenario)} />;
  }
  return <ProductionPage {...props} />;
}
