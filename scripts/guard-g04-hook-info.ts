/* eslint-disable @typescript-eslint/no-explicit-any -- read-only inspection helper printing GitHub App state */
import { appJwt } from "../src/lib/auth/github";
const get = async (p: string) => { const r = await fetch("https://api.github.com" + p, { headers: { Authorization: "Bearer " + appJwt(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }); return { status: r.status, json: (await r.json().catch(() => null)) as any }; };
const app = await get("/app");
console.log(JSON.stringify({ perms: app.json?.permissions, events: app.json?.events }));
const hook = await get("/app/hook/config");
console.log(JSON.stringify({ status: hook.status, url: hook.json?.url, contentType: hook.json?.content_type, secretSet: hook.json?.secret === "********", insecure: hook.json?.insecure_ssl }));
const d = await get("/app/hook/deliveries?per_page=10");
console.log(JSON.stringify({ status: d.status, deliveries: (d.json ?? []).map?.((x: any) => ({ id: x.id, event: x.event, action: x.action, status: x.status, code: x.status_code, at: x.delivered_at, redelivery: x.redelivery })) }));
const inst = await get("/app/installations");
console.log(JSON.stringify((inst.json ?? []).map((i: any) => ({ id: i.id, perms: i.permissions, events: i.events, suspended: !!i.suspended_at }))));
