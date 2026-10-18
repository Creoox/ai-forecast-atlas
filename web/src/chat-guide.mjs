/* Shared visitor-chat knowledge and topic selection.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

// Aliases name existing controls; their explanations stay in config/methods.json.
const PANEL_TERMS = {
  scenarios: ['scenario', 'scenario chips', 'preset'],
  time: ['timeline', 'scrubber', 'play', 'pause', 'playback', 'tour', 'tour all', 'scenario tour', 'speed', 'now button', '2023 button', 'from today', 'from 2023', 'reveal as it plays', 'time cursor'],
  guide: ['help', 'keyboard', 'keyboard shortcuts', 'shortcut', 'hotkeys', 'controls', 'tour', 'tutorial', 'walkthrough', 'guided tour', '60 second tour', 'explain mode'],
  theme: ['theme', 'dark mode', 'light mode', 'sun icon', 'moon icon'],
  layout: ['layout', 'text size', 'font size', 'small text', 'larger text', 'readability', 'resize', 'move panel', 'pin panel', 'hide panel', 'show panel', 'expand panel', 'focus view', 'customize panels', 'big charts', 'presenter', 'compact', 'reset', 'reset to default', 'reset layout'],
  relbar: ['weekly release', 'release bar', 'release schedule'],
  wire: ['news wire'], kpis: ['kpi', 'key figures'], brief: ['scenario brief', 'thesis'],
  drivers: ['driver', 'slider', 'tilt', 'custom', 'custom run', 'custom scenario', 'reset', 'reset drivers', 'reset scenario'],
  shocks: ['shock', 'stress test'], lanes: ['chart', 'lane', 'timelines'], net: ['causal map', 'causal network'],
  phase: ['phase portrait'], pools: ['value migration'], lens: ['sector lens'],
  heat: ['impact matrix', 'heatmap'], signs: ['signpost', 'early warning'], events: ['event log'],
  matrix: ['scenario matrix', 'save csv', 'export selected run', 'download selected scenario'], ledger: ['evidence ledger', 'anchor', 'starting values'],
  factors: ['factor library'], footer: ['method and sources'],
  'chat-ask': ['assistant', 'chat', 'ask the assistant'],
  'chat-suggest': ['suggestion', 'suggest an improvement', 'feedback'],
  subscribe: ['subscribe', 'newsletter', 'unsubscribe'], share: ['share', 'embed', 'permalink', 'chart image', 'svg'],
  data: ['data and api', 'api', 'download', 'export', 'csv', 'json', 'rss', 'feed', 'mcp'],
  about: ['about', 'credits', 'license', 'licence'], sources: ['sources and methods', 'source', 'formula'],
  broadcast: ['broadcast', 'record', 'recording', 'video', 'save video', 'mp4', 'webm', 'stop and save', 'presentation', 'full screen'],
  xwatch: ['x watch', 'xwatch', 'twitter']
};

// Keep this deliberately ASCII-only: the PHP selector uses strtolower and the same rules.
function chatGuideNormalize(value) {
  return String(value || '').replace(/[A-Z]/g, c => c.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/ +/).map(word => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word).join(' ');
}

export function buildChatGuide(engine, methods) {
  const scenarios = engine.SCENARIOS.map(s => ({ key: s.key, name: s.name, short: s.short, thesis: s.thesis, first: s.first.slice() }));
  const features = Object.entries(methods.panels).map(([id, p]) => ({ id, title: p.title, summary: p.oneLiner }));
  const glossary = methods.glossary.map(g => ({ term: g.term, def: g.def }));
  const entries = scenarios.map(s => ({
    id: 'scenario:' + s.key, terms: [s.key, s.name, s.short],
    detail: { id: 'scenario:' + s.key, type: 'scenario', ...s, drivers: methods.scenarios[s.key]?.tilts || '', caveat: 'A hypothetical scenario, not an observed event, probability or forecast.' }
  }));
  for (const [id, p] of Object.entries(methods.panels)) {
    const detail = { id: 'panel:' + id, type: 'panel', title: p.title };
    for (const key of ['oneLiner', 'what', 'howToRead', 'method', 'sources', 'caveats']) if (p[key] != null) detail[key] = p[key];
    entries.push({ id: detail.id, terms: [id, p.title, ...(PANEL_TERMS[id] || [])], detail });
  }
  for (const g of glossary) {
    const id = 'glossary:' + chatGuideNormalize(g.term).replace(/ /g, '-');
    entries.push({ id, terms: [g.term], detail: { id, type: 'glossary', ...g } });
  }
  return {
    schema: 'aimonitor.chat-guide/1',
    rules: 'Use this site guide to explain dashboard labels, scenarios and controls, even when they are not selected in the current view. A short label and its formal scenario name refer to the same scenario. Answer every part of the visitor’s question. Scenario theses, drivers and early signs describe hypothetical paths, not observed events, probabilities or forecasts. This guide is product knowledge, not current market data. Use the separately supplied evidence ledger and release for dated data claims. Helpful general knowledge is allowed when clearly labelled [AI]; distinguish it from site definitions and verified data. If current data are missing, say which claim cannot be verified while still explaining the documented feature or concept. Do not invent a feature, number, citation or source.',
    overview: { scenarios, features, glossary }, entries
  };
}

export function selectChatGuide(guide, question, panelId = '', previousQuestion = '') {
  const entries = Array.isArray(guide?.entries) ? guide.entries : [];
  const matches = text => {
    const query = ' ' + chatGuideNormalize(text) + ' ';
    return entries.map((entry, index) => {
      let words = 0, length = 0;
      for (const term of entry.terms || []) {
        const normalized = chatGuideNormalize(term), count = normalized ? normalized.split(' ').length : 0;
        if (normalized && query.includes(' ' + normalized + ' ') && (count > words || (count === words && normalized.length > length))) {
          words = count; length = normalized.length;
        }
      }
      return { entry, index, words, length };
    }).filter(m => m.words > 0).sort((a, b) => b.words - a.words || b.length - a.length || a.index - b.index).map(m => m.entry);
  };
  const current = chatGuideNormalize(question);
  let found = matches(question);
  const followup = current && current.split(' ').length <= 12 && (
    /\b(it|its|thi|that|these|those|they|them)\b/.test(current) ||
    /^(and )?(why|how|more|tell me more|explain more|go on|continue|elaborate)( please)?$/.test(current)
  );
  if (!found.length && followup) found = matches(previousQuestion);
  const panel = entries.find(e => e.id === 'panel:' + panelId);
  if (panel) found = [panel, ...found.filter(e => e.id !== panel.id)];
  return { overview: guide?.overview || { scenarios: [], features: [], glossary: [] }, details: found.slice(0, 3).map(e => e.detail) };
}
