import { DemoProvider } from "../../../../src/components/demo-provider";
import "../../../../src/app/globals.css";
export { metadata } from "../../../../src/app/layout";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
