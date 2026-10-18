# Security

Please report vulnerabilities privately to **contact@creoox.com** (subject "AI Forecast Atlas security"). Do not open public issues for them. We aim to answer within five working days.

Scope: the code in this repository and the site https://aiforecastatlas.com. Out of scope: rate-limit bypass by distributed traffic, reports from automated scanners without a demonstrated impact, and third-party services (OpenAI, Mailjet, home.pl, Cloudflare).

Design notes for reviewers: secrets and personal data live in `_private/storage` as PHP files that exit when requested over the web; admin actions need a signed cookie and a CSRF header; visitor endpoints are rate-limited per hashed IP and can require Cloudflare Turnstile; release uploads are validated (file names, sizes, JSON, SVG without scripts); outgoing calls go only to configured provider addresses.
