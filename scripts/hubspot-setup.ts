// One-off HubSpot setup: creates the Aangan contact properties and lists deal pipelines,
// stages and owners so you can fill HUBSPOT_PIPELINE_ID, HUBSPOT_DEAL_STAGE_ID, HUBSPOT_OWNER_ID.
// Usage: npx tsx scripts/hubspot-setup.ts
import "./load-env";
import { env } from "../lib/env";
import { CONTACT_PROPERTIES } from "../lib/integrations/hubspot";

const headers = { authorization: `Bearer ${env("HUBSPOT_TOKEN")}`, "content-type": "application/json" };
const api = (path: string, init?: RequestInit) => fetch(`https://api.hubapi.com${path}`, { ...init, headers });

async function main() {
  for (const p of CONTACT_PROPERTIES) {
    const res = await api("/crm/v3/properties/contacts", {
      method: "POST",
      body: JSON.stringify({ ...p, type: "string", fieldType: "text", groupName: "contactinformation" }),
    });
    console.log(`${p.name}: ${res.ok ? "created" : res.status === 409 ? "already exists" : `failed (${res.status})`}`);
  }

  const pipelines = (await (await api("/crm/v3/pipelines/deals")).json()) as {
    results: { id: string; label: string; stages: { id: string; label: string }[] }[];
  };
  console.log("\nDeal pipelines:");
  for (const p of pipelines.results) {
    console.log(`  ${p.label}  HUBSPOT_PIPELINE_ID=${p.id}`);
    for (const s of p.stages) console.log(`    ${s.label}  HUBSPOT_DEAL_STAGE_ID=${s.id}`);
  }

  const owners = (await (await api("/crm/v3/owners")).json()) as { results: { id: string; firstName?: string; lastName?: string }[] };
  console.log("\nOwners:");
  for (const o of owners.results) console.log(`  ${[o.firstName, o.lastName].filter(Boolean).join(" ")}  HUBSPOT_OWNER_ID=${o.id}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
