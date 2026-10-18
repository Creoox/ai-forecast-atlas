# Legal checklist (Liechtenstein / EEA, Switzerland) — not legal advice

Checked against the sources in brackets on 17 October 2026. Please have a lawyer confirm what applies to Creoox AG.

**Who operates the site.** The public registers list Creoox AG as a company limited by shares under the law of Liechtenstein (seat Triesen, register no. FL-0002.524.394-4). Liechtenstein is part of the European Economic Area, so the GDPR applies to Creoox AG directly (Art. 3(1), via the EEA Agreement) and the supervisory authority is the Datenschutzstelle Liechtenstein. **No EU representative under GDPR Art. 27 is needed** while Creoox AG (Liechtenstein) is the operator. If a Swiss company operated AI Forecast Atlas instead, the Polish newsletter edition would count as targeting EU readers (EDPB Guidelines 3/2018), the occasional-processing exemption would not fit a weekly newsletter, and a representative would be needed (commercial services: roughly €150–850 a year).

## To do before launch
- [ ] **Imprint:** pre-filled from the public data (name, legal form, registered office and postal address, contact email and phone, representative, commercial register and number, VAT number, data protection authority). Liechtenstein's E-Commerce Act (ECG Art. 5) asks for these; check them once in Admin → Settings → Site and company, especially the VAT number (only seen on creoox.com). Note: creoox.com's own imprint still carries wording from a German template (“§27a UStG”, “German copyright law”) and names the “Registry court Vaduz”, while the register is kept by the Amt für Justiz.
- [ ] **Privacy notice:** `privacy.php` is filled from the settings and the providers you configure (GDPR Art. 13; for people in Switzerland FADP Art. 19). Have it reviewed.
- [ ] **Processor agreements:** accept Mailjet's (Sinch) DPA; consider the DPAs of OpenAI (assistant), Anthropic, Google and xAI; home.pl's terms cover hosting. DeepSeek offers no DPA and processes data in China: the code never sends visitor chats to it, only research questions without personal data.
- [ ] **AI providers' terms:** keep monthly spending limits in each provider account.
- [ ] **X watch:** the site links to public posts and shows the public names of their authors (mostly organisations, executives, journalists and analysts) with a short summary. Legal basis: legitimate interest (GDPR Art. 6(1)(f)); authors can object (Admin → X watch → Withdraw removes the item from the dashboard, the releases and the feeds; sent newsletters cannot be recalled, which the privacy notice says). Retention: dashboard about a month, working copy 13 months, rejected posts 45 days. Keep summaries factual and short, and do not label people as unreliable beyond the post's own content.

## Built in
- **Newsletter consent** (UWG Art. 3(1)(o)): prior consent with a checkbox, double opt-in (confirmation link, POST to confirm so link scanners cannot subscribe people), correct sender, free one-click unsubscribe in every email (RFC 8058 headers), local consent log with version and time, local suppression list.
- **No tracking:** Mailjet open and click tracking off; no analytics cookies (optional Cloudflare Web Analytics is cookieless).
- **Data minimisation:** visitor IP addresses only as monthly-rotating keyed hashes for rate limits; chat conversations not stored; subscriber lists not kept on the server after a send (also when a send is stopped or replaced).
- **Deletion periods applied automatically:** consent and unsubscription records after three years, improvement suggestions after 24 months, logs after about 13 months.
- **Traceable data:** every published starting value carries its source, link and review date; values from the AI research panel name the lead model, quote its source and list every agent's answer; an AI model's own knowledge without a citable source is labelled “AI knowledge”. X watch items are labelled as signals, not data.
- **Trademarks:** generic notice plus “Autodesk is a registered trademark of Autodesk, Inc.; Creoox AG is not affiliated with Autodesk, Inc.” in the footer, imprint and newsletter; “Autodesk®” used only as an adjective.
- **Not investment advice** notices in the site, newsletter and assistant.
- **Source credits:** Epoch AI data credited as required by CC BY 4.0; EIA (public domain) and SEC credited; FRED and ICE data are not used.

## Sources
GDPR Art. 3, 6, 7, 13, 27, 83 and EEA Joint Committee Decision 154/2018; EDPB Guidelines 3/2018 (territorial scope); Liechtenstein E-Commerce Act (ECG) Art. 5; Liechtenstein commercial register (Amt für Justiz) and moneyhouse.ch; UWG SR 241 (Art. 3, 23); FADP SR 235.1 (Art. 3, 14, 19); Mailjet and Sinch DPA; RFC 8058; Google, Yahoo and Microsoft bulk-sender rules (SPF, DKIM, DMARC, one-click unsubscribe).
