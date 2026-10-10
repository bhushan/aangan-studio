import type { CloseReason } from "../calls/types";
import type { CriterionKey } from "./schema";

// What the voice agent says for each outcome. Kept here, not in the model, so wording is reviewed once.

export const ASK_FALLBACK: Partial<Record<CriterionKey, string>> = {
  real_project: "Just so I understand, are you looking for us to design and also carry out the work, or mainly for advice?",
  service_area: "Which area of Pune is the site in?",
  timeline: "When would you need the project complete?",
};

export const CLOSE_LINES: Record<CloseReason, string> = {
  not_a_real_project:
    "We're a full-service studio, so our projects include both design and execution, at least a full room. This may not be the right fit right now, but do call us back if you plan a full redesign.",
  outside_service_area:
    "We only take on projects in Pune and PCMC at the moment, because our execution depends on our own contractors being on site. I'm sorry we can't help with this one.",
  timeline_unworkable:
    "Our design phase alone takes three to four weeks, and execution follows, so we couldn't do justice to that timeline. If your dates move, we'd be glad to hear from you again.",
  budget_misaligned:
    "Thank you for sharing that. For the scope you've described, that budget would be well below what a project with us costs, and I'd rather be straight with you now than at a consultation.",
  no_decision_maker:
    "It would be best for the person deciding to speak with us directly. Please ask them to call, any time of day.",
};

export const LINES = {
  qualified: "This sounds like a good fit. Let me find a consultation slot with one of our designers.",
  escalate:
    "I'm sorry about this. I'm getting it to our senior team right now, and someone senior will call you back within fifteen minutes.",
  callback:
    "Thank you. I'll have a senior person from our team call you back shortly to take this forward.",
  notQualifiedForBooking: "I'll have someone from our team call you back to arrange the next step.",
  booked: (when: string) =>
    `You're booked for ${when}. Your designer will call you before then, and pricing is something they'll walk you through in detail at the consultation.`,
  slots: (labels: string[]) =>
    labels.length
      ? `I can offer ${labels.join(", or ")}. Which works best for you?`
      : "I don't see an open slot right now. I'll have a designer call you back to fix a time.",
};
