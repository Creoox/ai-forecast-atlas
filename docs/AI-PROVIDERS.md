# AI agents, roles and providers

Set keys, models, weights and tasks in **Admin → AI agents**. Keys are stored on the server only and never shown again in full.

## The research panel (five agents)

Every research question of the daily data check (three a day, Monday to Thursday) goes to each agent that is switched on, has a key and has "Answers the daily research questions" ticked.

| Agent | Default model | Weight | How it researches | Runs as |
|---|---|---|---|---|
| OpenAI | `gpt-6.1-sol` | 3 | web search, cites pages | background response, collected on a later scheduler run |
| Anthropic | `claude-sonnet-5-5` | 3 | web search (up to 3 searches), cites pages | message batch: half price, most finish within the hour |
| Google Gemini | `gemini-3.8-flash` | 2 | Google Search grounding | direct answer (≤ 30 s) |
| xAI | `grok-4.3` | 2 | web search (up to 3 tool turns) | direct answer (≤ 30 s) |
| DeepSeek | `deepseek-v4-pro` | 1 | no web access: its own knowledge, labelled “AI knowledge” | direct answer, “thinking” switched off |

**How answers are combined.** Each answer is checked: the value must be in the plausible range of the question, the source link must be a real http(s) page, it should be among the pages the search returned (for Gemini, whose search returns redirect links, the domain is compared) and there should be a quote. The numeric answers are then combined by **weighted median** — the lowest answer at which half of the counted weight is reached. The weight of an answer is the agent's weight (0–10), times the knowledge factor (default 0.5) when it has no source. The published value is therefore one agent's real answer (the *lead*), and its source supports it exactly. All answers are kept with the value and published (`via.panel`): who answered, with which value and source, and whether it agrees within the tolerance (default ±10%). In Review you can publish another agent's answer instead (“Use this answer”) or edit the value.

**Costs (October 2026 list prices).** About $0.02–0.07 per agent and question, roughly $10–15 a month for the whole panel. The monthly research budget (default $25) covers the panel and X watch together; when it is used up, research pauses until the next month.

## X watch (Grok)

On the scan days (default Monday to Friday) Grok runs one search of posts on X from the look-back period (default 36 hours) with xAI's `x_search` tool and checks them with web search. It prefers the accounts on the watch list but also looks beyond it, and reports at most 6 items with a credibility label (high, medium, low, unverified) and an impact label (reach on X). Post links are normalised to `https://x.com/<handle>/status/<id>` and flagged when they were not among the posts the search returned. Items wait under **Admin → X watch** until you approve them. xAI bills X search per post and profile read (about $5 per 1,000 posts); a scan typically costs $0.10–0.40, and AI Forecast Atlas books the exact cost xAI reports.

## Other roles

| Role | Default | Notes |
|---|---|---|
| Chat assistant | OpenAI `gpt-6-luna`, reasoning effort low | answers visitors; streamed where the server allows; daily budget; optional fallback `provider:model`. DeepSeek is never used here. |
| Newsletter intro | OpenAI `gpt-6-luna` | writes the opening paragraph per language; every number is checked against the release facts, otherwise a template is used |

## Supported providers (October 2026)

| Provider | API used | Web search | Example models (list price per million tokens, input/output) |
|---|---|---|---|
| OpenAI | Responses API (background mode) | yes | `gpt-6-luna` $0.10/$0.50 · `gpt-6.1-sol` $2/$10 · `gpt-6-astra` $10/$50 |
| Anthropic | Messages API, Message Batches | yes ($10 per 1,000 searches) | `claude-haiku-5-5` $0.10/$0.50 · `claude-sonnet-5-5` $2/$10 · `claude-opus-5-5` $4/$20 |
| Google Gemini | generateContent with Google Search | yes (5,000 searches a month free, then $14 per 1,000) | `gemini-3.8-flash` $0.75/$3.75 · `gemini-4-argon` · `gemini-3.1-flash-lite` $0.25/$1.50 |
| xAI | Responses API with `web_search` and `x_search` | yes ($5 per 1,000 web searches; X search per post and profile) | `grok-4.3` $1.25/$2.50 · `grok-4.7` $2/$6 |
| DeepSeek | Chat Completions | no | `deepseek-flash` · `deepseek-v4-pro` |
| Mistral | Chat Completions | no | `mistral-small-latest` · `mistral-large-latest` |
| Perplexity | Agent API (`/v1/responses`) | yes | `preset:fast` |
| OpenRouter | Chat Completions | yes | any `provider/model`, e.g. `openai/gpt-6-luna` |

Prices change; the admin page estimates costs with the list prices above (override them in `ai.prices` if needed), corrects them with the usage each provider reports, and stops the chat when the daily budget is used.

## Privacy

For the chat, the visitor's messages, the dashboard view and their optional role and country are sent to the chat provider. Research questions and X scans contain no personal data. DeepSeek (Hangzhou, China; no data processing agreement) only ever receives research questions. Name the providers you use in the privacy notice — it lists the configured ones automatically. If you show Google search-grounded answers to visitors, Google's terms require showing its search suggestions; AI Forecast Atlas uses search only for the admin's review queue and publishes the original source pages, never Google's redirect links.
