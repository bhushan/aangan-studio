# Aangan Studio: Inbound Call Enquiry Engine

Every phone enquiry to Aangan Studio gets answered within seconds, day or night. A Vaani Labs voice
agent runs the conversation, this app checks the caller against Nikhil's five criteria
(`studio/qualified.md`), books qualified callers into a designer consultation (Cal.com), sends the
designer a full handoff note (Telegram), and logs **every** call to HubSpot and Neon Postgres.

Scope: incoming phone calls only. See "Extending to WhatsApp and the web form" below.

## How a call flows

1. Caller dials. Vaani picks up and collects name, locality, home/office, scope, size, completion date, decider.
2. Vaani calls `POST /api/vaani/qualify`. Gemini 3.8 Flash (called with the studio's Gemini API key) judges each criterion `pass | fail | unclear`
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
// -> { "route": "ask", "say": "When would you need it complete?", "next_step": "ask|offer_slots|end_call", "ask_about": "timeline" }

// POST /api/vaani/slots       { "call_id": "abc" }                       -> { "slots": [{ "start", "label" }], "say" }
// POST /api/vaani/book        { "call_id": "abc", "slot_start": "ISO" }  -> { "booked": true, "say" }
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
   It pushes the system prompt and greeting through the API and prints the webhook URL and the
   three tool cURLs to paste in the dashboard. `npm run agent-prompt` prints just the prompt.
7. Deploy by hand: `vercel deploy` (preview), `vercel deploy --prod`.

## Tests and eval

- `npm test`: routing rules, IST after-hours, pricing guardrail, handoff note, Vaani adapter,
  HubSpot/Cal.com/Telegram clients, and the call handlers (every route reaches HubSpot).
- `npm run eval`: runs the live criteria check over the 40 September enquiries
  (`studio/transcripts/`, extracted from `seed-data/` by `scripts/extract-transcripts.ts`) and
  writes `eval/last-run.md`. Fails if any enquiry that should close comes back qualified, or a
  complaint is not escalated. Expected outcomes in `labels.json` are drafts awaiting Nikhil's review.

## Extending to WhatsApp and the web form

The qualification core is channel-agnostic: `/qualify` takes answers plus optional conversation
text. A WhatsApp Business webhook or the website form would map its message into the same answers
shape, reuse `decideRoute`, `syncCall` and the handoff note, and reply in text instead of speech.
The eval already runs the WhatsApp and form enquiries through the same check.
