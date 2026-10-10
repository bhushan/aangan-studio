// Runs the post-call review on a past call (the webhook does this for new calls).
//   npm run review -- <row id or Vaani room name>
import "./load-env";
import { getDeps } from "../lib/deps";
import { runReview } from "../lib/handlers";

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error("Usage: npm run review -- <call id>");
  const deps = getDeps();
  const call = (await deps.repo.findById(id)) ?? (await deps.repo.findByVaaniId(id));
  if (!call?.transcript) throw new Error(`No call with a transcript: ${id}`);
  const r = (await runReview(deps, call)).review!;
  console.log(`mid-call route ${call.route} | review route ${r.route}${r.closeReason ? ` (${r.closeReason})` : ""}`);
  console.log(`filled from transcript: ${r.filled.join(", ") || "nothing"}`);
  console.log(`note: ${r.note ?? "none (review agrees or cannot decide)"}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
