/** Harmless, deliberately constructed security-test files for the dedicated G02 acceptance repository. Data only. */
import { iacFixtures } from "./iac-fixtures";
/** Synthetic canary shaped like a GitHub token; it is not a credential and is never printed or stored unredacted. */
export const syntheticCanary = () =>
  "ghp_" +
  Array.from(
    { length: 36 },
    (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789"[(i * 7 + 3) % 36],
  ).join("");
export function acceptanceFiles(vulnerable: boolean): Record<string, string> {
  const name = vulnerable ? "lodash" : "is-number",
    version = vulnerable ? "4.17.15" : "7.0.0";
  return {
    "README.md":
      "# WetScan G02 acceptance fixture\n\nSynthetic, harmless test input for the WetScan Guard scanners. Not an application.\n",
    "src/route.js": vulnerable
      ? "export function route(input) { return eval(input); }\n"
      : "export function route(input) { return String(input); }\n",
    "src/route.ts": vulnerable
      ? "export function route(input: string) { return eval(input); }\n"
      : "export function route(input: string): string { return input; }\n",
    "src/view.tsx": vulnerable
      ? "export function Page({value}: {value: string}) { return <div>{eval(value)}</div>; }\n"
      : "export function Page() { return <div>Controlled fixture</div>; }\n",
    "config/token.txt": vulnerable
      ? "token = " + syntheticCanary() + "\n"
      : "NO_CREDENTIALS_IN_FIXED_REVISION\n",
    "infra/main.tf": vulnerable
      ? 'resource "aws_security_group" "fixture" {\n  name = "fixture"\n  ingress {\n    from_port = 0\n    to_port = 0\n    protocol = "-1"\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n}\n'
      : 'locals { fixture = "safe-static-value" }\n',
    ...Object.fromEntries(
      Object.entries(iacFixtures(vulnerable)).map(([p, c]) => ["infra/" + p, c]),
    ),
    "packages/app/package-lock.json":
      JSON.stringify(
        {
          name: "g02-acceptance",
          version: "1.0.0",
          lockfileVersion: 3,
          packages: {
            "": {
              name: "g02-acceptance",
              version: "1.0.0",
              dependencies: { [name]: version },
            },
            ["node_modules/" + name]: { version },
          },
        },
        null,
        2,
      ) + "\n",
  };
}
