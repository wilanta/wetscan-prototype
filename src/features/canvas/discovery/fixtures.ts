/** Sanitized internal examples, never a connected user's repository or onboarding source. */
export const fixtures: Record<
  string,
  { name: string; files: Record<string, string> }
> = {
  a: {
    name: "Next.js App Router example",
    files: {
      "package.json": JSON.stringify({
        name: "sample-app",
        dependencies: {
          next: "16.4.6",
          react: "19.3.1",
          "@clerk/nextjs": "example",
          "@prisma/client": "example",
          stripe: "installed-but-unused",
        },
        devDependencies: { typescript: "6.0.3" },
      }),
      "package-lock.json": "{}",
      "tsconfig.json": '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
      "src/app/page.tsx":
        "export default function Page() { return <main>Internal example</main> }",
      "src/app/(store)/api/orders/[id]/route.ts":
        'import { auth } from "@clerk/nextjs/server";\nimport { db } from "@/lib/db";\nexport async function GET() { const identity = await auth(); return db.order.findMany({ where: { user: identity.userId } }); }\nexport async function PATCH() { return new Response("example"); }',
      "src/lib/db.ts":
        'import { PrismaClient } from "@prisma/client";\nexport const db = new PrismaClient();',
      "prisma/schema.prisma":
        'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\n',
      "vercel.json": '{"framework":"nextjs"}',
      ".env.example":
        "DATABASE_URL=DO_NOT_RETAIN_EXAMPLE_VALUE\nAPI_KEY=DO_NOT_RETAIN_EXAMPLE_VALUE",
    },
  },
  b: {
    name: "Pages Router example",
    files: {
      "package.json":
        '{"dependencies":{"next":"16","stripe":"example","@clerk/nextjs":"installed-but-unused"}}',
      "pages/api/payments/index.ts":
        'import Stripe from "stripe";\nconst stripe = new Stripe(process.env.STRIPE_KEY!);\nexport default async function handler() { return stripe.customers.list(); }',
      "pages/index.tsx":
        "export default function Page() { return <main>Example</main> }",
      ".github/workflows/check.yml":
        "name: Checks\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps: []",
    },
  },
  c: {
    name: "WetScan source miniature",
    files: {
      "package.json":
        '{"name":"wetscan-miniature","dependencies":{"next":"16","react":"19"}}',
      "src/app/api/auth/github/route.ts":
        'import { newSession } from "@/lib/auth/session";\nexport async function GET() { return newSession(); }',
      "src/app/api/onboarding/route.ts":
        'import { profileFor } from "@/lib/auth/session";\nexport async function POST() { return profileFor(); }',
      "src/lib/auth/session.ts":
        'import { writeFile } from "node:fs/promises";\nimport { createCipheriv } from "node:crypto";\nexport async function newSession() { return { storage: "encrypted filesystem" }; }\nexport async function profileFor() { return {}; }\nexport const encryption = createCipheriv;\nexport const store = writeFile;',
      "src/app/page.tsx":
        "export default function Page() { return <main>Miniature</main> }",
    },
  },
  d: {
    name: "Partial and malformed example",
    files: {
      "package.json": "{broken-json",
      "src/app/api/bad/route.ts": "export async function GET( {",
      "../escape.ts": "SECRET_MUST_NOT_APPEAR",
      ".env": "SECRET_MUST_NOT_APPEAR",
      "huge.ts": "x".repeat(256_001),
      "unknown.txt": "unsupported",
      "binary.ts": "\0binary",
    },
  },
  e: {
    name: "Monorepo example",
    files: {
      "package.json": '{"workspaces":["apps/*"]}',
      "apps/shop/package.json":
        '{"dependencies":{"next":"16","react":"19","redis":"example"}}',
      "apps/shop/src/app/page.tsx":
        "export default function Page() { return <main>Shop</main> }",
      "apps/shop/src/app/api/cache/route.ts":
        'import { createClient } from "redis";\nexport function GET() { return createClient(); }',
      "apps/admin/package.json": '{"dependencies":{"next":"16","react":"19"}}',
      "apps/admin/src/app/api/audit/route.ts":
        'export function GET() { return new Response("sample"); }',
    },
  },
};
