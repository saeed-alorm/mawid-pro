# Feature traceability index

Source: supplied Plan-Context.json, prepared 7 November 2026. IDs and phase assignments are unchanged. FEAT-01 and FEAT-24 scope was clarified by [Saeed's confirmed 8 November distribution decision](../decisions/2026-11-08-product-distribution.md); implementation and store approval remain unverified. These are planned capabilities, not shipped product claims.

[Product HQ](https://www.notion.so/40cf53c2a11d80c493fede8991643fea) owns intent and decisions; GitHub owns engineering status. Feature-level Notion URLs have not been verified.

| ID | Feature | First phase | Expansion | Engineering scope / issue |
|---|---|---|---|---|
| FEAT-01 | Branded customer mobile app | P1 | P4 | Confirmed: dedicated brand customer Android app, MAWID-owned publishing, zero salon accounts; one app/brand assumption. [#4 feasibility](https://github.com/saeed-alorm/mawid-pro/issues/4); [#10 pilot integration/manifests](https://github.com/saeed-alorm/mawid-pro/issues/10); [#3 private import](https://github.com/saeed-alorm/mawid-pro/issues/3); [#11 release path](https://github.com/saeed-alorm/mawid-pro/issues/11); [#12 two-brand acceptance](https://github.com/saeed-alorm/mawid-pro/issues/12); [#15 fleet scale](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-02 | Shop branding configuration | P1 | P4 | [P1-BRAND](https://github.com/saeed-alorm/mawid-pro/issues/10); [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-03 | Branded booking website | P1 | P4 | [P1-WEB](https://github.com/saeed-alorm/mawid-pro/issues/9); [P1-BRAND](https://github.com/saeed-alorm/mawid-pro/issues/10); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12); [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-04 | Booking widgets | P4 | — | [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-05 | QR booking and posters | P1 | — | [P1-BRAND](https://github.com/saeed-alorm/mawid-pro/issues/10) |
| FEAT-06 | Shop and professional booking links | P1 | — | [P1-BRAND](https://github.com/saeed-alorm/mawid-pro/issues/10) |
| FEAT-07 | Google booking entry | P1 | P4 | [P1-BRAND](https://github.com/saeed-alorm/mawid-pro/issues/10); [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-08 | Professional lookbooks | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-09 | Core booking management | P1 | — | [P1-ARCH](https://github.com/saeed-alorm/mawid-pro/issues/4); [P1-DATA](https://github.com/saeed-alorm/mawid-pro/issues/6); [P1-BOOKING](https://github.com/saeed-alorm/mawid-pro/issues/7); [#10 pilot customer Android](https://github.com/saeed-alorm/mawid-pro/issues/10), [#3 private import gate](https://github.com/saeed-alorm/mawid-pro/issues/3); [P1-OPS](https://github.com/saeed-alorm/mawid-pro/issues/11); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-10 | Booking approval policies | P1 | — | [P1-ARCH](https://github.com/saeed-alorm/mawid-pro/issues/4); [P1-BOOKING](https://github.com/saeed-alorm/mawid-pro/issues/7); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12); Later automatic eligibility remains undecided; P3 phase review, no initial commitment |
| FEAT-11 | Staff schedules and availability | P1 | — | [P1-ARCH](https://github.com/saeed-alorm/mawid-pro/issues/4); [P1-BOOKING](https://github.com/saeed-alorm/mawid-pro/issues/7); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-12 | Staff service and duration overrides | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-13 | Service add-ons | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-14 | Service combinations and packages | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-15 | Pricing and schedule gap rules | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-16 | Recurring appointments | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-17 | Staff-entered appointments | P1 | — | [P1-BOOKING](https://github.com/saeed-alorm/mawid-pro/issues/7); [P1-WEB](https://github.com/saeed-alorm/mawid-pro/issues/9) |
| FEAT-18 | Walk-in queue | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-19 | Future appointment waitlist | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-20 | Self-check-in kiosk | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-21 | TV appointment and queue board | P2 | — | [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-22 | Mobile barber and house calls | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-23 | Owner dashboard | P1 | — | [P1-WEB](https://github.com/saeed-alorm/mawid-pro/issues/9) |
| FEAT-24 | Staff business workspace | P1 | P4 | Confirmed: shared MAWID management Android app and web portal from first pilot, distinct app identity and server-authorized workspace/roles. [#4 architecture](https://github.com/saeed-alorm/mawid-pro/issues/4); [#9 both surfaces](https://github.com/saeed-alorm/mawid-pro/issues/9); [#5 permissions](https://github.com/saeed-alorm/mawid-pro/issues/5); [#11 release](https://github.com/saeed-alorm/mawid-pro/issues/11); [#12 acceptance](https://github.com/saeed-alorm/mawid-pro/issues/12); [#15 later expansion](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-25 | Multiple business locations | P1 | P4 | [P1-ARCH](https://github.com/saeed-alorm/mawid-pro/issues/4); [P1-DATA](https://github.com/saeed-alorm/mawid-pro/issues/6); [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-26 | Identity and access permissions | P1 | — | [P1-IDENTITY](https://github.com/saeed-alorm/mawid-pro/issues/5); [#10 pilot customer Android](https://github.com/saeed-alorm/mawid-pro/issues/10), [#3 private import gate](https://github.com/saeed-alorm/mawid-pro/issues/3); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-27 | Customer records and preferences | P1 | P2 | [P1-DATA](https://github.com/saeed-alorm/mawid-pro/issues/6); [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-28 | Client insights | P3 | — | [EPIC-P3](https://github.com/saeed-alorm/mawid-pro/issues/14) |
| FEAT-29 | Operational reporting and exports | P1 | P2 | [P1-DATA](https://github.com/saeed-alorm/mawid-pro/issues/6); [P1-WEB](https://github.com/saeed-alorm/mawid-pro/issues/9); [EPIC-P2](https://github.com/saeed-alorm/mawid-pro/issues/13) |
| FEAT-30 | Assisted data migration | P1 | — | [P1-DATA](https://github.com/saeed-alorm/mawid-pro/issues/6); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-31 | Guided shop onboarding | P1 | — | [P1-OPS](https://github.com/saeed-alorm/mawid-pro/issues/11); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-32 | Transactional notifications | P1 | — | [P1-NOTIFY](https://github.com/saeed-alorm/mawid-pro/issues/8); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-33 | Marketing campaigns | P3 | — | [EPIC-P3](https://github.com/saeed-alorm/mawid-pro/issues/14) |
| FEAT-34 | Notification templates and delivery | P1 | — | [P1-NOTIFY](https://github.com/saeed-alorm/mawid-pro/issues/8) |
| FEAT-35 | Loyalty points | P3 | — | [EPIC-P3](https://github.com/saeed-alorm/mawid-pro/issues/14) |
| FEAT-36 | Personal rewards and discounts | P3 | — | [EPIC-P3](https://github.com/saeed-alorm/mawid-pro/issues/14) |
| FEAT-37 | Shop memberships | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-38 | Pay-in-shop workflow | P1 | — | [P1-ARCH](https://github.com/saeed-alorm/mawid-pro/issues/4); [P1-BOOKING](https://github.com/saeed-alorm/mawid-pro/issues/7) |
| FEAT-39 | Online payments and deposits | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-40 | Cancellation and no-show fees | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-41 | POS and card terminals | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-42 | Individual staff payment accounts | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-43 | Product catalog and commerce | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-44 | Inventory and fulfilment | P5 | — | [EPIC-P5](https://github.com/saeed-alorm/mawid-pro/issues/16) |
| FEAT-45 | Booking API | P1 | P4 | [P1-ARCH](https://github.com/saeed-alorm/mawid-pro/issues/4); [P1-BOOKING](https://github.com/saeed-alorm/mawid-pro/issues/7); [#10 pilot customer Android](https://github.com/saeed-alorm/mawid-pro/issues/10), [#3 private import gate](https://github.com/saeed-alorm/mawid-pro/issues/3); [P1-WEB](https://github.com/saeed-alorm/mawid-pro/issues/9); [P1-OPS](https://github.com/saeed-alorm/mawid-pro/issues/11); [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-46 | Chatbot and voice booking integrations | P4 | — | [EPIC-P4](https://github.com/saeed-alorm/mawid-pro/issues/15) |
| FEAT-47 | Phone verification and abuse controls | P1 | — | [P1-IDENTITY](https://github.com/saeed-alorm/mawid-pro/issues/5) |
| FEAT-48 | Mawid subscription and pricing | Unscheduled | — | Notion business decision after first pilot; no engineering issue |
| FEAT-49 | Onboarding and support service | P1 | — | [P1-OPS](https://github.com/saeed-alorm/mawid-pro/issues/11); [P1-ACCEPT](https://github.com/saeed-alorm/mawid-pro/issues/12) |
| FEAT-50 | Referral and ambassador programs | Unscheduled | — | Notion business backlog after retention; no engineering issue |

P1 scope stays narrow: ordinary Google booking URL (FEAT-07), organization/location modeling (FEAT-25), minimal customer records (FEAT-27), and operational exports (FEAT-29). Deeper integrations, multi-branch operations, structured preferences and richer reporting remain expansion work. FEAT-38 allows booking without payment collection; paid/unpaid capture is undecided.

FEAT-48 and FEAT-50 stay in product/business planning, avoiding duplicate engineering tasks. iOS remains future feasibility in #15 with no committed release; member/regular automatic approval and fleet publishing remain later work. Initial central Android eligibility/policy and a repeatable pilot release path belong in P1. [Required distribution validations](android-distribution.md) include two brands from one source commit and a shared fix rebuilt for both. No milestone has an invented due date.

