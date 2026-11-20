// Type support for Next.js static SVG imports used by the WetScan logo.
// Keep the existing SVG asset and runtime image rendering unchanged.
declare module "*.svg" {
  const image: {
    src: string;
    width: number;
    height: number;
    blurDataURL?: string;
  };
  export default image;
}
