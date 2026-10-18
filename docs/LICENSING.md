# Licensing and protection of AI Forecast Atlas

*Plain-language summary. This is not legal advice; have a lawyer confirm the licence and the trademark filing.*

## Licences in this repository

The code, the scenario model, the dashboard design and its explanatory texts are published under the **Business Source License 1.1** (BSL), with Creoox AG as licensor.

| Part | Licence | File |
|---|---|---|
| Code, scenario model, dashboard design and texts | Business Source License 1.1; each version becomes AGPL-3.0 after four years | `LICENSE` |
| Published data, charts, release notes, newsletter texts | CC BY 4.0 | `LICENSE-DATA.md` |
| Name "AI Forecast Atlas", Creoox names and logos | not licensed (trademarks) | README |
| Contributions | Creoox CLA, as for xeokit SDK | `CONTRIBUTING.md` |

## What the BSL allows and forbids

- **Allowed for everyone:**
  - reading, studying, changing and sharing the code;
  - non-commercial research, teaching and personal use;
  - internal evaluation;
  - production use that is not a competing offering.
- **Not allowed without a licence from Creoox AG:** offering the code, a modified version or a derived work to others as a website, service or product that provides AI forecasts, AI scenario models, AI market or technology monitoring, or a comparable dashboard.
- **After four years** each version becomes AGPL-3.0, so the work stays open in the long run. For version 1.2.0 this happens on 18 October 2030.
- **Commercial licences** can be granted by Creoox AG at any time: contact@creoox.com.

The code stays public on GitHub, so it still earns trust and credit. It is called "source-available", not "open source".

## What a licence cannot protect

- **The idea itself.** Copyright protects the code, texts and visual design as written. It does not protect the concept of an AI forecast atlas. Someone who builds a similar site from scratch, without copying, is not bound by any licence.
- **Patents** are rarely possible for software in Europe and the public release counts as prior publication.

## Recommended steps for real protection

1. **Trademark "AI Forecast Atlas".** The name is the asset copyists cannot take.
   - File it in Switzerland (IPI), and in the EU (EUIPO) or internationally via WIPO (Madrid) if you plan to market abroad.
   - Classes 9, 35, 41 and 42 are the usual ones for software, data and online services; a trademark attorney can confirm this.
2. **Keep the evidence of authorship.** The git history with dates, the releases and the published data show that Creoox created the work first. The domain registration helps too.
3. **Repository:** https://github.com/Creoox/ai-forecast-atlas holds the code.
4. **Update the repository description:** in the "About" box on the GitHub page, click the gear and set:
   - Description: *AI Forecast Atlas by Creoox AG — weekly AI scenario forecasts with sources, open data, newsletter, AI assistant and MCP server. Source-available (BSL 1.1).*
   - Website: `https://aiforecastatlas.com`
   - Topics: `ai`, `forecasting`, `scenario-analysis`, `open-data`, `mcp`
5. **Enforce when needed.** If someone runs a copy as a competing service, the licence lets Creoox demand that they stop or take a commercial licence.

## Running your own copy

If you run a copy for permitted purposes:
- Replace the operator's details in `config/operator.json` or under Admin → Settings. The health check warns when a copy on another domain still names Creoox AG.
- Never commit a live server's `_private/storage` (it holds keys and personal data); `.gitignore` excludes it.
