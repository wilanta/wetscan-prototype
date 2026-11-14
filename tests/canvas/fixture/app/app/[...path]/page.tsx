import ProductionPage from "../../../../../../src/app/app/[...path]/page";
import { Canvas } from "../../../../../../src/components/views/canvas";
import { FixtureCanvas } from "../../../fixture-canvas";
import { visualGraph } from "../../../../visual-graphs";
export default async function Page(props: {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{
    scenario?: string;
    fixtures?: string;
    revision?: string | string[];
  }>;
}) {
  const { path } = await props.params;
  if (
    path.join("/") === "projects/orderly-demo/canvas" &&
    (await props.searchParams).fixtures === "1"
  )
    return <FixtureCanvas />;
  if (path.join("/") === "projects/layout-fixture/canvas") {
    const { scenario = "small" } = await props.searchParams;
    return <Canvas initialGraph={visualGraph(scenario)} />;
  }
  return <ProductionPage {...props} />;
}
