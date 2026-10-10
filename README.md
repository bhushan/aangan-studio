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
4. Call ends: `POST /api/vaani/call-ended` stores the transcript and minutes, marks unfinished calls
   `dropped` (call-back note), and syncs the call to HubSpot: contact by phone, a call log with the
   criteria and transcript link, a deal at "Consultation booked" when booked, a task for complaints.

**Pricing is never quoted.** Nikhil asked for per-sq-ft quotes on the call, but `pricing.md` says no
number may be quoted, so the agent prompt only receives the never-say list and the deflection line.
`lib/agent-prompt.test.ts` fails the build if a price figure ever reaches the prompt.

## Vaani tool contract

All four endpoints take JSON and require the shared secret as `x-aangan-secret: <VAANI_TOOL_SECRET>`
(or `Authorization: Bearer <secret>`). Vaani payload variants are normalised in `lib/vaani/adapter.ts`.

```jsonc
// POST /api/vaani/qualify
{ "call_id": "abc", "caller_number": "+91...", "answers": {
    "name": "", "locality": "", "property_type": "home|office|other", "scope": "",
    "size_sqft": 0, "completion": "", "decision_maker": "", "budget_volunteered": "", "notes": "" } }
// -> { "route": "ask", "say": "When would you need it complete?", "next_step": "ask|offer_slots|end_call", "ask_about": "timeline" }

// POST /api/vaani/slots       { "call_id": "abc" }                       -> { "slots": [{ "start", "label" }], "say" }
// POST /api/vaani/book        { "call_id": "abc", "slot_start": "ISO" }  -> { "booked": true, "say" }
// POST /api/vaani/call-ended  { "call_id": "abc", "started_at", "ended_at", "duration_sec", "transcript": "..." | [{ "role", "text" }] }
```

## Setup

1. `npm install`
2. Create the Vercel project and add **Neon** from the Vercel Marketplace (injects `DATABASE_URL`).
3. Copy `.env.example` to `.env` and fill it in. Add the same variables in Vercel project settings.
4. `npm run migrate`
5. `npx tsx scripts/hubspot-setup.ts` creates the custom contact properties and prints pipeline,
   stage and owner ids for `.env`.
6. `npm run agent-prompt` prints the Vaani system prompt. Paste it into the Vaani agent and register
   the four tools above with the shared secret header.
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
