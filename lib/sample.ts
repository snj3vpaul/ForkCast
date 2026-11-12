import type { Forge } from "./types";

export const SAMPLE_TEXT = `When the vendor contract is 60 days from expiry, Procurement pulls the last four quarters of SLA reports. If uptime stayed above 99.5% and there were no P1 incidents, Procurement requests a renewal quote. If the quote is within 5% of the current price, Finance approves and the contract is signed. If the quote is higher, Procurement negotiates — repeat until the vendor agrees or we hit the 30-day mark. If SLA performance was poor, escalate to the CTO.`;

/** Pre-rendered demo so the landing page shows Ink & Signal without an API call. */
export const SAMPLE_FORGE: Forge = {
  title: "Vendor contract renewal",
  mode: "parsed",
  parseReport: {
    inputType: "multi-actor workflow",
    actors: [
      { name: "Procurement", implied: false },
      { name: "Finance", implied: false },
      { name: "CTO", implied: false },
    ],
    decisionCount: 3,
    stepCount: 6,
    flags: [
      { code: "A2", text: "No path stated when negotiation hits the 30-day mark without agreement.", nodeIds: ["U1"] },
      { code: "A3", text: "\"The contract is signed\" — signatory not named.", nodeIds: ["SIGN"] },
      { code: "A9", text: "\"Escalate to the CTO\" collapses the CTO's possible decisions into one outcome.", nodeIds: ["END-3"] },
    ],
    confidence: "medium",
    confidenceReason: "Clear thresholds, but the negotiation loop's failure exit and CTO outcomes are unstated.",
  },
  nodes: [
    { id: "START", kind: "start", label: "Contract 60 days from expiry", lateral: 0, actor: "Procurement", sourceQuote: "When the vendor contract is 60 days from expiry" },
    { id: "PULL", kind: "action", label: "Pull last four quarters of SLA reports", lateral: 0, actor: "Procurement", sourceQuote: "Procurement pulls the last four quarters of SLA reports." },
    { id: "G1", kind: "gate", label: "SLA health", question: "Uptime > 99.5% and no P1 incidents?", lateral: 0, actor: "Procurement", sourceQuote: "If uptime stayed above 99.5% and there were no P1 incidents" },
    { id: "QUOTE", kind: "action", label: "Request renewal quote", lateral: 0, actor: "Procurement", sourceQuote: "Procurement requests a renewal quote." },
    { id: "G2", kind: "gate", label: "Price check", question: "Quote within 5% of current price?", lateral: 0, actor: "Procurement", sourceQuote: "If the quote is within 5% of the current price" },
    { id: "APPROVE", kind: "action", label: "Approve renewal", lateral: 0, actor: "Finance", sourceQuote: "Finance approves" },
    { id: "SIGN", kind: "commit", label: "Sign renewed contract", lateral: 0, actor: "Finance", inferred: true, sourceQuote: "the contract is signed." },
    { id: "END-1", kind: "end", label: "Contract renewed ✓", lateral: 0, actor: "Finance", outcome: "positive" },
    { id: "NEG", kind: "action", label: "Negotiate price with vendor", lateral: 1, actor: "Procurement", sourceQuote: "Procurement negotiates" },
    { id: "G3", kind: "gate", label: "Loop exit", question: "Vendor agrees, or 30-day mark reached?", lateral: 1, actor: "Procurement", sourceQuote: "repeat until the vendor agrees or we hit the 30-day mark." },
    { id: "U1", kind: "unstated", label: "Handle no-agreement at 30 days", lateral: 2, actor: "Procurement", inferred: true },
    { id: "END-2", kind: "end", label: "⚠ undefined in source", lateral: 2, actor: "Procurement", outcome: "undefined" },
    { id: "ESC", kind: "action", label: "Escalate to the CTO", lateral: 2, actor: "CTO", sourceQuote: "If SLA performance was poor, escalate to the CTO." },
    { id: "END-3", kind: "end", label: "Escalated to CTO ✗", lateral: 2, actor: "CTO", outcome: "negative" },
  ],
  edges: [
    { from: "START", to: "PULL" },
    { from: "PULL", to: "G1" },
    { from: "G1", to: "QUOTE", label: "yes" },
    { from: "G1", to: "ESC", label: "SLA “was poor”", kind: "exception" },
    { from: "QUOTE", to: "G2" },
    { from: "G2", to: "APPROVE", label: "within 5%" },
    { from: "G2", to: "NEG", label: "quote is higher" },
    { from: "APPROVE", to: "SIGN" },
    { from: "SIGN", to: "END-1" },
    { from: "NEG", to: "G3" },
    { from: "G3", to: "APPROVE", label: "vendor agrees", loopExit: true },
    { from: "G3", to: "NEG", label: "neither yet", kind: "loop", maxIterations: "until day 30" },
    { from: "G3", to: "U1", label: "30-day mark hit", kind: "unstated", loopExit: true },
    { from: "U1", to: "END-2", kind: "unstated" },
    { from: "ESC", to: "END-3" },
  ],
  ledger: [
    { added: "“Sign” marked as commit point", why: "Signing is irreversible; source uses passive “is signed”." },
    { added: "Signatory placed in Finance lane", why: "Follows Finance approval in the same sentence; actor unstated (A3)." },
    { added: "UNSTATED path after 30-day mark", why: "Loop bound given, but no action on reaching it (A2)." },
    { added: "Re-negotiation assumed to return to Finance approval", why: "“Vendor agrees” implies a new acceptable price; not stated." },
  ],
  challenge: "If the vendor won't move by day 30, do we let the contract lapse or auto-renew at their price?",
};
