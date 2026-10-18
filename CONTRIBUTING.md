# Contributing

Thank you for helping to improve AI Forecast Atlas.

- **Ideas and data problems:** use the "Suggest an improvement" tab of the assistant on https://aiforecastatlas.com or open an issue.
- **Data corrections:** open an issue with the measure, the better value, its period and a link to the source.
- **Code:** fork, create a branch, run `node web/build.mjs`, `npm test` and `node test/integration.mjs`, then open a pull request. Keep PHP compatible with 8.0 and avoid new dependencies.

## Contributor licence agreement

As for xeokit SDK, Creoox AG asks contributors to sign its Contributor License Agreement before a pull request is merged (the same CLA as xeokit SDK, available from contact@creoox.com). It does not transfer your copyright; it lets Creoox distribute your contribution under the project's licences, including the Business Source License and commercial licences.

## Style
- Model logic lives only in `engine/engine.mjs`. Do not re-implement it elsewhere.
- Texts: plain words, units with numbers, sources for every starting value.
- Trademarks: use names only as needed, e.g. “Autodesk® software”, never in possessive form; no logos.
