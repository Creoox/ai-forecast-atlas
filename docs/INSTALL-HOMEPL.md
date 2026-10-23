# Publishing AI Forecast Atlas on home.pl — step by step

This guide takes you from the downloaded package to a live site at **https://aiforecastatlas.com** with the AI assistant, the five-agent research panel, X watch, the weekly release every Friday at 13:00 and the newsletter. No programming is needed: you click in the home.pl panel, copy two folders and paste a few keys.

**Time:** about 1–2 hours the first time, most of it waiting for the SSL certificate and Mailjet.
**Words in “quotes”** are the labels you see in the home.pl panel (in Polish, with the English meaning after them).

---

## What is in the package

| Item | What it is | Where it goes |
|---|---|---|
| `aimonitor/` | The whole site: dashboard, data, server code, admin page | `/public_html/aimonitor/` on your server |
| `cron/cron-5min.php`, `cron/cron-13.php` | Two small files that start the scheduler | `/public_html/` (the main folder) |
| `INSTALL-HOMEPL.md` | This guide | keep it on your computer |
| `LICENSE` | The licence (Business Source License 1.1) | keep it with the files |

How it works in one sentence: the dashboard is a normal web page; small PHP programs on your server answer the chat, handle newsletter sign-ups and run the daily data check and the Friday release; your API keys stay in a private folder on the server.

---

## Step 0 — Gather what you need

Have these ready (you can add the optional ones later):

1. **home.pl login** — https://panel.home.pl ("Panel klienta", client panel).
2. **The domain aiforecastatlas.com and an SSL certificate for it** — see steps 1–3. A certificate for the domain itself (with www) is enough; no Wildcard certificate is needed.
3. **API keys of the five AI agents** (each account needs a payment method; set a **monthly spending limit** in every one, for example $10–20, so costs can never run away):
    - **OpenAI** — https://platform.openai.com → "API keys" → "Create new secret key". Also runs the visitor chat and the newsletter intro.
    - **Anthropic (Claude)** — https://platform.claude.com → "API keys".
    - **Google Gemini** — https://aistudio.google.com/app/apikey → "Create API key" in a project with billing switched on (Google Search grounding of the current Gemini models is not part of the free tier; 5,000 searches a month are free, then $14 per 1,000).
    - **xAI (Grok)** — https://console.x.ai → "API keys"; buy a few dollars of credit. Grok also scans X for X watch.
    - **DeepSeek** — https://platform.deepseek.com → "API keys"; top up a few dollars. DeepSeek has no web search here: it answers from its own knowledge, and because it processes data in China it only ever receives research questions, never visitor chats.
4. **Mailjet account** for the newsletter — https://www.mailjet.com (the free plan sends 200 emails a day, 6,000 a month to up to 1,000 contacts). Details in step 9.
5. **Company details** — already filled in from the public data of Creoox AG (creoox.com imprint and the Liechtenstein commercial register); you only check them in step 7.
6. **Bot protection** — a free Cloudflare account for Turnstile (recommended before the site is announced). *Optional:* a free EIA key (US power prices).

### Which hosting to use

creoox.com runs on home.pl's **older platform** (the server identifies itself as *IdeaWebServer*; PHP up to 8.2). AI Forecast Atlas is written to run there, so **option A** works:

- **A. Your existing hosting (fine to start).** No extra cost. The site lives in its own folder next to the WordPress site. Both sites then share the hosting's small number of PHP processes (4 on the smaller plans): every assistant answer holds one for up to a minute, so AI Forecast Atlas allows only 2 answers at the same time and asks further visitors to try again a minute later. That keeps creoox.com responsive.
- **B. A new home.pl "Hosting Start" plan** (Apache, PHP 8.4). Keeps AI Forecast Atlas fully separate from WordPress — **recommended before you promote the site widely**. The steps are the same; you pick the new hosting in step 2.

---

## Step 1 — Bring the domain to home.pl

aiforecastatlas.com is the site's own domain (not a subdomain of creoox.com).

- **If the domain is registered at home.pl:** it is listed under **"Domeny"** (domains); nothing to do here.
- **If it is registered elsewhere:** either transfer it to home.pl, or keep it where it is and add it to home.pl as an external domain, then point it to home.pl as home.pl's help describes (DNS records or name servers). The home.pl panel shows the exact values when you add the domain. Ask home.pl support (BOK) if unsure: "I want to use my domain aiforecastatlas.com with my hosting".

DNS changes can take a few hours to take effect.

## Step 2 — Point the domain to its folder

1. Open **"Usługi WWW"** (web services) and click your hosting.
2. In **"Przypisane domeny"** (assigned domains) click **"Przypisz"** (assign). If aiforecastatlas.com is already listed, click **"Wszystkie"** → **"Edytuj"** instead.
3. Choose **aiforecastatlas.com** (and **www.aiforecastatlas.com**, if listed separately).
4. In **"Ustawienia WWW"** (web settings) choose **"Podkatalog z separacją serwisu"** (subfolder with site separation). If this option is not offered, choose **"Podkatalog bez separacji serwisu"** — both work.
5. As folder type **`/aimonitor`** — without `/public_html` in front (home.pl adds it). The folder keeps its technical name; visitors never see it.
6. For mail choose what fits: no mailboxes are needed for the site itself.
7. Click **"Wyślij"** (send) and wait a few minutes.

*Tip:* if the server check in step 5 later reports outgoing HTTPS as blocked, try **"Podkatalog bez separacji serwisu"** here before contacting support — the separated mode may restrict outgoing connections (not confirmed by home.pl).

## Step 3 — Switch on HTTPS (SSL)

1. Open **"Certyfikaty SSL"** (SSL certificates) and order or choose a certificate for **aiforecastatlas.com** (a single-domain certificate that includes www is enough).
2. Activate it: **"Opcje"** → **"Aktywuj certyfikat"** → choose the domain → tick **"Zainstaluj na serwerze, do którego jest przypisana domena"** → CSR: **"Generuj automatycznie"** → **"Aktywuj certyfikat"**.
3. When the status says **"Wystawiony"** (issued), open **"Opcje instalacji"** → **"Instaluj na serwerze"** → **"Instaluj"**.

The package already sends every visitor to the HTTPS address. Until the certificate is installed, the browser shows a certificate warning — that is expected; just finish this step first.

## Step 4 — Upload the files

1. Unzip the package on your computer. You get the folders `aimonitor` and `cron`.
2. Connect to your server, either:
    - in the browser: **"Usługi WWW"** → your server → **"Konta FTP"** (FTP accounts) → **"Opcje"** → **"WebFTP"**, or
    - with **FileZilla** (free): protocol **SFTP**, host as shown under "Konta FTP" → **"Host FTP"** (looks like `serwer123456.home.pl`), port **22222**, user = **"Główny login FTP"**, your password (set a new one under "Serwer WWW" → "Ustawienia" → "Hasło dostępu" if needed). SFTP needs SSH switched on. If it is not, use **FTPS** instead: protocol "FTP", encryption **"Require implicit FTP over TLS"**, port **990**. Avoid plain FTP (port 21 without encryption): it sends this password — which also controls the WordPress site — unencrypted.
3. Open the folder **`/public_html`** on the server and upload the whole **`aimonitor`** folder into it. Afterwards you must see `/public_html/aimonitor/index.html`.
4. Make sure the hidden files `.htaccess` were uploaded too (FileZilla: menu "Server" → "Force showing hidden files"). There is one in `aimonitor/`, one in `aimonitor/_private/` and one in `aimonitor/_private/storage/`.
5. **Do not upload the `cron` files yet** — that is step 8.

## Step 5 — Run the server check

Open **https://aiforecastatlas.com/check.php** in your browser. Every line should say **OK**. Fix the lines that say **PROBLEM** as described below. The streaming test at the bottom is informative only: if your server buffers, chat answers appear in one piece instead of word by word.

### If the PHP version is too old

AI Forecast Atlas needs PHP 8.0 or newer (8.2 recommended). Look at the line **"Web server"** on the check page, then open the file `/public_html/aimonitor/.htaccess` (WebFTP can edit files) and add three lines **at the very top**.

If the check page says **IdeaWebServer**, add exactly these three lines:

```
:Location /*.php
Use php82
:Location
```

If it says **Apache**, add these three lines instead:

```
<FilesMatch "\.php$">
SetEnv CGI_HANDLER php84
</FilesMatch>
```

Do **not** change the PHP version for the whole server in the panel: that would also change the WordPress site. If the page shows an error 500 after your change, remove the three lines again — they were for the other platform.

### If outgoing HTTPS is blocked

OpenAI and Mailjet must be reachable from your server. If the check says they are blocked, ask home.pl support ("BOK") to allow outgoing HTTPS connections from PHP.

### If storage is not writable

Make the folders `aimonitor/_private/storage` and `aimonitor/data` writable (WebFTP → properties → permissions 755).

## Step 6 — First login: set your admin password

Do this only when the browser shows the padlock for **https://**aiforecastatlas.com (step 3 finished) — never over a plain http:// address, because your password and keys would travel unencrypted.

1. Open **https://aiforecastatlas.com/admin/**. It asks for a **setup key** (this proves you control the server).
2. In WebFTP or FileZilla open the file **`/public_html/aimonitor/_private/storage/setup-key.php`** (it appears after you opened the admin page) and copy the **last line** (looks like `a1b2c3-d4e5f6-…`).
3. Paste it, choose an **admin password** (at least 12 characters — keep it in a password manager), enter your email and leave the site address as `https://aiforecastatlas.com/`.
4. Click **"Finish setup"**. The setup key file deletes itself and you are in the admin page.

From now on the check page is locked; the same checks are under **Admin → Overview → Health**. The admin page answers only at the site address you entered (https://aiforecastatlas.com/admin/); opened through another address that shows the same folder (for example creoox.com/aimonitor/), it sends you there, so your login is never stored for the WordPress domain.

## Step 7 — AI agents, company details and limits

**Admin → AI agents** — one card per agent:

1. Paste each **API key**, click **Save** on that card, then **"Test the key and model"**. You should see "OpenAI: OK" and so on for all five.
2. Leave the **models** and **weights** as they are to start:

    | Agent | Model | Weight | What it does |
    |---|---|---|---|
    | OpenAI | `gpt-6.1-sol` | 3 | web research (background mode) |
    | Anthropic | `claude-sonnet-5-5` | 3 | web research (message batch: half price, usually within the hour) |
    | Google Gemini | `gemini-3.8-flash` | 2 | web research with Google Search |
    | xAI | `grok-4.3` | 2 | web research; also X watch |
    | DeepSeek | `deepseek-v4-pro` | 1 | answers from its own knowledge (counted at half weight) |

    The weight decides how much an agent's answer counts when the answers are combined (weighted median). 0 means "show me its answer, but don't count it" — useful to try a new agent.
3. **How the answers are combined** — research on, budget **$25 a month** for all agents and X watch together (about $10–15 is typical), knowledge factor 0.5, tolerance 0.10.
4. **X watch** — on, scan days 1–5 (Monday to Friday), look back 36 hours, at most 6 items per scan. The **watch list** names accounts Grok should prefer (one per line, without @); it still looks beyond them. Click **"Scan X now"** once to see what it finds (the items wait under **X watch** until you approve them).
5. **Visitor assistant and newsletter writer** — the defaults (OpenAI `gpt-6-luna`, about $0.001 per answer) are fine.

**Admin → Settings:**

1. **Site and company** — filled in from the public company data: Creoox AG, a company limited by shares under the law of Liechtenstein, Landstrasse 40, 9495 Triesen; register FL-0002.524.394-4; represented by Tomasz Basinski; contact@creoox.com; data protection contact privacy@creoox.com; supervisory authority Datenschutzstelle Liechtenstein. Check every line (for example the VAT number, which only appears on creoox.com) and **Save** once. These fill the imprint and the privacy notice.
2. **Chat limits** — daily budget $3, 20 questions per visitor per hour, 2 answers at the same time. Increase the first two later if needed; raise "answers at the same time" only on hosting option B or a bigger plan.
3. **Bot protection (recommended)** — at https://dash.cloudflare.com → "Turnstile" → "Add widget": name "AI Forecast Atlas", hostname `aiforecastatlas.com`, widget mode **"Managed"**, then copy the **site key** and **secret key** here. Free; it protects the sign-up form and the assistant from bots.
4. **Data sources** — leave the SEC user agent as it is (it names Creoox and an email; the SEC asks for that). Register a free EIA key at https://www.eia.gov/opendata/register.php and paste it to enable the US power-price check.

Visit https://aiforecastatlas.com — the **Ask AI** button now answers questions.

## Step 8 — Switch on the scheduler

home.pl runs scheduled jobs from specially named files in the **main** folder.

1. Upload **`cron/cron-5min.php`** and **`cron/cron-13.php`** into **`/public_html/`** (next to the WordPress files — **not** into the `aimonitor` folder).
2. If files with these names already exist there, **do not overwrite them**. Open the existing file and copy over the lines of our file that start with `define(` and `require` (two lines in `cron-5min.php`, three in `cron-13.php`). Paste them at the end of the existing file — but if that file ends with `?>`, paste them **before** the `?>`, otherwise they are printed as text instead of being run.
3. Wait 10 minutes and look at **Admin → Overview → Health**: "Scheduler (cron) running" should be **OK**.

What runs when (Swiss time):

| When | What |
|---|---|
| every 5 minutes | checks what is due; sends newsletter batches |
| daily from 06:00 | the data check: official sources every day; the AI research panel Monday to Thursday (three questions a day, five agents each); X watch Monday to Friday |
| Friday 13:00 | the weekly release, then the newsletter |

If your hosting cannot run these files, use a free external cron service (for example cron-job.org) to open the address shown under **Admin → Overview → Scheduler** every 5 minutes.

## Step 9 — Newsletter with Mailjet

1. **Create the account** at https://www.mailjet.com. The free plan is enough to start: 200 emails a day, 6,000 a month and up to **1,000 contacts**. With more than about 180 subscribers, or close to 1,000 contacts, choose a paid plan, and enter your plan's daily limit in Settings (step 5 below). AI Forecast Atlas keeps a tenth of the daily limit free for confirmation emails and spreads a large newsletter over several days.
2. **Authorise your sender domain** — in Mailjet: **"Senders & domains"** → add the domain **creoox.com** (or the sender address you want, e.g. `news@creoox.com`; it must be a real mailbox or alias because Mailjet sends a confirmation email to it). *Good news: on 17 October 2026 creoox.com's DNS already contained Mailjet's SPF include, a `mailjet._domainkey` DKIM record and a DMARC record — so this may only need the check in Mailjet that the domain shows as authenticated.* Otherwise Mailjet shows two DNS records:
    - **SPF:** add `include:spf.mailjet.com` to your **existing** SPF record of creoox.com (there may only be **one** SPF record — edit it, don't add a second one).
    - **DKIM:** a TXT record named `mailjet._domainkey` with the value Mailjet shows.
   Add them in the home.pl panel under **"Domeny"** → creoox.com → DNS records. It can take a few hours until Mailjet shows the domain as authenticated. Recommended: also a DMARC record (`_dmarc`, `v=DMARC1; p=none; rua=mailto:your@address`) if creoox.com has none.
3. **Create the contact list** — **"Contacts"** → **"Contact lists"** → create **"AI Forecast Atlas"**. Note its **ID** (a number, shown in the list details or its address).
4. **Copy the API keys** — account menu → **"API Key Management"**: the **API key** and the **Secret key**.
5. In **Admin → Settings → Newsletter (Mailjet)** paste: API key, Secret key, Contact list ID, Sender address, Sender name "AI Forecast Atlas", Daily sending limit (200 on the free plan). **Untick "Newsletter sign-up open"** for now. **Save** — the admin page then creates the subscriber fields in Mailjet and says "Mailjet subscriber fields are ready".
6. In **Admin → Newsletter** click **"Check the Mailjet setup"**, then **"Show preview"** and **"Send a test email"** to yourself.
7. When the test email has arrived, go back to **Settings**, tick **"Newsletter sign-up open"** and **Save**.

Visitors can now subscribe with the **Subscribe** button: they pick topics, language (English, German, French, Polish) and weekly or monthly, and confirm by email (double opt-in). Every email has a one-click unsubscribe; open and click tracking are switched off.

## Step 10 — Your weekly routine (about 5 minutes)

1. **Each morning** the data check runs. If it finds something, you get an email "N new data points to review".
2. **Admin → Review:** compare the new value with the current one, open the source, then **Approve** (you can edit the value first) or **Reject**. Research items show a table with **every agent's answer**: value, source link (or "AI knowledge"), quote and warnings. The proposal is the weighted median — one agent's real answer with its own source; **"Use this answer"** publishes another agent's answer instead. A value is approved with its source link — the link, quote, references and all agents' answers are published with it, so every visitor can check where a number comes from. When an AI model gives a figure from its own knowledge (no page to cite), you can still approve it with **Basis: AI knowledge**: it is published with the label "AI knowledge", the model, the date and the model's explanation.
3. **Admin → X watch:** open each post on X, check that it says what the summary says, adjust the title or labels if needed and untick any post or confirming page you don't want to show, then **Approve and publish** (it appears on the dashboard at once and goes into the next release and newsletter) or **Reject**. Items you don't review are dropped after 14 days. **Withdraw** removes a published item from the dashboard, the weekly releases and the feeds (for example when an author asks).
4. **Admin → Release → "Build the release"** (your browser computes all eight scenarios in a second) → check the summary → **"Stage for Friday 13:00"**.
5. **Friday 13:00** the release goes live by itself and the newsletter goes out in batches. If nothing was staged, last week's release is repeated ("no new release this week"); if you had approved values but forgot to stage them, you get an email reminder.
6. **Admin → Suggestions** lists improvement ideas visitors sent from the assistant.

---

## Troubleshooting

| You see | Do this |
|---|---|
| Certificate warning in the browser | SSL is not installed yet (step 3). To test before that, put `#` in front of the two `RewriteCond`/`RewriteRule` HTTPS lines in `aimonitor/.htaccess`, and remove the `#` again afterwards. |
| "Internal Server Error" (500) after editing `.htaccess` | Remove the lines you added — they were for the other server platform (step 5). |
| "AI Forecast Atlas needs PHP 8.0 or newer" | Step 5, PHP version. |
| The assistant says it is switched off | Admin → AI agents → OpenAI: key missing or wrong → click "Test the key and model". Check your OpenAI billing. |
| An agent card says "failed" | Usually no credit left, a wrong key or a model name the provider retired: test it on its card, top up, or pick another model from the list. The other agents keep working. |
| X watch scans fail with a time-out | Grok searched too long for one scheduler run (it tries twice). Lower "Most items per scan" or the look-back hours under AI agents → X watch, or use "Scan X now". |
| You want today's research done again | Admin → Overview → **Restart today's check** (two clicks). It asks every agent again, so it costs again; "Run the daily data check now" only continues where it stopped. |
| "The server’s security filter stopped this message" | home.pl's firewall blocked a message with code or links. Rephrase it. |
| Visitors see "Many people are asking right now" | Two answers were already running. Normal at peaks; if it happens often, move to hosting option B and raise "Answers at the same time" in Settings → Chat limits. |
| The admin page jumps to aiforecastatlas.com | You opened it through another address. Use https://aiforecastatlas.com/admin/ (or change the site address in Settings → Site). |
| Health: "Scheduler runs finish in time" says CHECK | The host stopped scheduler runs before they finished. Nothing repeats endlessly (each step is retried at most twice), but if it continues, use the external cron option (step 8). |
| Confirmation emails don't arrive | Mailjet → "Logs" / "Senders & domains": the sender address or domain is not validated yet; check the spam folder. |
| "Scheduler (cron) running" stays CHECK | The cron files must be directly in `/public_html` with exactly these names; the path inside them must match your folder name (`aimonitor`). |
| Health says the scheduler files ran with an old PHP | The cron files use the PHP version of the main site (WordPress). Use the external cron option instead (step 8, last paragraph); it runs with AI Forecast Atlas's own PHP version. |
| Forgot the admin password | Delete `aimonitor/_private/storage/admin.php`, open the admin page again and repeat step 6 (a new setup key appears). Your settings stay. |
| Something else | Admin → Overview → Health shows what is wrong; logs are in `aimonitor/_private/storage/logs/`. |

## Updating to a new version

Use the **update package** (`aimonitor-homepl-update-<version>.zip`): it contains only program files. Upload its `aimonitor` folder over the old one. It leaves these alone on the server:

- `aimonitor/_private/storage/` — your settings, keys, review queue and logs,
- `aimonitor/_private/config/` — installed configuration,
- `aimonitor/data/` and `aimonitor/feeds/` — every published release and the feeds,
- the generated scenario, measure, release, About, FAQ and Methodology pages, sitemap, robots file and AI-readable files,
- `aimonitor/.htaccess` — so the PHP-version lines you may have added in step 5 stay in place. (If a release note ever says that `.htaccess` changed, take it from the full package and add your lines again at the top.)

Never upload the **full** package over a running site: it would replace your published data with the first release.

For version **1.3.1**, follow [the release checklist](RELEASE-1.3.1.md). Upload `aimonitor-homepl-update-1.3.1.zip`'s `aimonitor/` contents into the existing site folder, keeping existing files and folders that are not in the update. No configuration, scheduler or root `.htaccess` change is needed when updating from 1.3.0. Reload Admin, then check **Release → Build → Stage → Staged**. Staging queues the release for its scheduled publication; it does not publish immediately or send an email at that moment.

For version 1.3.0, follow [the release checklist](RELEASE-1.3.0.md): merge the new public security and canonical-host rules into the existing `.htaccess`, keeping its PHP handler. Then use **Admin → Release → Refresh public pages** to generate the new pages from already-published releases. This does not publish working data or send a newsletter.

## Backups

Don't rely only on the hosting's own backups, which are short-term. Once a month, download `aimonitor/_private/storage/` and `aimonitor/data/` to your computer (WebFTP or FileZilla).

## Security in short

- API keys are stored only in `aimonitor/_private/storage/settings.php`, a file that cannot be read over the web.
- All private data files — including staged releases before Friday — are written so that opening them in a browser shows nothing, even if a server ignores the `.htaccess` protection.
- The admin page needs your password; after 6 wrong attempts it pauses for 15 minutes. It works only at the site's own address, and every action that changes something needs a signed request from the admin page itself.
- AI costs are booked before each call, so the daily and monthly budgets hold even when a visitor closes the page or the host stops a run.
- Use a strong admin password and set spending limits in all five AI accounts.
- Research questions and X scans contain no personal data; visitor chats go only to the chat provider you chose (never to DeepSeek).

## Legal checklist (not legal advice)

- Check the company details (step 7) so the **imprint** and **privacy notice** are complete; ask your lawyer to review the privacy notice (`privacy.php`).
- **Creoox AG is registered in Liechtenstein, which is in the EEA.** The GDPR therefore applies to it directly, the supervisory authority is the Datenschutzstelle Liechtenstein, and **no EU representative (GDPR Art. 27) is needed** — as long as Creoox AG (Liechtenstein) is the operator named in the imprint. If a Swiss company (for example a future holding SA) operated the site instead, the Polish edition would make it target EU readers, and a representative would be needed (commercial services cost roughly €150–850 a year).
- The newsletter already has double opt-in, an unsubscribe link in every email, no tracking and a consent record (GDPR, Swiss UWG and FADP). The deletion periods in the privacy notice are applied automatically: consent records after three years, suggestions after 24 months, newsletter address lists as soon as a send is finished.
- X watch shows links to public posts and the public names of their authors; the privacy notice explains the legal basis (legitimate interest) and that authors can ask for removal (Admin → X watch → Withdraw).
- Accept the data processing agreement (DPA) in your Mailjet account and, if you wish, the DPAs of OpenAI, Anthropic, Google and xAI. DeepSeek offers none, which is why it only receives research questions.
- The trademark notice (including Autodesk®) is built into the footer, the imprint and every newsletter.
