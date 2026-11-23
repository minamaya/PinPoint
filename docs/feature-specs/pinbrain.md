# PinBrain — Feature Spec

**Status: draft.**

**What this document is.** The requirements for PinPoint's links to PinBrain. No implementation detail — design records and code carry that. It describes the intended final state only; what the code does or used to do lives solely in the Known divergences table. Each requirement is numbered for citation. When code and spec disagree, either the code is wrong or this document gets amended — never silently neither.

**Related records.** `docs/feature-specs/machine-scan-hub.md` (the hub's Ask PinBrain button, §3.4, §4.6), `docs/feature-specs/pintips.md` (the tip card the Info tab button follows). Canvas https://claude.ai/artifact/Up6UZDPCn2SMKQbpCCabcz, boards "Option D · …" and "Info-PinBrain-…" (2026-11-23). Bead PP-4wtr.

---

## 1. Concepts

- **PinBrain** — the Collective's Gemini Notebook about playing and repairing pinball machines, at one fixed address. PinPoint links to it and has no other integration: Gemini Notebook offers no public query API (verified 2026-11-23; may change).
- **Ask PinBrain button** — an outlined button (design bible §26) labeled "Ask PinBrain" with a trailing external-link mark. It opens PinBrain in a new tab.

## 2. Placement

- **2.1** The scan hub carries an Ask PinBrain button in its second action row (hub spec §3.4).
- **2.2** On the machine's Info tab, an Ask PinBrain button sits in the reference rail in its own full-width row, directly after the tip card.
- **2.3** When the machine has no tips, the Info tab button sits where the tip card would be.
- **2.4** Every machine shows the button, whatever its era or catalog data. The link is the same for all machines.

## 3. Access

- **3.1** The button is shown to every viewer, signed in or not.
- **3.2** PinPoint has no setting for PinBrain's address; changing it is a code change.

## Known divergences

| Requirement | Divergence | Resolution |
| :-- | :-- | :-- |
| §2.1–§2.4, §3.1 | No Ask PinBrain button exists on the hub or the Info tab. | PP-4wtr |

## Changelog

| Date       | Change                                                      |
| :--------- | :---------------------------------------------------------- |
| 2026-11-23 | Initial draft: concept, hub and Info tab placement, access. |
