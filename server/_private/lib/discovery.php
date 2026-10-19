<?php
/* AI Forecast Atlas — crawlable views of already published releases. No model calculations.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

/** Stable public paths: changing a display name must not change an established URL. */
function aim_discovery_scenario_path(string $key): string
{
    $slugs = ['COMM' => 'commoditization', 'BUST' => 'bubble-burst', 'BRKW' => 'breakthrough', 'SPLT' => 'fragmentation', 'PWR' => 'power-wall', 'BOOM' => 'productivity-boom', 'TRST' => 'trust-crisis', 'PLAT' => 'platform-capture'];
    return 'scenarios/' . ($slugs[$key] ?? strtolower(preg_replace('/[^A-Za-z0-9]/', '', $key))) . '/';
}
function aim_discovery_measure_path(string $key): string
{
    $slugs = ['K'=>'ai-capex','R'=>'ai-revenue','CC'=>'capital-charge','ccov'=>'revenue-capital-charge','cov'=>'revenue-capex','VL'=>'frontier-lab-valuations','VN'=>'nvidia-value','Mult'=>'lab-revenue-multiple','S'=>'hype','Cs'=>'credit-stress','Bs'=>'bank-stress','G'=>'open-weight-lag','Np'=>'frontier-parity','Pf'=>'frontier-token-price','Pc'=>'good-enough-token-price','prem'=>'frontier-price-premium','mf'=>'frontier-markup','DC'=>'data-centre-electricity','Pp'=>'commercial-power-price','GR'=>'gpu-rent','DR'=>'dram-price','LB'=>'local-ai-box','Ufp'=>'fleet-utilisation','Uopp'=>'powered-capacity-utilisation','STp'=>'unpowered-compute','SVp'=>'compute-demand-served','OS'=>'open-weight-token-share','ES'=>'enterprise-open-weight-use','LS'=>'local-ai-share','AS'=>'specialised-agents','TC'=>'provider-concentration','PF'=>'lab-distress','SN'=>'signal-to-noise','GDP'=>'ai-gdp-growth','AU'=>'ai-work-realised','AUd'=>'ai-work-demand','AUp'=>'ai-work-potential','CRp'=>'ai-work-revenue-share','BLD'=>'data-centre-construction','AUa'=>'aeco-work','AUdev'=>'software-work','seatG'=>'knowledge-work-seats','seatA'=>'aeco-seats','CtaskI'=>'cost-per-task','PLAT'=>'platform-lock-in'];
    return 'measures/' . ($slugs[$key] ?? strtolower(preg_replace('/[^A-Za-z0-9]/', '', $key))) . '/';
}
function aim_discovery_link(string $path, string $text): string
{
    return '<a href="' . aim_h(aim_site_url($path)) . '">' . aim_h($text) . '</a>';
}
/** No candidate, working dataset, staged bundle, provider response or private setting is read as content. */
function aim_discovery_bundle(string $id): ?array
{
    if (!aim_valid_release_id($id)) return null;
    $dir = aim_public('data/releases/' . $id . '/');
    $r = aim_read_json($dir . 'release.json', []);
    if (!is_array($r) || ($r['id'] ?? '') !== $id) return null;
    $ds = aim_read_json($dir . 'dataset.json', []);
    $dictionary = aim_read_json($dir . 'metrics.json', []);
    $scenarios = array_values(array_filter(is_array($r['scenarios'] ?? null) ? $r['scenarios'] : [], fn($s) => is_array($s) && preg_match('/^[A-Z]{3,5}$/', (string)($s['key'] ?? ''))));
    $metrics = array_filter(is_array($dictionary['metrics'] ?? null) ? $dictionary['metrics'] : [], fn($v, $k) => is_array($v) && preg_match('/^[A-Za-z]{1,8}$/', (string)$k), ARRAY_FILTER_USE_BOTH);
    $series = [];
    foreach ($scenarios as $s) {
        $v = aim_read_json($dir . 'series/' . $s['key'] . '.json', []);
        if (is_array($v)) $series[$s['key']] = $v;
    }
    return ['release' => $r, 'dataset' => is_array($ds) ? $ds : [], 'metrics' => $metrics, 'scenarios' => $scenarios, 'series' => $series];
}
function aim_discovery_published_ids(): array
{
    $ids = [];
    foreach (aim_releases_index()['releases'] ?? [] as $e) {
        $id = (string)($e['id'] ?? '');
        if (aim_valid_release_id($id)) $ids[$id] = true;
    }
    $ids = array_keys($ids); sort($ids, SORT_STRING); return $ids;
}
function aim_discovery_latest(): ?array
{
    $r = aim_read_json(aim_public('data/latest/release.json'), []);
    $id = is_array($r) ? (string)($r['id'] ?? '') : '';
    // The release index is the publication gate. Never render an unindexed staged/working id.
    return in_array($id, aim_discovery_published_ids(), true) ? aim_discovery_bundle($id) : null;
}
function aim_discovery_methods(): array
{
    $v = aim_read_json(aim_public('assets/methods.json'), []);
    return is_array($v) ? $v : [];
}
function aim_discovery_date(array $r): string
{
    $s = (string)($r['publishedAt'] ?? $r['asOf'] ?? '');
    try { return $s !== '' ? (new DateTimeImmutable($s))->format(DATE_ATOM) : ''; } catch (Throwable $e) { return ''; }
}
function aim_discovery_citation(array $r): string
{
    return 'AI Forecast Atlas by Creoox AG, release ' . (string)($r['id'] ?? '');
}
function aim_discovery_jsonld(array $data): string
{
    // JSON strings can contain HTML. Hex escaping prevents a quote from closing the script element.
    return '<script type="application/ld+json">' . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) . '</script>';
}
function aim_discovery_schema(array $r, string $path = '', string $title = '', string $type = 'WebPage', array $extra = []): array
{
    $site = aim_settings()['site'];
    $base = aim_site_url();
    $org = ['@type' => 'Organization', '@id' => $base . '#organization', 'name' => (string)$site['company']];
    if (aim_url_ok((string)($site['company_url'] ?? ''))) $org['url'] = $site['company_url'];
    if (!empty($site['address'])) $org['address'] = (string)$site['address'];
    if (filter_var($site['email'] ?? '', FILTER_VALIDATE_EMAIL)) $org['contactPoint'] = ['@type'=>'ContactPoint', 'contactType'=>'general enquiries', 'email'=>$site['email'], 'telephone'=>(string)($site['phone'] ?? '')];
    $repo = (string)($site['repo_url'] ?? '');
    if (aim_url_ok($repo) && strtolower((string)parse_url($repo, PHP_URL_HOST)) === 'github.com') $org['sameAs'] = [$repo];
    $linkedin = (string)($site['linkedin_url'] ?? '');
    if (aim_url_ok($linkedin) && in_array(strtolower((string)parse_url($linkedin, PHP_URL_HOST)), ['linkedin.com','www.linkedin.com'], true)) $org['sameAs'][] = $linkedin;
    if (aim_url_ok((string)($site['company_logo_url'] ?? ''))) $org['logo'] = $site['company_logo_url'];
    $website = ['@type'=>'WebSite', '@id'=>$base . '#website', 'url'=>$base, 'name'=>'AI Forecast Atlas — AI economy scenarios', 'publisher'=>['@id'=>$base . '#organization'], 'image'=>$base . 'og.png'];
    $datasetId = aim_site_url('data/releases/' . ($r['id'] ?? '') . '/') . '#dataset';
    $dataset = ['@type'=>'Dataset', '@id'=>$datasetId, 'name'=>'AI Forecast Atlas scenario model, release ' . ($r['id'] ?? ''), 'description'=>'Eight what-if paths for the AI economy to 2035, with sourced starting values. Scenario outputs, not forecasts.', 'url'=>aim_site_url('data/releases/' . ($r['id'] ?? '') . '/'), 'creator'=>['@id'=>$base . '#organization'], 'license'=>'https://creativecommons.org/licenses/by/4.0/', 'version'=>(string)($r['id'] ?? ''), 'dateModified'=>aim_discovery_date($r), 'measurementTechnique'=>'JavaScript scenario engine ' . (string)($r['engine'] ?? ''), 'distribution'=>[['@type'=>'DataDownload','encodingFormat'=>'text/csv','contentUrl'=>aim_site_url('data/releases/' . ($r['id'] ?? '') . '/series/all.csv')]]];
    $page = ['@type'=>$type, '@id'=>aim_site_url($path) . '#page', 'url'=>aim_site_url($path), 'name'=>$title ?: 'AI Forecast Atlas — AI economy scenarios to 2035', 'isPartOf'=>['@id'=>$base . '#website'], 'publisher'=>['@id'=>$base . '#organization'], 'dateModified'=>aim_discovery_date($r), 'citation'=>aim_discovery_citation($r), 'about'=>['@id'=>$datasetId]];
    if ($type === 'Report') { $page['datePublished'] = aim_discovery_date($r); $page['reportNumber'] = (string)($r['id'] ?? ''); }
    return ['@context'=>'https://schema.org', '@graph'=>[$org, $website, $dataset, array_merge($page, $extra)]];
}
function aim_discovery_head(string $title, string $description, string $path, array $r, string $type = 'WebPage', array $extra = []): string
{
    $url = aim_site_url($path);
    return '<link rel="canonical" href="' . aim_h($url) . '"><meta property="og:type" content="' . ($type === 'Report' ? 'article' : 'website') . '">'
        . '<meta property="og:site_name" content="AI Forecast Atlas"><meta property="og:title" content="' . aim_h($title) . '"><meta property="og:description" content="' . aim_h($description) . '"><meta property="og:url" content="' . aim_h($url) . '"><meta property="og:image" content="' . aim_h(aim_site_url('og.png')) . '">'
        . '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' . aim_h($title) . '"><meta name="twitter:description" content="' . aim_h($description) . '"><meta name="twitter:image" content="' . aim_h(aim_site_url('og.png')) . '">'
        . aim_discovery_jsonld(aim_discovery_schema($r, $path, $title, $type, $extra));
}
function aim_discovery_page(string $title, string $description, string $path, string $body, array $r, string $type = 'WebPage', array $extra = []): string
{
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . aim_h($title . ' | AI Forecast Atlas') . '</title><meta name="description" content="' . aim_h($description) . '"><link rel="icon" href="' . aim_h(aim_site_url('favicon.svg')) . '" type="image/svg+xml">'
        . aim_discovery_head($title, $description, $path, $r, $type, $extra)
        . '<style>:root{color-scheme:light dark}body{margin:0;background:#f3f2ed;color:#202026;font:17px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif}main{max-width:1080px;margin:auto;padding:24px max(18px,env(safe-area-inset-left)) 48px;overflow-wrap:anywhere}a{color:#794100}h1{font-size:clamp(1.8rem,4vw,2.8rem);line-height:1.15}h2{margin-top:2rem}nav,footer,.meta{font-size:.9rem}nav a{display:inline-block;margin:0 .8rem .4rem 0}.discovery-table{overflow:auto;max-width:100%}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #bbb;padding:.5rem}th{font-weight:650}code{white-space:pre-wrap}blockquote{margin:1rem 0;border-left:3px solid #aaa;padding-left:1rem}footer{border-top:1px solid #aaa;margin-top:2rem;padding-top:1rem}@media(prefers-color-scheme:dark){body{background:#101114;color:#e8e7e3}a{color:#ffc369}th,td{border-color:#555}}</style></head><body><main>'
        . '<nav aria-label="Site">' . aim_discovery_link('', 'Dashboard') . aim_discovery_link('scenarios/', 'Scenarios') . aim_discovery_link('measures/', 'Measures') . aim_discovery_link('releases/', 'Releases') . aim_discovery_link('methodology/', 'Methodology') . aim_discovery_link('faq/', 'FAQ') . aim_discovery_link('about/', 'About & contact') . '</nav>'
        . '<h1>' . aim_h($title) . '</h1>' . $body . aim_discovery_footer($r) . '</main></body></html>';
}
function aim_discovery_footer(array $r): string
{
    return '<footer><p>' . aim_h(aim_discovery_citation($r)) . '. Published <time datetime="' . aim_h(aim_discovery_date($r)) . '">' . aim_h((string)($r['publishedAt'] ?? $r['asOf'] ?? '')) . '</time>; data as of ' . aim_h((string)($r['asOf'] ?? '')) . '; engine ' . aim_h((string)($r['engine'] ?? '')) . '.</p><p>Published data: <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Code, model and design: ' . aim_discovery_link('LICENSE', 'Business Source License 1.1') . '. A scenario model, not a forecast or investment advice.</p><p>Autodesk® is a registered trademark of Autodesk, Inc. This independent project is not affiliated with or endorsed by Autodesk, Inc.</p><p>' . aim_discovery_link('imprint.php', 'Imprint') . ' · ' . aim_discovery_link('privacy.php', 'Privacy') . ' · ' . aim_discovery_link('about/', 'Contact') . '</p></footer>';
}
function aim_discovery_value(array $b, string $scenario, string $metric, string $quarter)
{
    $h = $b['release']['headline'] ?? [];
    $i = array_search($quarter, $h['horizons'] ?? [], true);
    $v = $i !== false ? ($h['scenarios'][$scenario][$metric][$i] ?? null) : null;
    if ($v === null) {
        $s = $b['series'][$scenario] ?? [];
        $i = array_search($quarter, $s['quarters'] ?? [], true);
        $v = $i !== false ? ($s['metrics'][$metric][$i] ?? null) : null;
    }
    return (is_int($v) || is_float($v)) && is_finite((float)$v) ? $v : null;
}
function aim_discovery_horizons(array $b): array
{
    return array_values(array_filter($b['release']['headline']['horizons'] ?? [], fn($q) => is_string($q) && preg_match('/^Q[1-4] \d{4}$/', $q)));
}
function aim_discovery_summary(array $b): string
{
    $r = $b['release']; $rows = '';
    foreach ($b['scenarios'] as $s) {
        $rows .= '<tr><th scope="row">' . aim_discovery_link(aim_discovery_scenario_path($s['key']), (string)$s['name']) . '</th>';
        foreach (['K','R','G'] as $k) $rows .= '<td>' . aim_h(aim_fmt($k, aim_discovery_value($b, $s['key'], $k, 'Q4 2030'))) . '</td>';
        $rows .= '</tr>';
    }
    return '<section id="published-summary" aria-labelledby="published-summary-title"><h2 id="published-summary-title">Latest published findings</h2><p>' . aim_h((string)($r['summary'] ?? '')) . '</p><p>' . aim_h(aim_discovery_citation($r)) . ' · published <time datetime="' . aim_h(aim_discovery_date($r)) . '">' . aim_h((string)($r['publishedAt'] ?? '')) . '</time> · data as of ' . aim_h((string)($r['asOf'] ?? '')) . '. These Q4 2030 numbers are conditional scenario outputs, not forecasts.</p><details><summary>Compare all eight scenarios at Q4 2030</summary><div class="discovery-table" tabindex="0" role="region" aria-label="Published scenario values for Q4 2030"><table><caption>Eight scenarios at Q4 2030</caption><thead><tr><th scope="col">Scenario</th><th scope="col">Big-4 capex, annual</th><th scope="col">AI revenue, annual</th><th scope="col">Open-weight lag</th></tr></thead><tbody>' . $rows . '</tbody></table></div></details><p>' . aim_discovery_link('releases/' . $r['id'] . '/', 'Read this release and its sources') . ' · ' . aim_discovery_link('methodology/', 'How the model works') . ' · ' . aim_discovery_link('measures/', 'All measures') . ' · ' . aim_discovery_link('faq/', 'Questions & answers') . '</p></section>';
}
function aim_discovery_scenario_body(array $b, array $s, array $methods): string
{
    $r = $b['release']; $key = $s['key'];
    $lead = 'In ' . $s['name'] . ', Big-4 capex is ' . aim_fmt('K', aim_discovery_value($b,$key,'K','Q4 2030')) . ' a year and AI revenue is ' . aim_fmt('R', aim_discovery_value($b,$key,'R','Q4 2030')) . ' a year in Q4 2030 (' . aim_discovery_citation($r) . '). These are conditional model outputs, not predictions.';
    $html = '<p>' . aim_h($lead) . '</p><h2>Scenario thesis</h2><p>' . aim_h((string)($s['thesis'] ?? '')) . '</p><h2>Driver assumptions</h2><p>' . aim_h((string)($methods['scenarios'][$key]['tilts'] ?? 'See the scenario driver paths in the interactive dashboard.')) . '</p><p>' . aim_discovery_link('?s=' . rawurlencode($key), 'Explore this scenario and its driver paths') . '</p>';
    $rows = ''; $horizons = aim_discovery_horizons($b);
    foreach ($b['metrics'] as $k => $m) {
        $rows .= '<tr><th scope="row">' . aim_discovery_link(aim_discovery_measure_path($k), (string)$m['name']) . ' <small>(' . aim_h((string)($m['unit'] ?? '')) . ')</small></th>';
        foreach ($horizons as $q) $rows .= '<td>' . aim_h(aim_fmt($k, aim_discovery_value($b,$key,$k,$q))) . '</td>';
        $rows .= '</tr>';
    }
    $html .= '<h2>Published values</h2>' . aim_discovery_table('Values from the published release; units are shown with each measure.', array_merge(['Measure'], $horizons), $rows);
    $signs = '';
    foreach ($r['signposts'] ?? [] as $p) $signs .= '<li>' . aim_h((string)($p['name'] ?? '')) . ': ' . aim_h((string)($p['first'][$key] ?? 'not reached by 2035')) . '</li>';
    $html .= '<h2>First signs in the model</h2><p>These thresholds and first-crossing dates come directly from the release. “Today” means the model’s starting quarter, Q4 2026. They are scenario signposts, not observed future events.</p><ul>' . $signs . '</ul>';
    $html .= '<h2>Who gains and loses in Q4 2030</h2><p>Illustrative impact scores run from −100 to +100, relative to Q4 2026. They are model indices, not expected investment returns.</p>';
    foreach (['gains'=>'Largest relative gains', 'losses'=>'Largest relative losses'] as $kind=>$label) {
        $items = '';
        foreach ($r['impacts2030'][$key][$kind] ?? [] as $item) {
            $score = $item['score'] ?? null;
            if (!(is_int($score) || is_float($score)) || !is_finite((float)$score)) continue;
            $items .= '<li>' . aim_h((string)($item['name'] ?? '')) . ': ' . aim_h((string)$score) . '</li>';
        }
        $html .= '<h3>' . $label . '</h3><ul>' . $items . '</ul>';
    }
    return $html . '<h2>Sources and reproducibility</h2><p>The source, status, quote, review date and derivation for each starting value are in ' . aim_discovery_link('data/releases/' . $r['id'] . '/dataset.json', 'the archived dataset') . '. Definitions, history sources and formulas are on each measure page. Download ' . aim_discovery_link('data/releases/' . $r['id'] . '/series/' . $key . '.csv', 'this scenario as CSV') . '.</p>';
}
function aim_discovery_table(string $caption, array $headers, string $rows): string
{
    return '<div class="discovery-table" tabindex="0" role="region" aria-label="' . aim_h($caption) . '"><table><caption>' . aim_h($caption) . '</caption><thead><tr>' . implode('', array_map(fn($h) => '<th scope="col">' . aim_h((string)$h) . '</th>', $headers)) . '</tr></thead><tbody>' . $rows . '</tbody></table></div>';
}
function aim_discovery_source(array $a): string
{
    $name = (string)($a['src'] ?? $a['title'] ?? 'Source');
    $link = aim_url_ok((string)($a['url'] ?? '')) ? '<a href="' . aim_h($a['url']) . '" rel="noopener">' . aim_h($name) . '</a>' : aim_h($name);
    $text = '<p>' . $link;
    foreach (['publisher'=>'Publisher', 'date'=>'Source date', 'period'=>'Period', 'status'=>'Status', 'reviewed'=>'Reviewed', 'retrieved'=>'Retrieved', 'covers'=>'Covers'] as $key=>$label) if (isset($a[$key]) && is_scalar($a[$key]) && (string)$a[$key] !== '') $text .= ' · ' . $label . ': ' . aim_h((string)$a[$key]);
    $text .= '</p>';
    if (!empty($a['quote'])) $text .= '<blockquote>' . aim_h((string)$a['quote']) . '</blockquote>';
    foreach (['calc'=>'Derivation', 'note'=>'Source note'] as $key=>$label) if (!empty($a[$key])) $text .= '<p>' . $label . ': ' . aim_h((string)$a[$key]) . '</p>';
    $via = aim_via_text($a);
    if ($via !== '') $text .= '<p>Provenance: ' . aim_h($via) . '</p>';
    foreach ($a['refs'] ?? [] as $ref) if (is_array($ref) && aim_url_ok((string)($ref['url'] ?? ''))) $text .= '<p>Further source: <a href="' . aim_h($ref['url']) . '" rel="noopener">' . aim_h((string)($ref['title'] ?? $ref['url'])) . '</a></p>';
    return $text;
}
function aim_discovery_measure_body(array $b, string $key, array $m, array $methods): string
{
    $definition = $methods['metrics'][$key] ?? [];
    $r = $b['release']; $horizons = aim_discovery_horizons($b);
    $html = '<p>' . aim_h((string)($definition['definition'] ?? $m['name'])) . '</p><p>Unit: ' . aim_h((string)($m['unit'] ?? '')) . '. Values below are from ' . aim_h(aim_discovery_citation($r)) . '.</p>';
    $rows = '';
    foreach ($b['scenarios'] as $s) {
        $rows .= '<tr><th scope="row">' . aim_discovery_link(aim_discovery_scenario_path($s['key']), (string)$s['name']) . '</th>';
        foreach ($horizons as $q) $rows .= '<td>' . aim_h(aim_fmt($key, aim_discovery_value($b,$s['key'],$key,$q))) . '</td>';
        $rows .= '</tr>';
    }
    $html .= '<h2>Values by scenario</h2>' . aim_discovery_table('Q4 2026 is the starting point; later quarters are conditional scenario outputs.', array_merge(['Scenario'], $horizons), $rows);
    $html .= '<h2>Starting values and their provenance</h2>';
    $found = false;
    foreach ($b['dataset']['anchors'] ?? [] as $id=>$a) if (is_array($a) && ($a['metric'] ?? '') === $key) {
        $found = true;
        $html .= '<h3>' . aim_h((string)($a['name'] ?? $id)) . '</h3><p>Published value: ' . aim_h(aim_fmt($key, $a['value'] ?? null)) . ' · anchor ' . aim_h((string)$id) . '</p>' . aim_discovery_source($a);
    }
    if (!$found) $html .= '<p>This measure is derived by the engine rather than set by a single starting-value anchor. Its inputs and formula are listed below.</p>';
    $history = $definition['history'] ?? [];
    $html .= '<h2>History and source notes</h2>';
    foreach (['method'=>'How history is constructed', 'checked'=>'Checks', 'gaps'=>'Known gaps', 'note'=>'Notes'] as $k=>$label) if (!empty($history[$k])) $html .= '<p><strong>' . $label . ':</strong> ' . aim_h((string)$history[$k]) . '</p>';
    // The first scenario shares the published historical path. No interpolation is performed here.
    $series = $b['series'][$b['scenarios'][0]['key'] ?? ''] ?? []; $historyRows = '';
    foreach ($series['quarters'] ?? [] as $i=>$quarter) {
        $v = $series['metrics'][$key][$i] ?? null;
        if ((is_int($v) || is_float($v)) && is_finite((float)$v)) $historyRows .= '<tr><th scope="row">' . aim_h((string)$quarter) . '</th><td>' . aim_h(aim_fmt($key,$v)) . '</td></tr>';
        if ($quarter === ($series['history_until'] ?? 'Q4 2026')) break;
    }
    if ($historyRows !== '') $html .= aim_discovery_table('Published historical path, including interpolated or estimated quarters described above.', ['Quarter','Value'], $historyRows);
    foreach ($history['sources'] ?? [] as $source) if (is_array($source)) $html .= aim_discovery_source($source);
    $model = $definition['model'] ?? [];
    $html .= '<h2>Formula and assumptions</h2><p>' . aim_h((string)($model['explanation'] ?? 'See the engine source for this measure.')) . '</p>';
    foreach ($model['formula'] ?? [] as $formula) $html .= '<p><code>' . aim_h((string)$formula) . '</code></p>';
    foreach (['drivers'=>'Drivers', 'inputs'=>'Model inputs'] as $k=>$label) if (!empty($model[$k])) $html .= '<p>' . $label . ': ' . aim_h(implode(', ', $model[$k])) . '.</p>';
    if (!empty($definition['caveats'])) $html .= '<h2>Limits and caveats</h2><ul>' . implode('', array_map(fn($s) => '<li>' . aim_h((string)$s) . '</li>', $definition['caveats'])) . '</ul>';
    return $html . '<p>Formulas are explanatory text from ' . aim_discovery_link('assets/methods.json', 'the methods catalogue') . '; all calculations run in ' . aim_discovery_link('assets/engine.esm.js', 'the JavaScript engine') . '. ' . aim_discovery_link('data/releases/' . $r['id'] . '/series/all.csv', 'Download the exact released values') . '.</p>';
}
function aim_discovery_faq(): array
{
    $site = aim_settings()['site'];
    return [
        ['What is AI Forecast Atlas?', 'AI Forecast Atlas is a scenario model of how AI may become a commodity. It compares eight what-if paths for the AI economy, including capital spending, revenue, token prices, compute, power, market structure and work, through 2035.'],
        ['Is this a forecast or investment advice?', 'No. The paths are conditional scenarios, not predictions, probabilities or investment advice. Comparing assumptions and consequences is more useful than treating any one line as the future.'],
        ['What is the difference between history and a scenario?', 'History runs from Q1 2023 to Q4 2026 and includes reported values, estimates, published forecasts, assumptions and interpolated quarters. Each starting value has a status and source. Values after Q4 2026 are model outputs under the selected scenario.'],
        ['How often is the published data updated?', 'The scheduled weekly release is Friday at 13:00 Europe/Zurich time. Official sources and AI research are checked during the week. Approved values enter a built release; if no new build is ready, the release explicitly carries forward the previous scenario paths.'],
        ['Where do the numbers come from?', 'Starting values carry source links, status, period, derivation and review information in dataset.json. Official APIs, cited research and editor input are reviewed before publication. Each measure page explains history sources and formulas.'],
        ['How are AI research answers checked?', 'A panel of AI agents answers independently. The weighted median selects one real answer and its own source. Answers based on model knowledge are downweighted by default, clearly labelled and reviewed by a person before publication. Agreement is not proof that an answer is correct.'],
        ['What does AI knowledge mean?', 'It means an AI model supplied information from its training or observations without a citable supporting page. The model, date and explanation are retained, and a person approves it. Such information may be outdated or wrong.'],
        ['What does the Bubble Burst scenario mean?', 'Bubble Burst explores a collapse in investor appetite and a pause in adoption, with financing stress and excess chip supply. It is a conditional stress case, not a prediction that an AI bubble will burst. Its published page lists assumptions, values and signposts.'],
        ['What do the impact scores mean?', 'Impact scores are illustrative model indices from −100 to +100, relative to Q4 2026, derived from changes in modelled measures and driver assumptions. They are not probabilities, valuations or expected investment returns.'],
        ['How can I reproduce or download a result?', 'Each release has JSON and CSV files, its starting-value dataset, a measure dictionary, scenario series and the engine version. The browser and release builder use the same JavaScript engine. Archive URLs preserve the release used in a citation.'],
        ['How should I cite or reuse the data?', 'Credit “AI Forecast Atlas by Creoox AG”, name the release identifier and link to the release page. Published data is licensed under CC BY 4.0. The code, model and design are licensed under Business Source License 1.1; read LICENSE for its terms.'],
        ['Who operates the site and how can I contact them?', (string)$site['company'] . ' operates the site. Registered address: ' . str_replace("\n", ', ', (string)($site['address'] ?? 'see imprint')) . '. Team: ' . (string)($site['team_location'] ?? 'see About') . '. Contact: ' . (string)($site['email'] ?? 'see imprint') . '.'],
        ['How do I subscribe or unsubscribe?', 'Use Subscribe on the dashboard. Confirm the subscription using the link sent to your email address. Every newsletter includes unsubscribe and preference links. The privacy page describes how subscriber data is handled.'],
        ['Does the assistant cost visitors anything?', 'The site does not charge visitors for the assistant. The operator pays provider costs and sets usage and budget limits, so access may be temporarily limited. Do not enter sensitive personal information.'],
        ['Do posts on X change the model?', 'No. X watch is a separately labelled collection of editor-approved signals. Those posts do not set starting values or change the scenario calculations.'],
    ];
}
function aim_discovery_about(): string
{
    $s = aim_settings()['site'];
    $html = '<p>AI Forecast Atlas is a weekly updated scenario model by ' . aim_h((string)$s['company']) . '. It explores eight possible paths for the AI economy through 2035. It is a scenario model, not a forecast.</p><h2>Operator and team</h2><p>Registered company: ' . aim_h((string)$s['company']) . '. Registered address: ' . nl2br(aim_h((string)$s['address'])) . '.</p>';
    if (!empty($s['team_location'])) $html .= '<p>Team location: ' . aim_h((string)$s['team_location']) . '.</p>';
    $html .= '<h2>Contact</h2>';
    if (filter_var($s['email'] ?? '', FILTER_VALIDATE_EMAIL)) $html .= '<p>Email: <a href="mailto:' . aim_h($s['email']) . '">' . aim_h($s['email']) . '</a>.</p>';
    if (!empty($s['phone'])) $html .= '<p>Phone: ' . aim_h((string)$s['phone']) . '.</p>';
    foreach (['company_url'=>'Company website', 'xeokit_url'=>'xeokit', 'repo_url'=>'Source code and licence information'] as $key=>$label) if (aim_url_ok((string)($s[$key] ?? ''))) $html .= '<p>' . $label . ': <a href="' . aim_h($s[$key]) . '">' . aim_h($s[$key]) . '</a>.</p>';
    return $html . '<h2>Editorial responsibility</h2><p>New starting values and X watch items pass through editorial review. The model publishes its assumptions, source records and limitations so readers can inspect them. A human editor is responsible for publication; an AI research answer alone does not publish anything.</p><h2>Reuse and citation</h2><p>Published data is CC BY 4.0. Name the release you used and link to its archive. Code, model and design are under Business Source License 1.1. ' . aim_discovery_link('LICENSE', 'Read the licence') . '.</p><p>' . aim_discovery_link('imprint.php', 'Full company imprint') . ' · ' . aim_discovery_link('privacy.php', 'Privacy and subscriber data') . ' · ' . aim_discovery_link('#subscribe', 'Newsletter on the dashboard') . '</p>';
}
function aim_discovery_methodology(array $methods): string
{
    $html = '<p>AI Forecast Atlas connects sourced starting values with explicit driver assumptions in a quarterly system-dynamics model. Eight scenarios explore different combinations through 2035. All calculations run in one JavaScript engine; these pages display the released results.</p><h2>Publication and review</h2><p>' . aim_h((string)($methods['process']['summary'] ?? 'Only reviewed values reach a published release.')) . '</p>';
    foreach ($methods['process']['steps'] ?? [] as $s) $html .= '<h3>' . aim_h((string)($s['title'] ?? '')) . '</h3><p>' . aim_h((string)($s['text'] ?? '')) . '</p>';
    $html .= '<h2>Reading the equations</h2><ul>' . implode('', array_map(fn($s) => '<li>' . aim_h((string)$s) . '</li>', $methods['conventions'] ?? [])) . '</ul><h2>Evidence labels</h2>';
    foreach ($methods['badges'] ?? [] as $badge) $html .= '<h3>' . aim_h((string)($badge['label'] ?? '')) . '</h3><p>' . aim_h((string)($badge['meaning'] ?? '')) . '</p>';
    return $html . '<h2>Limitations</h2><p>The model has judgement-based parameters, simplified relationships and incomplete historical observations. Some history is interpolated; some starting values are estimates or assumptions. Source disagreement and model sensitivity remain even after review. The scenarios have no assigned probabilities.</p><h2>Reproducibility</h2><p>' . aim_discovery_link('measures/', 'Definitions, formulas and source notes for every measure') . ' · ' . aim_discovery_link('data/releases/index.json', 'Released datasets') . ' · ' . aim_discovery_link('assets/engine.esm.js', 'JavaScript engine') . ' · ' . aim_discovery_link('openapi.json', 'OpenAPI description') . '.</p>';
}
/** Plain text includes destinations, so answer engines retain source provenance. */
function aim_discovery_text(string $html): string
{
    $html = preg_replace('#<(script|style)\b[^>]*>.*?</\1>#is', '', $html);
    $html = preg_replace_callback('#<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>#is', fn($m) => strip_tags($m[2]) . ' (' . $m[1] . ')', $html);
    $html = preg_replace('#</(?:p|h[1-6]|li|tr|section|div|blockquote|nav|footer)>#i', "\n", $html);
    $html = preg_replace('#</(?:td|th)>#i', ' | ', $html);
    return trim(preg_replace('/[ \t]+/', ' ', html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'))) . "\n";
}
function aim_discovery_write_page(string $path, string $title, string $description, string $body, array $r, string $type = 'WebPage', array $extra = []): void
{
    $html = aim_discovery_page($title, $description, $path, $body, $r, $type, $extra);
    aim_write(aim_public($path . 'index.html'), $html);
    aim_write(aim_public($path . 'index.txt'), aim_discovery_text($html));
}
function aim_discovery_write_release(array $r, ?array $files = null): void
{
    $id = (string)($r['id'] ?? ''); if (!aim_valid_release_id($id) || !in_array($id, aim_discovery_published_ids(), true)) return;
    $files = $files ?? array_keys(aim_read_tree(aim_public('data/releases/' . $id)));
    $html = aim_release_page($r, $files);
    // Keep the established data URL useful, with a canonical pointing to the readable release URL.
    aim_write(aim_public('data/releases/' . $id . '/index.html'), $html);
    aim_write(aim_public('releases/' . $id . '/index.html'), $html);
    aim_write(aim_public('releases/' . $id . '/index.txt'), aim_discovery_text($html));
}
function aim_discovery_current(array $b): void
{
    $r = $b['release']; $methods = aim_discovery_methods();
    $file = aim_public('index.html'); $home = is_file($file) ? (string)file_get_contents($file) : '';
    if ($home !== '') {
        $home = preg_replace_callback('/<!-- AIM:SUMMARY:START -->.*?<!-- AIM:SUMMARY:END -->/s', fn() => '<!-- AIM:SUMMARY:START -->' . aim_discovery_summary($b) . '<!-- AIM:SUMMARY:END -->', $home);
        $home = preg_replace_callback('/<!-- AIM:METADATA:START -->.*?<!-- AIM:METADATA:END -->/s', fn() => '<!-- AIM:METADATA:START -->' . aim_discovery_jsonld(aim_discovery_schema($r)) . '<!-- AIM:METADATA:END -->', $home);
        aim_write($file, $home);
    }
    $scenarios = '';
    foreach ($b['scenarios'] as $s) {
        $path = aim_discovery_scenario_path($s['key']);
        aim_discovery_write_page($path, (string)$s['name'] . ' — AI economy scenario', (string)($s['thesis'] ?? ''), aim_discovery_scenario_body($b,$s,$methods), $r);
        $scenarios .= '<li>' . aim_discovery_link($path,(string)$s['name']) . ': ' . aim_h((string)($s['thesis'] ?? '')) . '</li>';
    }
    aim_discovery_write_page('scenarios/', 'Eight AI economy scenarios to 2035', 'Compare eight published what-if paths for the AI economy, with assumptions, source links and model outputs.', '<p>Each scenario starts from the same released dataset and changes the driver assumptions. These are conditional paths, not probabilities.</p><ul>' . $scenarios . '</ul>', $r);
    $measures = '';
    foreach ($b['metrics'] as $key=>$m) {
        $path = aim_discovery_measure_path($key);
        aim_discovery_write_page($path, (string)$m['name'], (string)($methods['metrics'][$key]['definition'] ?? $m['name']), aim_discovery_measure_body($b,$key,$m,$methods), $r);
        $measures .= '<li>' . aim_discovery_link($path,(string)$m['name']) . ' (' . aim_h((string)($m['unit'] ?? '')) . ')</li>';
    }
    aim_discovery_write_page('measures/', 'AI economy measures, definitions and sources', 'Definitions, history sources, formulas and scenario values for every published AI Forecast Atlas measure.', '<p>Each measure links released numbers to its source evidence and model assumptions.</p><ul>' . $measures . '</ul>', $r);
    aim_discovery_write_page('about/', 'About AI Forecast Atlas and Creoox AG', 'Who operates AI Forecast Atlas, how to contact the team, editorial responsibility, licences and citation.', aim_discovery_about(), $r);
    $faqBody = ''; $questions = [];
    foreach (aim_discovery_faq() as [$q,$a]) { $faqBody .= '<h2>' . aim_h($q) . '</h2><p>' . aim_h($a) . '</p>'; $questions[] = ['@type'=>'Question','name'=>$q,'acceptedAnswer'=>['@type'=>'Answer','text'=>$a]]; }
    aim_discovery_write_page('faq/', 'Questions about AI Forecast Atlas', 'Answers about scenarios, sources, AI research, releases, impact scores, licences, contact and the newsletter.', $faqBody, $r, 'FAQPage', ['mainEntity'=>$questions]);
    aim_discovery_write_page('methodology/', 'How AI Forecast Atlas works', 'The scenario model, source review, publication process, equations, evidence labels and limitations.', aim_discovery_methodology($methods), $r);
}
function aim_discovery_indexes(array $b): void
{
    $r = $b['release']; $items = '';
    foreach (array_reverse(aim_discovery_published_ids()) as $id) {
        if (!is_file(aim_public('releases/' . $id . '/index.html'))) continue;
        $rel = aim_read_json(aim_public('data/releases/' . $id . '/release.json'), []);
        $items .= '<li>' . aim_discovery_link('releases/' . $id . '/', $id) . ' · ' . aim_h((string)($rel['publishedAt'] ?? '')) . '<p>' . aim_h((string)($rel['summary'] ?? '')) . '</p></li>';
    }
    aim_discovery_write_page('releases/', 'Published weekly releases', 'Archived AI Forecast Atlas releases with changes, sources, downloadable data and citations.', '<p>These releases have already been published. Rebuilding a page does not approve new data or change the archived JSON and CSV files.</p><ul>' . $items . '</ul>', $r);
    aim_write_sitemap(); aim_discovery_llms($b);
}
function aim_discovery_llms(array $b): void
{
    $r = $b['release']; $base = aim_site_url(); $site = aim_settings()['site'];
    $text = "# AI Forecast Atlas\n\n> Eight conditional scenarios for the AI economy to 2035, by Creoox AG. A scenario model, not a forecast or investment advice. Published data: CC BY 4.0.\n\n## Latest published findings\n" . (string)($r['summary'] ?? '') . "\nPublished: " . (string)($r['publishedAt'] ?? '') . '; data as of ' . (string)($r['asOf'] ?? '') . '; engine ' . (string)($r['engine'] ?? '') . ".\n\n## How to cite\n" . aim_discovery_citation($r) . '. ' . $base . 'releases/' . $r['id'] . "/\n\n## About and contact\nOperator: " . (string)$site['company'] . '. Registered address: ' . str_replace("\n", ', ', (string)$site['address']) . '. Team: ' . (string)($site['team_location'] ?? '') . '. Contact: ' . (string)$site['email'] . ".\n";
    foreach (['about/'=>'About & contact','methodology/'=>'Methodology','faq/'=>'Questions and answers','measures/'=>'Measure definitions, history sources and formulas','releases/'=>'Release archive','imprint.php'=>'Imprint','privacy.php'=>'Privacy','llms-full.txt'=>'Full text of generated pages'] as $path=>$label) $text .= '- [' . $label . '](' . $base . $path . ")\n";
    $text .= "\n## Eight scenarios\n";
    foreach ($b['scenarios'] as $s) $text .= '- [' . $s['name'] . '](' . $base . aim_discovery_scenario_path($s['key']) . '): ' . ($s['thesis'] ?? '') . "\n";
    $text .= "\n## Data and APIs\n";
    foreach (['data/latest/release.json'=>'Latest approved release with headline values and signposts','data/latest/dataset.json'=>'Starting values with source, status, quote, derivation and review date','data/latest/series/all.csv'=>'All scenario paths as CSV','data/latest/metrics.json'=>'Measure dictionary','data/latest/scenarios.json'=>'Scenarios and drivers','assets/methods.json'=>'Full methods catalogue','data/releases/index.json'=>'Machine-readable release archive','data/xwatch.json'=>'Approved X watch signals, not model inputs','api/mcp.php'=>'Read-only MCP server','openapi.json'=>'OpenAPI description','feeds/releases.xml'=>'Release RSS feed','assets/engine.esm.js'=>'JavaScript engine'] as $path=>$label) $text .= '- [' . $label . '](' . $base . $path . ")\n";
    aim_write(aim_public('llms.txt'), $text);
    $paths = ['', 'scenarios/', 'measures/', 'about/', 'faq/', 'methodology/', 'releases/'];
    foreach ($b['scenarios'] as $s) $paths[] = aim_discovery_scenario_path($s['key']);
    foreach ($b['metrics'] as $key=>$m) $paths[] = aim_discovery_measure_path($key);
    foreach (aim_discovery_published_ids() as $id) $paths[] = 'releases/' . $id . '/';
    // Stream the full corpus instead of retaining an ever-growing archive in PHP memory.
    $target = aim_public('llms-full.txt'); $tmp = $target . '.tmp' . bin2hex(random_bytes(4));
    $out = fopen($tmp, 'wb'); if (!$out) throw new RuntimeException('Cannot write the public text index.');
    try {
        fwrite($out, $text . "\n# Full page text\n");
        foreach ($paths as $path) {
            if ($path === '') { fwrite($out, "\n## " . $base . "\n" . aim_discovery_text(aim_discovery_summary($b))); continue; }
            $file = aim_public($path . 'index.txt');
            if (!is_file($file)) continue;
            fwrite($out, "\n## " . $base . $path . "\n");
            $in = fopen($file, 'rb'); if ($in) { stream_copy_to_stream($in,$out); fclose($in); }
        }
    } finally { fclose($out); }
    if (!rename($tmp,$target)) { @unlink($tmp); throw new RuntimeException('Cannot replace the public text index.'); }
}
/** Caller holds the existing publish lock. Normal publication only regenerates the new release. */
function aim_discovery_on_publish(array $r): void
{
    $b = aim_discovery_latest(); if (!$b) return;
    aim_discovery_write_release($r); aim_discovery_current($b); aim_discovery_indexes($b);
}
/** Resumable maintenance: derived files only, never data JSON/CSV, settings, queues or approval state. */
function aim_discovery_refresh(?string $after = null, int $limit = 20): array
{
    if ($after !== null && $after !== '' && !aim_valid_release_id($after)) return ['ok'=>false,'error'=>'Invalid release cursor.'];
    return aim_with_lock('publish', function () use ($after,$limit) {
        $start = microtime(true); $b = aim_discovery_latest();
        if (!$b) return ['ok'=>false,'error'=>'No indexed published release is available.'];
        $ids = array_values(array_filter(aim_discovery_published_ids(), fn($id) => $after === null || $after === '' || strcmp($id,$after) > 0));
        $processed = []; $next = null; $limit = max(1,min(30,$limit));
        aim_discovery_current($b);
        foreach ($ids as $id) {
            if (count($processed) >= $limit || microtime(true) - $start > 25) break;
            $r = aim_read_json(aim_public('data/releases/' . $id . '/release.json'), []);
            if (!is_array($r) || ($r['id'] ?? '') !== $id) return ['ok'=>false,'error'=>'Published archive is incomplete: ' . $id, 'processed'=>count($processed)];
            aim_discovery_write_release($r); $processed[] = $id; $next = $id;
        }
        $complete = count($processed) === count($ids);
        aim_discovery_indexes($b);
        return ['ok'=>true,'release'=>$b['release']['id'],'processed'=>count($processed),'ids'=>$processed,'next'=>$complete ? null : ($next ?? $after),'complete'=>$complete];
    }, false) ?? ['ok'=>false,'error'=>'A publication or rebuild is running. Retry shortly.'];
}
/** Browser mutation endpoint: compare effective ports, including explicitly configured :80/:443. */
function aim_discovery_origin_ok(): bool
{
    $origin = parse_url((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    $site = parse_url(aim_site_url());
    if (!is_array($origin) || !is_array($site) || empty($origin['host']) || isset($origin['user']) || isset($origin['pass']) || isset($origin['path']) || isset($origin['query']) || isset($origin['fragment'])) return false;
    $scheme = strtolower((string)($origin['scheme'] ?? ''));
    if (!in_array($scheme, ['http','https'], true)) return false;
    $siteScheme = strtolower((string)($site['scheme'] ?? ''));
    return $scheme === $siteScheme && strtolower($origin['host']) === strtolower((string)($site['host'] ?? ''))
        && ($origin['port'] ?? ($scheme === 'https' ? 443 : 80)) === ($site['port'] ?? ($siteScheme === 'https' ? 443 : 80));
}
