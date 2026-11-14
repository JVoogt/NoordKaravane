---
title: "Data Retention and Protection Policy"
description: "How long Kampi Store's seller keeps personal information, the security measures used, and what happens if there is a data breach."
updated: 2026-11-14
order: 2
---
<!-- Draft adapted from the NK drafts. Not lawyer reviewed. -->

<p data-seller>Kampi Store (store.kampi.co.za) is operated by {{legal_name}}, who sells and delivers every order. The Kampi caravan rental platform is a separate business and is not a party to your purchase.</p>

This policy supports our [Privacy Policy](/legal/privacy/). POPIA s14 says we must not keep personal information longer than needed, unless the law requires or allows it.

## 1. Retention schedule

| Information | Retention period | Reason |
|---|---|---|
| Orders, invoices, payment records | 5 years from the end of the financial year of the transaction | Tax Administration Act 28 of 2011 (SARS); Companies Act where applicable |
| Discount codes issued by the Kampi rental platform (hashed email only) | Until the code expires, then with the order record if it was used | Stopping a code being used twice |
| Returns and complaints correspondence | 3 years after resolution | Consumer Protection Act prescription periods and defence of claims |
| Abandoned carts | 30 days | Then deleted |
| Server and security logs | 90 days | Security and fraud investigation |
| Database backups | 30 days (rolling) | Disaster recovery. Deleted data drops out of backups within this window |
| Google Analytics data | 14 months (GA4 data retention setting) | Analytics, only with consent |
| Contact form and email enquiries | 2 years after last contact | Customer service |

When a retention period ends, we delete the information or irreversibly de-identify it. A deletion request is honoured unless we must keep the record by law, in which case we restrict it to that purpose.

## 2. Security measures

- HTTPS everywhere, with Cloudflare in front of the site.
- Cloudflare firewall, rate limiting and bot protection. The admin area sits behind access control (login required, separate from the public site).
- Servers run in isolated containers as non-root users with dropped privileges and resource limits.
- Passwords are hashed. Secrets are stored outside the code in restricted files.
- We never see or store card details: you pay by EFT through your own bank.
- Access to customer data is limited to the owner and, where needed, trusted operators under confidentiality.
- Regular software updates, monitoring of logs, and nightly encrypted backups with a 30-day rolling window.
- Operators are chosen for their security track record and bound to protect personal information.

## 3. Security compromise and breach notification (POPIA s22)

If we have reasonable grounds to believe personal information has been accessed or acquired by an unauthorised person:

1. **Contain**: isolate affected systems, revoke credentials and keys, preserve logs.
2. **Assess**: what was exposed, whose information, how, and the risk to the people affected.
3. **Notify the Information Regulator** as soon as reasonably possible, via the Regulator's eServices portal or by email to the address on its website.
4. **Notify affected people** as soon as reasonably possible, by email (or another suitable method), unless a public body responsible for detection, prevention or investigation of offences asks us to delay. The notice will say what happened, what information was involved, the likely consequences, what we have done and what you can do (for example, change a password).
5. **Remediate and record**: fix the cause, document the incident and lessons learned, and review this policy.

Report a suspected incident to {{email_privacy}}. Our Information Officer, {{information_officer}}, is responsible for this procedure.
