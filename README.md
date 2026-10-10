# Aangan Studio: Inbound Call Enquiry Engine

Every phone enquiry to Aangan Studio gets answered within seconds, day or night. A Vaani Labs voice
agent runs the conversation, this app checks the caller against Nikhil's five criteria
(`studio/qualified.md`), books qualified callers into a designer consultation (Cal.com), sends the
designer a full handoff note (Telegram), and logs **every** call to HubSpot and Neon Postgres.

Scope: incoming phone calls only. See "Extending to WhatsApp and the web form" below.
Built for the MESA Founder's Office case 03 (Nikhil Deshpande, Aangan Studio, Pune).

**Live:** dashboard at [aangan-studio-two.vercel.app](https://aangan-studio-two.vercel.app) (open for review; see Dashboard for the password switch).

| At a glance | |
|---|---|
| Criteria check on the 39 judgeable September enquiries | 39/39 routed as expected, 0 false "qualified", every complaint escalated |
| Check latency (Gemini 3.5 Flash-Lite) | p50 1.6 s, p95 1.8 s, hard limit 2 s mid-call |
| Cost | about ₹0.09 of AI per check; voice at Vaani's ₹5.5 a minute |
| Tests | 167 unit and handler tests (`npm test`), plus a live smoke test against production |
| Stack | Next.js 16 on Vercel, Neon Postgres, AI SDK + Gemini, Vaani Labs, Cal.com, HubSpot, Telegram |

## How a call flows

1. Caller dials. Vaani picks up and collects name, locality, home/office, scope, size, completion date, decider.
2. Vaani calls `POST /api/vaani/qualify`. Gemini 3.5 Flash-Lite (called with the studio's Gemini API key) judges each criterion `pass | fail | unclear`
   with evidence; `lib/rubric/route.ts` (plain code, not the model) decides the route:

   | Result | Route | Agent does |
   |---|---|---|
   | All pass | `qualified` | offers slots |
   | Budget or decider unclear | `qualified_flagged` | offers slots, flag in the note |
   | Area, scope or timeline unclear | `ask` | asks one question, then qualifies again |
   | Still unclear after one question | `callback` | promises a senior callback |
   | Any criterion fails | `close` | closes gracefully with the reason |
   | Existing-client complaint | `escalate` | urgent Telegram + HubSpot task for Nikhil |

3. Qualified: `POST /api/vaani/slots` then `POST /api/vaani/book` (Cal.com). Designers get the Telegram note.
4. Vaani's account webhook posts every call event to `POST /api/vaani/webhook`. `call_started`
   creates the row with the caller's number; `call_ended` marks unfinished calls `dropped`
   (call-back note) and syncs the call to HubSpot: contact by phone, a call log with the criteria
   and transcript link, a deal at "Consultation booked" when booked, a task for complaints.
   `call_postprocessing` adds the transcript and updates the same HubSpot records.

**Capture guardrails.** The voice agent's model sometimes misses or mishears details, so four layers protect the outcome:

1. The agent reads area, scope and timing back to the caller before the first check.
2. `/qualify` hands an empty form back (`next_step: resend_details`) instead of judging blanks, and logs the field names it received.
3. Complaints and clear fails act at once; otherwise nobody is qualified until area, scope and completion are known. Each is asked for once (`requested`), so a missed answer cannot loop the call.
4. When Vaani sends the transcript, Gemini re-reads the whole call (`lib/rubric/review.ts`): it fills details the agent never passed and re-checks the five criteria. If it contradicts the mid-call outcome, the call lands in "Needs a person" on the dashboard, HubSpot gets a review line, and designers get a Telegram. What the caller was told stays on record. `npm run review -- <id>` re-reviews a past call.

**Pricing is never quoted.** Nikhil asked for per-sq-ft quotes on the call, but `pricing.md` says no
number may be quoted, so the agent prompt only receives the never-say list and the deflection line.
`lib/agent-prompt.test.ts` fails the build if a price figure ever reaches the prompt.

## Vaani tool contract

Every endpoint takes JSON and requires the shared secret as `x-aangan-secret: <VAANI_TOOL_SECRET>`,
`Authorization: Bearer <secret>`, or `?secret=` (the dashboard webhook only takes a URL). Vaani's
payloads are normalised in `lib/vaani/adapter.ts`. Tools are cURL templates in the Vaani dashboard;
when a tool request has no call id it attaches to the call in progress.

```jsonc
// POST /api/vaani/qualify   (call_id optional; fields may also be sent flat)
{ "call_id": "abc", "answers": {
    "name": "", "locality": "", "property_type": "home|office|other", "scope": "",
    "size_sqft": 0, "completion": "", "decision_maker": "", "budget_volunteered": "", "notes": "" } }
// -> { "route": "ask", "say": "When would you need it complete?", "next_step": "ask|offer_slots|end_call|resend_details", "ask_about": "timeline" }

// POST /api/vaani/slots       { "call_id": "abc" }                       -> { "slots": [{ "start", "label" }], "say" }
// POST /api/vaani/book        { "call_id": "abc", "slot_start": "ISO" }  -> { "booked": true|false, "say" }  (never an error the agent could talk over)
// POST /api/vaani/webhook     Vaani events: call_started, user_picked_up_at, call_ended, call_postprocessing
```

## Setup

1. `npm install`
2. Create the Vercel project and add **Neon** from the Vercel Marketplace (injects `DATABASE_URL`).
3. Copy `.env.example` to `.env` and fill it in. Add the same variables in Vercel project settings.
4. `npm run migrate`
5. `npx tsx scripts/hubspot-setup.ts` creates the custom contact properties and prints pipeline,
   stage and owner ids for `.env`.
6. Vaani: create an agent in the dashboard and attach a phone number, then run
   `npx tsx scripts/vaani-setup.ts` (lists agents) and `npx tsx scripts/vaani-setup.ts <agent_id> [+91inbound]`.
   It pushes the system prompt and greeting and prints the webhook URL.
7. Vaani tools: `npm run tool -- qualify|slots|book` copies each tool's cURL (secret included) to paste
   in the dashboard as a custom tool. Then set `TOOL_NAMES` in `lib/agent-prompt.ts` to the names Vaani
   gives them and run `npx tsx scripts/vaani-tools.ts`, which checks the tools and pushes the prompt.
   **Never edit the tools through Vaani's API:** it wipes the hidden request-body template and every
   tool call then arrives empty. `npm run agent-prompt` prints just the prompt.
8. Deploy by hand: `vercel deploy` (preview), `vercel deploy --prod`.

## Testing the flow

1. **Simulated calls** (no phone needed): `npm run smoke` plays Vaani's webhook events and tool
   calls for five cases (qualified, outside area, complaint, dropped, tool without call id) against
   `APP_URL`, prints what the agent would say and the resulting Neon rows, then removes the rows,
   HubSpot records and Cal.com booking (Telegram messages stay).
   - `npm run smoke -- --demo --keep` replays one September phone enquiry per outcome as realistic
     calls placed today, through the full pipeline, and keeps them for a demo.
   - `npm run smoke -- --purge <prefix>` removes kept calls (`demo-`, `smoke-`) or calls from Vaani's
     in-browser tester (`webrtc-`) from Neon, HubSpot and Cal.com.
2. **A real call**: dial the number attached to the Front Desk agent. Try a qualified project
   ("3BHK in Kothrud, done by March, I'm the owner"), an out-of-area one ("flat in Nashik"),
   a price question (the agent must not give a number), and a complaint.
3. **See what happened**: `npm run calls` lists recent calls; `npm run calls -- <id>` shows one
   with criteria, evidence, integrations and transcript. Vercel function logs show any errors.

Integrations switch on only when all their keys are set. Until then the call still completes and
the skipped step is recorded (`npm run smoke` prints e.g. `"telegram: Telegram not configured"`).

## Dashboard

Protected by one shared password while `DASHBOARD_PASSWORD` is set: a 30-day signed cookie (`proxy.ts`,
`lib/session.ts`), and every data read checks the session again (`lib/dashboard.ts`). With the variable
unset the dashboard is open to anyone, which is how it runs now for review. Real callers' names, numbers
and transcripts are on it, so set the password again before real calls come in.

- **Overview** (`/`), for Nikhil: share of callers answered within 5 minutes against the September
  baseline (48% got no reply within 48 hours), calls caught after hours, qualified share,
  consultations booked, the calls that need a person, spend against booked pipeline, and why callers
  weren't a fit. Switch between the last 7 days, the last 30 days, and all time.
- **Calls** (`/calls`), for designers: every call, newest first, filtered to "Needs a person"
  (complaints, callbacks, dropped calls, qualified but unbooked), "Booked" or "Not a fit".
- **Call** (`/calls/<id>`), linked from Telegram and HubSpot: what to do next, the caller's answers,
  the five checks with the caller's own words, the transcript, HubSpot links, and earlier calls from
  the same number. Built to read well on a phone.

Numbers come from `lib/metrics.ts` (unit-tested). Pipeline values each booked consultation at a typical
₹8 to 14 lakh project, before conversion; voice is costed at Vaani's self-serve ₹5.5 a minute and AI at
₹88 to the dollar (`VAANI_INR_PER_MINUTE`, `INR_PER_USD` override them).

## Tests and eval

- `npm test`: routing rules, IST after-hours, pricing guardrail, handoff note, Vaani adapter,
  HubSpot/Cal.com/Telegram clients, and the call handlers (every route reaches HubSpot).
- `npm run eval`: runs the live criteria check over the 40 September enquiries
  (`studio/transcripts/`, extracted from `seed-data/` by `scripts/extract-transcripts.ts`) and
  writes `eval/last-run.md`. Fails if any enquiry that should close comes back qualified, or a
  complaint is not escalated. Expected outcomes in `labels.json` are drafts awaiting Nikhil's review.

## Limits

- The 39/39 eval is against expected outcomes I drafted from `qualified.md`; Nikhil's review of
  `studio/transcripts/labels.json` makes them ground truth.
- After the Vaani tools were re-created (see Setup step 7), the end-to-end path is verified by the
  production smoke test; a final live phone call is pending Vaani credit.
- Pipeline is booked consultations at ₹8 to 14 lakh each, before conversion, not revenue.
- The dashboard is open for review. With the password set it uses one shared login, which suits a small
  studio; named logins would come with a bigger team.

## Extending to WhatsApp and the web form

The qualification core is channel-agnostic: `/qualify` takes answers plus optional conversation
text. A WhatsApp Business webhook or the website form would map its message into the same answers
shape, reuse `decideRoute`, `syncCall` and the handoff note, and reply in text instead of speech.
The eval already runs the WhatsApp and form enquiries through the same check.
