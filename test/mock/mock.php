<?php
/* Mock of the external services AI Forecast Atlas talks to (OpenAI, Anthropic, Google Gemini, xAI, DeepSeek, Mailjet,
   OpenRouter, EIA, SEC, Epoch, Turnstile), for local tests:  php -S 127.0.0.1:8090 test/mock/mock.php
   Every request is appended to $LOG (JSON lines). */
$LOG = getenv('MOCK_LOG') ?: sys_get_temp_dir() . '/aim-mock.jsonl';
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$q = $_GET;
$body = file_get_contents('php://input');
$json = json_decode($body, true);
file_put_contents($LOG, json_encode(['t' => microtime(true), 'm' => $_SERVER['REQUEST_METHOD'], 'u' => $_SERVER['REQUEST_URI'], 'h' => ['auth' => $_SERVER['HTTP_AUTHORIZATION'] ?? '', 'xkey' => $_SERVER['HTTP_X_API_KEY'] ?? '', 'ua' => $_SERVER['HTTP_USER_AGENT'] ?? ''], 'b' => $json ?? $body]) . "\n", FILE_APPEND | LOCK_EX);
function out($data, int $code = 200) { http_response_code($code); header('Content-Type: application/json'); echo json_encode($data); exit; }
function sse(array $events) { header('Content-Type: text/event-stream'); foreach ($events as [$ev, $d]) { echo "event: $ev\ndata: " . json_encode($d) . "\n\n"; @ob_flush(); flush(); usleep(60000); } exit; }
$research = function (string $text) {
    $map = [
        'OpenAI + Anthropic' => ['found' => true, 'value' => 1.95, 'display' => '$1.95T', 'period' => 'Rounds of Oct 2026', 'published' => '2026-10-20', 'source_title' => 'Example News', 'publisher' => 'Example Media', 'source_url' => 'https://example.com/valuations', 'quote' => 'OpenAI valued at $1.0T and Anthropic at $950B', 'method' => '1.0 + 0.95', 'components' => ['OpenAI $1.0T (20 Oct 2026)', 'Anthropic $0.95T (May 2026)'], 'supporting' => [['title' => 'Second outlet', 'url' => 'https://example.org/second'], ['title' => 'bad link', 'url' => 'javascript:alert(1)']], 'confidence' => 'medium'],
        'AI revenue' => ['found' => true, 'value' => 275, 'display' => '$275B a year', 'period' => 'Q4 2026 run-rate', 'basis' => 'knowledge', 'knowledge_note' => 'From training data and public statements to Sep 2026: OpenAI, Anthropic and the big clouds together run at roughly $275B a year.', 'as_of' => '2026-09-30', 'source_title' => '', 'source_url' => '', 'quote' => '', 'method' => 'Sum of the main vendors\' run-rates.', 'confidence' => 'medium'],
        'Nvidia' => ['found' => true, 'value' => 5.42, 'display' => '$5.42T', 'period' => 'Close, 21 Oct 2026', 'published' => '2026-10-21', 'source_title' => 'Example Markets', 'source_url' => 'https://example.com/nvda', 'quote' => 'market cap 5.42T', 'method' => '', 'confidence' => 'high'],
    ];
    foreach ($map as $k => $v) if (strpos($text, $k) !== false) return $v;
    return ['found' => false, 'reason' => 'nothing newer'];
};
// ---------- injected faults: MOCK_LOG.faults.json = [{"match": "<part of the path>", "status": 503, "times": 1}] ----------
$faultFile = $LOG . '.faults.json';
if (is_file($faultFile)) {
    $faults = json_decode((string)file_get_contents($faultFile), true) ?: [];
    foreach ($faults as $i => $f) {
        if (($f['times'] ?? 0) < 1 || strpos($uri, (string)$f['match']) === false) continue;
        $faults[$i]['times']--; file_put_contents($faultFile, json_encode($faults));
        if (!empty($f['stall'])) {   // "200" and part of the body, then silence: the client times out mid-body
            header('Content-Type: application/json'); header('Content-Length: 4000');
            echo '{"custom_id":'; flush(); sleep((int)$f['stall']); exit;
        }
        out(['error' => ['type' => 'overloaded_error', 'message' => 'injected fault ' . $f['status']]], (int)$f['status']);
    }
}
// ---------- OpenAI Responses: background mode (create, poll, cancel) ----------
$bgDir = sys_get_temp_dir() . '/aim-mock-bg';
$researchResponse = function (array $r, string $id, string $status = 'completed') {
    return ['id' => $id, 'object' => 'response', 'status' => $status, 'output' => [
        ['type' => 'web_search_call', 'status' => 'completed', 'action' => ['type' => 'search', 'sources' => [['type' => 'url', 'url' => 'https://example.net/search-hit']]]],
        ['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($r), 'annotations' => isset($r['source_url']) ? [['type' => 'url_citation', 'url' => $r['source_url'], 'title' => $r['source_title']]] : []]]]],
        'usage' => ['input_tokens' => 3000, 'output_tokens' => 200]];
};
if (preg_match('#/openai/v1/responses/([\w-]+)/cancel$#', $uri, $m)) { @unlink($bgDir . '/' . $m[1] . '.json'); out(['id' => $m[1], 'status' => 'cancelled']); }
if (preg_match('#/openai/v1/responses/([\w-]+)$#', $uri, $m)) {
    $f = $bgDir . '/' . $m[1] . '.json';
    if (!is_file($f)) out(['error' => ['message' => 'No response found']], 404);
    $st = json_decode(file_get_contents($f), true);
    $st['polls']++;
    file_put_contents($f, json_encode($st));
    if ($st['polls'] < 2) out(['id' => $m[1], 'status' => 'in_progress', 'output' => []]);   // the first check finds it still running
    out($researchResponse($st['answer'], $m[1]));
}
// ---------- OpenAI Responses ----------
if (preg_match('#/openai/v1/responses$#', $uri)) {
    if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer sk-test') out(['error' => ['message' => 'Incorrect API key provided']], 401);
    $input = json_encode($json['input'] ?? []);
    if (!empty($json['tools'])) {
        $r = $research($input);
        if (!empty($json['background'])) {
            @mkdir($bgDir, 0777, true);
            $id = 'resp_bg_' . substr(md5($input . microtime()), 0, 10);
            file_put_contents($bgDir . '/' . $id . '.json', json_encode(['answer' => $r, 'polls' => 0]));
            out(['id' => $id, 'object' => 'response', 'status' => 'queued', 'output' => []]);
        }
        out($researchResponse($r, 'resp_1'));
    }
    if (strpos((string)($json['instructions'] ?? ''), 'opening paragraph of the AI Forecast Atlas newsletter') !== false) {
        $lang = strpos($json['instructions'], 'German') !== false ? 'de' : 'en';
        $t = $lang === 'de' ? 'Diese Woche wurden zwei Startwerte aktualisiert: der Spitzenpreis sank von $10 auf $8.60 pro Million Token.' : 'This week two starting values changed: the frontier price fell from $10 to $8.60 per million tokens, and power prices rose to 115.';
        out(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => $t]]]], 'usage' => ['input_tokens' => 800, 'output_tokens' => 60]]);
    }
    $answer = "Under **The Great Commoditization**, Big-4 capex peaks and then falls.\n\n- Token prices keep dropping\n- Watch the credit-stress index";
    if (!empty($json['stream'])) {
        $ev = [['response.created', ['type' => 'response.created']]];
        foreach (str_split($answer, 12) as $c) $ev[] = ['response.output_text.delta', ['type' => 'response.output_text.delta', 'delta' => $c]];
        $ev[] = ['response.completed', ['type' => 'response.completed', 'response' => ['usage' => ['input_tokens' => 2400, 'output_tokens' => 120], 'output' => []]]];
        sse($ev);
    }
    out(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => $answer]]]], 'usage' => ['input_tokens' => 2400, 'output_tokens' => 120]]);
}
// ---------- the other research agents: answers keyed by the question ----------
$panel = function (string $agent, string $text) {
    $nv = ['anthropic' => ['found' => true, 'value' => 5.40, 'display' => '$5.40T', 'period' => 'Close, 21 Oct 2026', 'published' => '2026-10-21', 'source_title' => 'Example Finance', 'publisher' => 'Example Finance', 'source_url' => 'https://example.com/nvda2', 'quote' => 'Nvidia closed at a 5.40T market value', 'basis' => 'source', 'confidence' => 'high'],
        'gemini' => ['found' => true, 'value' => 5.60, 'display' => '$5.60T', 'period' => 'Intraday, 21 Oct 2026', 'published' => '2026-10-21', 'source_title' => 'Example Org markets', 'publisher' => 'example.org', 'source_url' => 'https://example.org/nvda-gemini', 'quote' => 'market value of about $5.6 trillion', 'basis' => 'source', 'confidence' => 'medium'],
        'xai' => ['found' => true, 'value' => 5.45, 'display' => '$5.45T', 'period' => 'Close, 21 Oct 2026', 'published' => '2026-10-21', 'source_title' => 'Example X Markets', 'source_url' => 'https://example.com/nvda-x', 'quote' => 'NVDA market cap 5.45T', 'basis' => 'source', 'confidence' => 'medium'],
        'deepseek' => ['found' => true, 'value' => 5.30, 'display' => '$5.30T', 'period' => 'Summer 2026', 'basis' => 'knowledge', 'knowledge_note' => 'From training data to July 2026: Nvidia traded around $5.3 trillion.', 'as_of' => '2026-07-31', 'source_url' => '', 'confidence' => 'low']];
    $val = ['anthropic' => ['found' => true, 'value' => 1.90, 'display' => '$1.90T', 'period' => 'Rounds to Oct 2026', 'published' => '2026-10-20', 'source_title' => 'Example Venture', 'source_url' => 'https://example.com/anthropic-valuations', 'quote' => 'combined 1.9T', 'basis' => 'source', 'confidence' => 'medium'],
        'xai' => ['found' => true, 'value' => 2.0, 'display' => '$2.0T', 'period' => 'Rounds to Oct 2026', 'published' => '2026-10-20', 'source_title' => 'Example Deals', 'source_url' => 'https://example.com/xai-val', 'quote' => 'about $2 trillion together', 'basis' => 'source', 'confidence' => 'low']];
    $rev = ['deepseek' => ['found' => true, 'value' => 260, 'display' => '$260B a year', 'period' => 'mid-2026', 'basis' => 'knowledge', 'knowledge_note' => 'From training data: the main vendors ran at about $260B a year in mid-2026.', 'as_of' => '2026-06-30', 'source_url' => '', 'confidence' => 'low']];
    if (strpos($text, 'Nvidia') !== false && isset($nv[$agent])) return $nv[$agent];
    if (strpos($text, 'OpenAI + Anthropic') !== false && isset($val[$agent])) return $val[$agent];
    if (strpos($text, 'AI revenue') !== false && isset($rev[$agent])) return $rev[$agent];
    return ['found' => false, 'reason' => 'nothing newer'];
};
// ---------- Anthropic: messages and message batches ----------
$claudeMsg = function (array $req) use ($panel) {
    $r = !empty($req['tools']) ? $panel('anthropic', json_encode($req['messages'] ?? [])) : null;
    if ($r === null) return ['type' => 'message', 'role' => 'assistant', 'content' => [['type' => 'text', 'text' => 'OK']], 'stop_reason' => 'end_turn', 'usage' => ['input_tokens' => 30, 'output_tokens' => 2]];
    $hits = [['type' => 'web_search_result', 'url' => 'https://example.net/claude-hit', 'title' => 'Claude search hit', 'encrypted_content' => 'x']];
    if (!empty($r['source_url'])) array_unshift($hits, ['type' => 'web_search_result', 'url' => $r['source_url'], 'title' => $r['source_title'] ?? '', 'encrypted_content' => 'x']);
    return ['type' => 'message', 'role' => 'assistant', 'stop_reason' => 'end_turn', 'content' => [
        ['type' => 'server_tool_use', 'id' => 'srvtoolu_1', 'name' => 'web_search', 'input' => ['query' => 'q']],
        ['type' => 'web_search_tool_result', 'tool_use_id' => 'srvtoolu_1', 'content' => $hits],
        ['type' => 'text', 'text' => json_encode($r), 'citations' => !empty($r['source_url']) ? [['type' => 'web_search_result_location', 'url' => $r['source_url'], 'title' => $r['source_title'] ?? '', 'cited_text' => 'x']] : []]],
        'usage' => ['input_tokens' => 900, 'output_tokens' => 40, 'server_tool_use' => ['web_search_requests' => 1]]];
};
if (strpos($uri, '/anthropic/') === 0 && ($_SERVER['HTTP_X_API_KEY'] ?? '') !== 'ak-test') out(['type' => 'error', 'error' => ['type' => 'authentication_error', 'message' => 'invalid x-api-key']], 401);
if (preg_match('#/anthropic/v1/messages/batches/(msgbatch_\w+)/cancel$#', $uri, $m)) { @unlink($bgDir . '/' . $m[1] . '.json'); out(['id' => $m[1], 'processing_status' => 'canceling']); }
if (preg_match('#/anthropic/v1/messages/batches/(msgbatch_\w+)/results$#', $uri, $m)) {
    $st = json_decode((string)@file_get_contents($bgDir . '/' . $m[1] . '.json'), true);
    if (!$st) out(['error' => ['message' => 'not found']], 404);
    header('Content-Type: application/binary');
    foreach ($st['requests'] as $rq) echo json_encode(['custom_id' => $rq['custom_id'], 'result' => ['type' => 'succeeded', 'message' => $claudeMsg($rq['params'])]]), "\n";
    exit;
}
if (preg_match('#/anthropic/v1/messages/batches/(msgbatch_\w+)$#', $uri, $m)) {
    $f = $bgDir . '/' . $m[1] . '.json';
    $st = json_decode((string)@file_get_contents($f), true);
    if (!$st) out(['error' => ['message' => 'not found']], 404);
    $st['polls']++; file_put_contents($f, json_encode($st));
    if ($st['polls'] < 2) out(['id' => $m[1], 'type' => 'message_batch', 'processing_status' => 'in_progress']);
    out(['id' => $m[1], 'type' => 'message_batch', 'processing_status' => 'ended', 'results_url' => 'http://' . $_SERVER['HTTP_HOST'] . '/anthropic/v1/messages/batches/' . $m[1] . '/results']);
}
if (preg_match('#/anthropic/v1/messages/batches$#', $uri)) {
    @mkdir($bgDir, 0777, true);
    $id = 'msgbatch_' . substr(md5(json_encode($json) . microtime()), 0, 10);
    file_put_contents($bgDir . '/' . $id . '.json', json_encode(['requests' => $json['requests'] ?? [], 'polls' => 0]));
    out(['id' => $id, 'type' => 'message_batch', 'processing_status' => 'in_progress']);
}
if (preg_match('#/anthropic/v1/messages$#', $uri)) out($claudeMsg($json ?? []));
// ---------- Google Gemini (search grounding returns redirect links titled with the domain) ----------
if (preg_match('#/gemini/v1beta/models/([\w.-]+):generateContent$#', $uri)) {
    if (($_SERVER['HTTP_X_GOOG_API_KEY'] ?? '') !== 'gk-test') out(['error' => ['code' => 400, 'message' => 'API key not valid']], 400);
    if (empty($json['tools'])) out(['candidates' => [['content' => ['parts' => [['text' => 'OK']]]]], 'usageMetadata' => ['promptTokenCount' => 20, 'candidatesTokenCount' => 2]]);
    $r = $panel('gemini', json_encode($json['contents'] ?? []));
    out(['candidates' => [['content' => ['parts' => [['text' => "```json\n" . json_encode($r) . "\n```"]]], 'groundingMetadata' => ['webSearchQueries' => ['nvidia market cap'],
        'groundingChunks' => [['web' => ['uri' => 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123', 'title' => 'example.org']], ['web' => ['uri' => 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/DeF456', 'title' => 'example.net']]]]]],
        'usageMetadata' => ['promptTokenCount' => 1200, 'candidatesTokenCount' => 150]]);
}
// ---------- xAI: research with web search, X watch with x_search ----------
if (preg_match('#/xai/v1/responses$#', $uri)) {
    if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer xk-test') out(['error' => 'Incorrect API key'], 401);
    $types = array_column($json['tools'] ?? [], 'type');
    if (!$types) out(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => 'OK', 'annotations' => []]]]], 'usage' => ['input_tokens' => 20, 'output_tokens' => 2]]);
    if (in_array('x_search', $types, true)) {
        $items = ['items' => [
            ['title' => 'Microsoft says AI capex will keep rising in 2027', 'summary' => 'Microsoft’s CFO said on 18 Oct that capital spending on AI data centres will grow faster in fiscal 2027 than in 2026.', 'why' => 'Big-4 capex is a key input of every scenario.', 'topics' => ['markets', 'compute', 'bogus'], 'anchors' => ['AN1', 'AN999'], 'direction' => 'up',
                'posts' => [['url' => 'https://x.com/Microsoft/status/1850000000000000001', 'handle' => 'Microsoft', 'name' => 'Microsoft', 'kind' => 'official', 'posted' => '2026-10-18']],
                'corroboration' => [['title' => 'Example Wire: Microsoft capex', 'url' => 'https://example.com/wire-msft'], ['title' => 'bad', 'url' => 'javascript:alert(1)']],
                'credibility' => 'high', 'credibility_note' => 'Official company account quoting the CFO', 'impact' => 'high', 'impact_note' => 'Widely reposted'],
            ['title' => 'Rumour: a large AI lab is raising at a $2T valuation', 'summary' => 'An influencer claims a new round at $2 trillion.', 'why' => 'Would move the valuation anchor.', 'topics' => ['markets'], 'direction' => 'up',
                'posts' => [['url' => 'https://twitter.com/someinfluencer/status/1850000000000000002?s=20', 'handle' => 'someinfluencer', 'kind' => 'influencer', 'posted' => '2026-10-18']],
                'corroboration' => [], 'credibility' => 'unverified', 'credibility_note' => 'No other source', 'impact' => 'high', 'impact_note' => 'Very high engagement'],
            ['title' => 'Not a post', 'summary' => 'x', 'posts' => [['url' => 'https://example.com/not-a-post']], 'credibility' => 'high', 'impact' => 'low'],
        ]];
        out(['id' => 'resp_x', 'status' => 'completed', 'output' => [['type' => 'custom_tool_call', 'name' => 'x_search', 'call_id' => 'xs_1'], ['type' => 'web_search_call', 'status' => 'completed'],
            ['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($items), 'annotations' => [['type' => 'url_citation', 'url' => 'https://x.com/Microsoft/status/1850000000000000001', 'title' => '1'], ['type' => 'url_citation', 'url' => 'https://example.com/wire-msft', 'title' => '2']]]]]],
            'usage' => ['input_tokens' => 5000, 'output_tokens' => 700, 'num_server_side_tools_used' => 3, 'server_side_tool_usage_details' => ['x_search_calls' => 2, 'web_search_calls' => 1, 'x_posts_fetched' => 40, 'x_users_fetched' => 5], 'cost_in_usd_ticks' => 3000000000]]);
    }
    $r = $panel('xai', json_encode($json['input'] ?? []));
    out(['id' => 'resp_xr', 'status' => 'completed', 'output' => [['type' => 'web_search_call', 'status' => 'completed'],
        ['type' => 'message', 'content' => [['type' => 'output_text', 'text' => json_encode($r), 'annotations' => !empty($r['source_url']) ? [['type' => 'url_citation', 'url' => $r['source_url'], 'title' => '1']] : []]]]],
        'usage' => ['input_tokens' => 2000, 'output_tokens' => 300, 'cost_in_usd_ticks' => 120000000]]);
}
// ---------- DeepSeek: no web search, answers from knowledge ----------
if (preg_match('#/deepseek/chat/completions$#', $uri)) {
    if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer dk-test') out(['error' => ['message' => 'Authentication Fails']], 401);
    $all = json_encode($json['messages'] ?? []);
    $txt = strpos($all, 'no web access') !== false ? json_encode($panel('deepseek', $all)) : 'OK';
    out(['choices' => [['message' => ['role' => 'assistant', 'content' => $txt]]], 'usage' => ['prompt_tokens' => 800, 'completion_tokens' => 120]]);
}
// ---------- Turnstile ----------
if (preg_match('#/cf/turnstile/v0/siteverify$#', $uri)) out(['success' => ($_POST['response'] ?? '') === 'XXXX.DUMMY.TOKEN.XXXX']);
// ---------- Mailjet ----------
$mjAuth = ($_SERVER['PHP_AUTH_USER'] ?? '') === 'mjpub' && ($_SERVER['PHP_AUTH_PW'] ?? '') === 'mjpriv';
if (strpos($uri, '/mj/') === 0 && !$mjAuth) out(['ErrorMessage' => 'Unauthorized'], 401);
if ($uri === '/mj/v3.1/send') {
    $res = [];
    foreach ($json['Messages'] ?? [] as $m) $res[] = strpos($m['To'][0]['Email'], 'bounce') !== false ? ['Status' => 'error', 'Errors' => [['ErrorMessage' => 'bad address']]] : ['Status' => 'success', 'To' => [['Email' => $m['To'][0]['Email'], 'MessageID' => rand()]]];
    out(['Messages' => $res]);
}
if ($uri === '/mj/v3/REST/contactmetadata') { if ($_SERVER['REQUEST_METHOD'] === 'GET') out(['Count' => 1, 'Total' => 1, 'Data' => [['Name' => 'aim_lang', 'Datatype' => 'str']]]); out(['Data' => [$json]], 201); }
if (preg_match('#^/mj/v3/REST/contactslist/(\d+)$#', $uri)) out(['Data' => [['ID' => 77, 'Name' => 'AI Forecast Atlas']]]);
if (preg_match('#^/mj/v3/REST/contactslist/(\d+)/managecontact$#', $uri)) out(['Data' => [['ContactID' => 9]]], 201);
if ($uri === '/mj/v3/REST/sender') out(['Data' => [['Email' => $q['Email'] ?? '', 'Status' => 'Active']]]);
$people = [
    1 => ['e' => 'anna@example.com', 'p' => ['aim_lang' => 'de', 'aim_freq' => 'weekly', 'aim_cats' => 'summary,markets,aeco,signals']],
    2 => ['e' => 'bob@example.com', 'p' => ['aim_lang' => 'en', 'aim_freq' => 'weekly', 'aim_cats' => 'summary,models,dev,method']],
    3 => ['e' => 'claire@example.com', 'p' => ['aim_lang' => 'fr', 'aim_freq' => 'monthly', 'aim_cats' => 'summary']],
    4 => ['e' => 'gone@example.com', 'p' => ['aim_lang' => 'en', 'aim_freq' => 'weekly', 'aim_cats' => 'summary'], 'unsub' => true],
    5 => ['e' => 'piotr@example.com', 'p' => ['aim_lang' => 'pl', 'aim_freq' => 'weekly', 'aim_cats' => 'summary,compute,aecosw']],
    6 => ['e' => 'bounce@example.com', 'p' => ['aim_lang' => 'en', 'aim_freq' => 'weekly', 'aim_cats' => 'summary']],
    7 => ['e' => 'late@example.com', 'p' => ['aim_lang' => 'en', 'aim_freq' => 'weekly', 'aim_cats' => 'summary']],
];
if (preg_match('#^/mj/v3/REST/contact/([^/]+)$#', $uri, $m)) { $em = urldecode($m[1]); foreach ($people as $id => $p) if ($p['e'] === $em) out(['Data' => [['ID' => $id, 'Name' => '', 'Email' => $em]]]); out(['Data' => [['ID' => 99, 'Name' => '', 'Email' => $em]]]); }
if (preg_match('#^/mj/v3/REST/contactdata/(\d+)$#', $uri, $m)) { $p = $people[(int)$m[1]]['p'] ?? ['aim_lang' => 'en', 'aim_freq' => 'weekly', 'aim_cats' => 'summary,markets']; out(['Data' => [['ContactID' => (int)$m[1], 'Data' => array_map(fn($k, $v) => ['Name' => $k, 'Value' => $v], array_keys($p), $p)]]]); }
if ($uri === '/mj/v3/REST/listrecipient') { $off = (int)($q['Offset'] ?? 0); $d = $off ? [] : array_map(fn($id, $p) => ['ContactID' => $id, 'IsUnsubscribed' => !empty($p['unsub'])], array_keys($people), $people); out(['Count' => count($d), 'Total' => count($people), 'Data' => $d]); }
if ($uri === '/mj/v3/REST/contact') { $off = (int)($q['Offset'] ?? 0); $d = $off ? [] : array_map(fn($id, $p) => ['ID' => $id, 'Email' => $p['e'], 'Name' => ''], array_keys($people), $people); out(['Count' => count($d), 'Data' => $d]); }
if ($uri === '/mj/v3/REST/contactdata') { $off = (int)($q['Offset'] ?? 0); $d = $off ? [] : array_map(fn($id, $p) => ['ContactID' => $id, 'Data' => array_map(fn($k, $v) => ['Name' => $k, 'Value' => $v], array_keys($p['p']), $p['p'])], array_keys($people), $people); out(['Count' => count($d), 'Data' => $d]); }
// ---------- OpenRouter ----------
if ($uri === '/or/api/v1/models') {
    $mk = fn($id, $in, $o, $c) => ['id' => $id, 'name' => $id, 'created' => $c, 'pricing' => ['prompt' => sprintf('%.10f', $in / 1e6), 'completion' => sprintf('%.10f', $o / 1e6)]];
    out(['data' => [$mk('openai/gpt-6-astra', 10, 50, 1758000000), $mk('anthropic/claude-opus-5.5', 4, 20, 1757000000), $mk('google/gemini-4-argon', 2, 10, 1759000000), $mk('openai/gpt-6-luna', 0.10, 0.50, 1758500000), $mk('anthropic/claude-haiku-5.5', 0.10, 0.50, 1758400000), $mk('google/gemini-3.1-flash-lite', 0.25, 1.50, 1756000000), $mk('meta/free-model', 0, 0, 1)]]);
}
// ---------- EIA ----------
if (strpos($uri, '/eia/v2/electricity/retail-sales/data') === 0) {
    $rows = []; $d = new DateTime('2026-08-01');
    for ($i = 0; $i < 36; $i++) { $rows[] = ['period' => $d->format('Y-m'), 'stateid' => 'US', 'sectorid' => 'COM', 'price' => (string)round(14.8 - $i * 0.06 + (($i % 12) < 3 ? 0.4 : 0), 2)]; $d->modify('-1 month'); }
    out(['response' => ['total' => 36, 'data' => $rows]]);
}
// ---------- SEC EDGAR ----------
if (preg_match('#^/sec/api/xbrl/companyconcept/CIK(\d+)/us-gaap/(\w+)\.json$#', $uri, $m)) {
    if (strpos($_SERVER['HTTP_USER_AGENT'] ?? '', '@') === false) out(['message' => 'missing user agent'], 403);
    $cik = $m[1]; $tag = $m[2];
    if ($cik === '0001018724' && $tag === 'PaymentsToAcquirePropertyPlantAndEquipment') { http_response_code(404); exit; }
    $scale = ['0000789019' => 1.0, '0001652044' => 0.9, '0001018724' => 1.1, '0001326801' => 0.7][$cik] ?? 1;
    $lease = $tag === 'FinanceLeasePrincipalPayments';
    $q1 = ($lease ? 0.8 : 38) * $scale * 1e9; $q2 = ($lease ? 0.9 : 42) * $scale * 1e9; $q3 = ($lease ? 1.0 : 47) * $scale * 1e9;
    $facts = [
        ['start' => '2026-01-01', 'end' => '2026-03-31', 'val' => $q1, 'form' => '10-Q', 'filed' => '2026-04-29', 'fp' => 'Q1'],
        ['start' => '2026-01-01', 'end' => '2026-06-30', 'val' => $q1 + $q2, 'form' => '10-Q', 'filed' => '2026-07-29', 'fp' => 'Q2'],
        ['start' => '2026-01-01', 'end' => '2026-09-30', 'val' => $q1 + $q2 + $q3, 'form' => '10-Q', 'filed' => '2026-10-28', 'fp' => 'Q3'],
        ['start' => '2025-10-01', 'end' => '2026-09-30', 'val' => 4 * $q3, 'form' => '10-Q', 'filed' => '2026-10-28', 'fp' => 'Q3'],
    ];
    out(['cik' => (int)$cik, 'taxonomy' => 'us-gaap', 'tag' => $tag, 'units' => ['USD' => $facts]]);
}
// ---------- Epoch ----------
if ($uri === '/epoch/data/eci_scores.csv') {
    header('Content-Type: text/csv');
    echo "Model,Display name,eci,eci_ci_low,eci_ci_high,date,Organization,Country (of organization),Model accessibility,Accessibility group,model_versions\n";
    $rows = [];
    for ($i = 0; $i < 30; $i++) {
        $t = strtotime('2025-01-01 +' . ($i * 20) . ' days');
        $rows[] = ['closed-' . $i, 'Closed "Model" ' . $i, 120 + $i * 1.5, date('Y-m-d', $t), 'API access', 'Closed'];
        $rows[] = ['open-' . $i, 'Open, Model ' . $i, 120 + ($i - 3) * 1.5, date('Y-m-d', $t + 4 * 30 * 86400), 'Open weights (unrestricted)', 'Open'];
    }
    $fh = fopen('php://output', 'w');
    foreach ($rows as $r) fputcsv($fh, [$r[0], $r[1], $r[2], $r[2] - 3, $r[2] + 3, $r[3], 'Org', 'US', $r[4], $r[5], '']);
    exit;
}
out(['error' => 'mock: no route for ' . $uri], 404);
