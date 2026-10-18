<?php
/* AI Forecast Atlas — review queue and working dataset. Collectors add candidates; the admin approves, edits or rejects
   them; approved values update the working dataset, which the next release is built from.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_published_dataset(): array
{
    $d = aim_read_json(aim_public('data/latest/dataset.json'), null);
    return is_array($d) ? $d : ['schema' => 'aimonitor.dataset/1', 'anchors' => []];
}
function aim_working_dataset(): array
{
    $w = aim_store_read('dataset/working');
    if (is_array($w) && !empty($w['anchors'])) return $w;
    $w = aim_published_dataset();
    aim_store_write('dataset/working', $w);
    return $w;
}
function aim_working_save(array $w): void { aim_store_write('dataset/working', $w); }
function aim_candidates(): array { return aim_store_read('candidates/open', []) ?: []; }
/** Add new candidates; a newer candidate for the same anchor and source replaces an older pending one. */
function aim_candidates_add(array $list): int
{
    if (!$list) return 0;
    $added = 0; $ids = [];
    aim_store_update('candidates/open', function ($open) use ($list, &$added) {
        $open = is_array($open) ? $open : [];
        foreach ($list as $c) {
            foreach ($open as $i => $o) if ($o['anchor'] === $c['anchor'] && $o['source'] === $c['source']) { aim_candidate_archive($o, 'superseded'); unset($open[$i]); }
            $c['id'] = aim_now()->format('Ymd-His') . '-' . substr(aim_rand(3), 0, 6);
            $c['created'] = aim_iso();
            $c['status'] = 'pending';
            $open[] = $c;
            $added++;
            if (in_array($c['source'], ['openrouter', 'eia', 'epoch'], true) && ($c['kind'] ?? '') === 'value' && empty($c['flags'])) $ids[] = $c['id'];
        }
        return array_values($open);
    }, []);
    if ($ids && !empty(aim_settings()['sources']['auto_approve_api'])) foreach ($ids as $id) aim_candidate_decide($id, 'approve');
    return $added;
}
function aim_candidate_archive(array $c, string $status): void
{
    $c['status'] = $status; $c['decided'] = aim_iso();
    aim_store_append('candidates/decided-' . aim_now()->format('Y-m'), $c);
}
/** Clean a list of references to [{title, url, publisher?, date?}] with http(s) links only. */
function aim_clean_refs($refs, int $max = 6): array
{
    $out = [];
    foreach (is_array($refs) ? $refs : [] as $x) {
        if (!is_array($x)) continue;
        $u = aim_str($x['url'] ?? '', 500);
        if (!aim_url_ok($u)) continue;
        $r = ['title' => aim_line($x['title'] ?? '', 160) ?: (parse_url($u, PHP_URL_HOST) ?: $u), 'url' => $u];
        foreach (['publisher' => 80, 'date' => 20] as $f => $n) if (!empty($x[$f])) $r[$f] = aim_line($x[$f], $n);
        $out[] = $r;
        if (count($out) >= $max) break;
    }
    return $out;
}
/** Clean a "via" record: how a value entered the data. */
function aim_clean_via($v): array
{
    $v = is_array($v) ? $v : [];
    $type = in_array($v['type'] ?? '', ['desk', 'api', 'ai', 'ai-knowledge', 'manual', 'assumption', 'model'], true) ? $v['type'] : 'manual';
    $o = ['type' => $type, 'name' => aim_line($v['name'] ?? '', 160)];
    if (!empty($v['model'])) $o['model'] = aim_line($v['model'], 80);
    if (is_array($v['check'] ?? null)) {
        $c = $v['check'];
        $o['check'] = array_filter(['agree' => !empty($c['agree']), 'by' => aim_line($c['by'] ?? '', 80), 'url' => aim_url_ok((string)($c['url'] ?? '')) ? (string)$c['url'] : '', 'note' => aim_str($c['note'] ?? '', 200)], fn($x) => $x !== '');
    }
    if (!empty($v['edited'])) $o['edited'] = aim_line($v['edited'], 160);
    if (is_array($v['panel'] ?? null)) $o['panel'] = aim_clean_panel($v['panel']);
    return $o;
}
/** Clean the public record of a research panel (who answered what, with which source). */
function aim_clean_panel(array $p): array
{
    $num = fn($x) => is_numeric($x) ? (float)$x : null;
    $o = ['rule' => 'weighted median', 'asked' => max(0, min(20, (int)($p['asked'] ?? 0))), 'answered' => max(0, min(20, (int)($p['answered'] ?? 0)))];
    foreach (['agree', 'tol', 'lo', 'hi'] as $k) if ($num($p[$k] ?? null) !== null) $o[$k] = $num($p[$k]);
    $o['members'] = [];
    foreach (array_slice(is_array($p['members'] ?? null) ? $p['members'] : [], 0, 10) as $m) {
        if (!is_array($m)) continue;
        $x = ['agent' => aim_line($m['agent'] ?? '', 40), 'model' => aim_line($m['model'] ?? '', 60), 'w' => max(0, min(10, (int)($m['w'] ?? 0))), 'basis' => ($m['basis'] ?? '') === 'knowledge' ? 'knowledge' : 'source',
            'v' => aim_line($m['v'] ?? '', 120), 'value' => $num($m['value'] ?? null)];
        if (!empty($m['url']) && aim_url_ok((string)$m['url'])) { $x['url'] = aim_str($m['url'], 500); if (!empty($m['title'])) $x['title'] = aim_line($m['title'], 120); }
        if (!empty($m['note'])) $x['note'] = aim_str($m['note'], 300);
        if (!empty($m['none'])) $x['none'] = aim_line($m['none'], 160);
        if (array_key_exists('agrees', $m)) $x['agrees'] = (bool)$m['agrees'];
        if (!empty($m['lead'])) $x['lead'] = true;
        $o['members'][] = $x;
    }
    return $o;
}
/**
 * Decide on a candidate. $action: approve | reject. $edit can override value and text fields (value, v, status, period, src, url, calc, quote).
 * An approved value must have a source link; it replaces the anchor's value together with its provenance (source, link, quote,
 * further references, how it was obtained, when it was retrieved and reviewed), so nothing from the old source lingers.
 */
function aim_candidate_decide(string $id, string $action, array $edit = []): array
{
    $result = ['ok' => false, 'error' => 'not found'];
    aim_store_update('candidates/open', function ($open) use ($id, $action, $edit, &$result) {
        foreach ($open as $i => $c) {
            if ($c['id'] !== $id) continue;
            if ($action === 'approve') {
                // research panel: the reviewer may publish another agent's answer instead of the lead's
                $use = is_string($edit['use'] ?? null) ? $edit['use'] : '';
                $chosen = '';
                if ($use !== '' && $use !== ($c['panel']['lead'] ?? '') && !empty($c['panel']['answers'][$use]['found'])) {
                    $t = aim_research_target((string)$c['anchor']);
                    $c['proposed'] = aim_panel_proposal((string)($c['metric'] ?? ''), (string)($t['kind'] ?? 'value'), $c['panel']['answers'][$use]);
                    $c['panel']['lead'] = $use;
                    $chosen = aim_provider_label($use);
                }
                $p = $c['proposed'] ?? [];
                foreach ($edit as $f => $v) {
                    if ($f === 'value') { if ($v !== null && $v !== '') $p['value'] = $v; }
                    elseif (in_array($f, ['v', 'period', 'src', 'url', 'calc', 'quote', 'status'], true)) $p[$f] = is_scalar($v) ? (string)$v : '';
                    elseif ($f === 'basis') $p['basis'] = $v;
                }
                if (!isset($p['value']) || !is_numeric($p['value'])) { $result = ['ok' => false, 'error' => 'Enter a value before approving.']; return $open; }
                // basis: a source link, or AI knowledge (an AI model's own knowledge or observation, labelled as such)
                $viaIn = is_array($p['via'] ?? null) ? $p['via'] : [];
                $knowledge = ($edit['basis'] ?? '') === 'ai-knowledge' || (($edit['basis'] ?? '') !== 'source' && ($viaIn['type'] ?? '') === 'ai-knowledge');
                $url = trim((string)($p['url'] ?? ''));
                if ($url !== '' && !aim_url_ok($url)) { $result = ['ok' => false, 'error' => 'The source link must start with https:// or http://.']; return $open; }
                if ($url !== '' && strtolower((string)parse_url($url, PHP_URL_HOST)) === 'vertexaisearch.cloud.google.com') { $result = ['ok' => false, 'error' => 'This is a Google redirect link, which stops working after a while. Open it and enter the address of the page itself.']; return $open; }
                if ($knowledge) {
                    if (trim((string)($p['quote'] ?? '')) === '' && trim((string)($p['calc'] ?? '')) === '') { $result = ['ok' => false, 'error' => 'For AI knowledge, keep the model’s explanation (what it knows and from when) before approving.']; return $open; }
                    $model = aim_line($viaIn['model'] ?? (($c['ai']['provider'] ?? '') !== '' ? aim_provider_label((string)$c['ai']['provider']) . ' ' . ($c['ai']['model'] ?? '') : 'AI model'), 80);
                    $p['via'] = ['type' => 'ai-knowledge', 'name' => 'AI model knowledge (no specific source)', 'model' => $model] + (isset($viaIn['check']) ? ['check' => $viaIn['check']] : []);
                    $p['status'] = 'ai-knowledge';
                    if (trim((string)($p['src'] ?? '')) === '' || ($edit['basis'] ?? '') === 'ai-knowledge' && ($viaIn['type'] ?? '') !== 'ai-knowledge') $p['src'] = 'AI model knowledge: ' . $model . ' (' . aim_now()->format('j M Y') . ')';
                } else {
                    if (!aim_url_ok($url)) { $result = ['ok' => false, 'error' => 'Add the source link (https://…) of this value before approving, or approve it as AI knowledge.']; return $open; }
                    if (trim((string)($p['src'] ?? '')) === '') { $result = ['ok' => false, 'error' => 'Name the source (publisher and title) before approving.']; return $open; }
                    if (($viaIn['type'] ?? '') === 'ai-knowledge') { $p['via'] = ['type' => 'ai', 'name' => 'AI-assisted web research', 'model' => (string)($viaIn['model'] ?? '')]; if (($p['status'] ?? '') === 'ai-knowledge') $p['status'] = 'estimate'; }
                }
                $w = aim_working_dataset();
                $aid = $c['anchor'];
                if (!isset($w['anchors'][$aid])) { $result = ['ok' => false, 'error' => 'Unknown anchor.']; return $open; }
                $old = $w['anchors'][$aid];
                $new = $old;
                $new['value'] = (float)$p['value'];
                $new['v'] = aim_line($p['v'] ?? '', 200) !== '' ? aim_line($p['v'], 200) : aim_anchor_text((string)$old['metric'], (float)$p['value']);
                foreach (['status' => 40, 'period' => 120] as $f => $n) if (isset($p[$f]) && $p[$f] !== '') $new[$f] = aim_line($p[$f], $n);
                $new['src'] = aim_line($p['src'], 300);
                $new['url'] = $url;   // empty for AI knowledge without a link
                // empty values are written explicitly: the engine keeps its own base text for a field that is absent,
                // and the old value's derivation, quote and references must not appear next to the new value
                foreach (['calc' => 1200, 'quote' => 300] as $f => $n) $new[$f] = aim_str($p[$f] ?? '', $n);
                $new['refs'] = aim_clean_refs($p['refs'] ?? []);
                $via = aim_clean_via($p['via'] ?? ['type' => 'manual', 'name' => 'Entered by the AI Forecast Atlas team']);
                if (!empty($c['panel']['answers'])) {   // the panel record, with agreement measured against the value as approved
                    $pp = aim_panel_public($c['panel']['answers'], (string)($c['panel']['lead'] ?? ''), (float)$p['value'], (string)$old['metric'], (int)($c['panel']['asked'] ?? count($c['panel']['answers'])), aim_panel_scale(aim_research_target((string)$aid)));
                    $via['panel'] = aim_clean_panel($pp);
                    $via['name'] = 'AI research panel (' . $pp['answered'] . ' of ' . $pp['asked'] . ' agent' . ($pp['asked'] > 1 ? 's' : '') . ' answered)';
                    unset($via['check']);
                }
                $editedFields = [];
                foreach (['value', 'v', 'url', 'src', 'quote', 'basis'] as $f) {
                    if (!isset($edit[$f]) || $edit[$f] === '' || $edit[$f] === null) continue;
                    $was = $f === 'basis' ? ((($c['proposed']['via']['type'] ?? '') === 'ai-knowledge') ? 'ai-knowledge' : 'source') : ($c['proposed'][$f] ?? null);
                    $same = $f === 'value' ? is_numeric($was) && abs((float)$edit[$f] - (float)$was) <= 1e-9 * max(1.0, abs((float)$was)) : trim((string)$edit[$f]) === trim((string)$was);
                    if (!$same) $editedFields[] = $f;
                }
                $notes = [];
                if ($chosen !== '') $notes[] = 'Reviewer chose the answer of ' . $chosen;
                if ($editedFields) $notes[] = 'Reviewer changed: ' . implode(', ', $editedFields);
                if ($notes) $via['edited'] = implode('; ', $notes);
                if (in_array('value', $editedFields, true) && !in_array('v', $editedFields, true)) $new['v'] = aim_anchor_text((string)$old['metric'], (float)$p['value']);   // display text follows an edited value
                $new['via'] = $via;
                $new['retrieved'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['retrieved'] ?? '')) ? (string)$p['retrieved'] : substr((string)($c['created'] ?? aim_iso()), 0, 10);
                $new['reviewed'] = aim_now()->format('Y-m-d');
                $new['prev'] = (string)($old['v'] ?? '');
                $new['was'] = '';
                $w['anchors'][$aid] = $new;
                $w['asOf'] = aim_now()->format('Y-m-d');
                aim_working_save($w);
                aim_log('review', 'approved', ['id' => $id, 'anchor' => $aid, 'from' => $old['value'] ?? null, 'to' => $new['value'], 'via' => $via['type']]);
            } else aim_log('review', 'rejected', ['id' => $id, 'anchor' => $c['anchor']]);
            aim_candidate_archive($c + ['edit' => $edit], $action === 'approve' ? 'approved' : 'rejected');
            unset($open[$i]);
            $result = ['ok' => true];
            return array_values($open);
        }
        return $open;
    }, []);
    return $result;
}
/** Manual edit of one anchor in the working dataset (admin page). A changed value needs a source link. */
function aim_working_edit(string $aid, array $fields): array
{
    $w = aim_working_dataset();
    if (!isset($w['anchors'][$aid])) return ['ok' => false, 'error' => 'Unknown anchor.'];
    $a = $w['anchors'][$aid];
    $before = $a;
    if (isset($fields['url']) && trim((string)$fields['url']) !== '' && !aim_url_ok(trim((string)$fields['url']))) return ['ok' => false, 'error' => 'The link must start with https:// or http://.'];
    if (isset($fields['value']) && (string)$fields['value'] !== '' && !is_numeric($fields['value'])) return ['ok' => false, 'error' => 'Value must be a number.'];
    $valueChanged = isset($fields['value']) && is_numeric($fields['value']) && abs((float)$fields['value'] - (float)($a['value'] ?? 0)) > 1e-9 * max(1.0, abs((float)($a['value'] ?? 0)));
    if ($valueChanged) {
        $url = trim((string)($fields['url'] ?? ($a['url'] ?? '')));
        if (!aim_url_ok($url) && !in_array($a['status'] ?? '', ['assumption', 'index'], true)) return ['ok' => false, 'error' => 'Add the source link (https://…) for the new value.'];
        $a['prev'] = (string)($a['v'] ?? '');
        $a['was'] = '';
        $a['value'] = (float)$fields['value'];
        // they belonged to the old value (written empty so the engine's base text does not show)
        $a['quote'] = ''; $a['refs'] = []; $a['calc'] = ''; $a['retrieved'] = '';
        if (isset($fields['calc']) && trim((string)$fields['calc']) === trim((string)($before['calc'] ?? ''))) unset($fields['calc']);   // the form re-sent the old derivation
    }
    foreach (['v' => 200, 'status' => 40, 'period' => 120, 'scope' => 300, 'src' => 300] as $f => $n) if (isset($fields[$f])) $a[$f] = aim_line($fields[$f], $n);
    foreach (['url' => 500, 'calc' => 1200, 'quote' => 300] as $f => $n) if (isset($fields[$f])) $a[$f] = aim_str($fields[$f], $n);
    if (isset($fields['refs'])) $a['refs'] = aim_clean_refs($fields['refs']);
    if ($a == $before) return ['ok' => true, 'unchanged' => true];
    if ($valueChanged) $a['via'] = ['type' => ($a['status'] ?? '') === 'assumption' ? 'assumption' : 'manual', 'name' => 'Entered by the AI Forecast Atlas team'];
    else { $a['via'] = aim_clean_via($a['via'] ?? ['type' => 'manual', 'name' => '']); $a['via']['edited'] = 'Texts edited by the AI Forecast Atlas team'; }
    $a['reviewed'] = aim_now()->format('Y-m-d');
    $w['anchors'][$aid] = $a;
    $w['asOf'] = aim_now()->format('Y-m-d');
    aim_working_save($w);
    aim_log('review', 'edited', ['anchor' => $aid]);
    return ['ok' => true];
}
function aim_working_reset(): void { aim_store_write('dataset/working', aim_published_dataset()); }
/** Differences between the working dataset and the published one (what the next release would change). */
function aim_working_diff(): array
{
    $p = aim_published_dataset()['anchors'] ?? []; $w = aim_working_dataset()['anchors'] ?? [];
    $out = [];
    foreach ($w as $id => $a) {
        $b = $p[$id] ?? [];
        if (($a['value'] ?? null) != ($b['value'] ?? null) || ($a['v'] ?? '') !== ($b['v'] ?? '') || ($a['src'] ?? '') !== ($b['src'] ?? '')) $out[] = ['id' => $id, 'name' => $a['name'] ?? $id, 'from' => $b['v'] ?? '', 'to' => $a['v'] ?? ''];
    }
    return $out;
}

/* ---------- the daily run, in small steps so each scheduler run stays short ----------
   Each step is marked as running before it starts. If the host stops the script in the middle, the next run sees the
   mark and retries the step a limited number of times (AI steps twice, others three times), so nothing repeats all
   day and every AI attempt has already been booked against the budget. At most one AI answer is awaited per run;
   agents with a background mode (OpenAI) are started first and collected on later runs.
   Research: one "ask" step per question and agent, then a "merge" step that combines the answers of all agents. */
const AIM_STEP_TRIES = 3;
const AIM_AI_TRIES = 2;
function aim_agent_background(array $agent): bool
{
    return in_array($agent['provider'], ['openai', 'anthropic'], true) && !empty(aim_settings()['ai']['background']);   // OpenAI background responses, Claude message batches
}
/** The day's steps. $agentIds: the research agents fixed when the day's run started (default: those ready now). */
function aim_collect_steps(?array $agentIds = null): array
{
    $steps = ['openrouter', 'eia', 'edgar', 'epoch'];
    $due = aim_research_due();
    $all = aim_agents();
    $agents = $agentIds === null ? aim_panel_agents() : array_values(array_filter(array_map(fn($id) => $all[$id] ?? null, $agentIds)));
    $bg = array_values(array_filter($agents, 'aim_agent_background'));
    $sync = array_values(array_filter($agents, fn($a) => !aim_agent_background($a)));
    foreach ($due as $t) foreach ($bg as $a) $steps[] = 'ask:' . $t['anchor'] . ':' . $a['id'];
    foreach ($due as $t) { foreach ($sync as $a) $steps[] = 'ask:' . $t['anchor'] . ':' . $a['id']; $steps[] = 'merge:' . $t['anchor']; }
    if (function_exists('aim_xwatch_due') && aim_xwatch_due()) $steps[] = 'xwatch';
    $steps[] = 'finish';
    return $steps;
}
/** Today's answers of the research agents: [anchor => [agent => answer]]. */
function aim_collect_answers(?string $aid = null): array
{
    $m = aim_store_read('collect/answers', []) ?: [];
    $all = ($m['date'] ?? '') === aim_now()->format('Y-m-d') && is_array($m['answers'] ?? null) ? $m['answers'] : [];
    return $aid === null ? $all : ($all[$aid] ?? []);
}
function aim_collect_answer_set(string $aid, string $agent, array $ans): void
{
    $today = aim_now()->format('Y-m-d');
    aim_store_update('collect/answers', function ($m) use ($aid, $agent, $ans, $today) {
        $m = is_array($m) && ($m['date'] ?? '') === $today ? $m : ['date' => $today, 'answers' => []];
        $m['answers'][$aid][$agent] = $ans;
        return $m;
    }, []);
}
/** Run the next steps of today's collection within $budget seconds. Returns progress info. */
function aim_collect_tick(float $budget, bool $force = false): array
{
    $r = aim_with_lock('collect', fn() => aim_collect_tick_locked($budget, $force), false);
    return $r ?? ['busy' => true];
}
function aim_collect_tick_locked(float $budget, bool $force): array
{
    $t0 = microtime(true);
    $left = fn() => $budget - (microtime(true) - $t0);
    $today = aim_now()->format('Y-m-d');
    $st = aim_state();
    $run = $st['collect'] ?? [];
    if (($run['date'] ?? '') !== $today || $force) {
        foreach (($run['jobs'] ?? []) as $job) { if ($left() < 20) break; aim_llm_bg_cancel($job); }   // best effort; unfinished jobs end on their own
        // the agents are fixed for the day, so switching one on or off later does not change the questions already asked
        $run = ['date' => $today, 'done' => [], 'log' => [], 'new' => 0, 'started' => aim_iso(), 'steps' => [], 'jobs' => [], 'pending' => [], 'agents' => array_column(aim_panel_agents(), 'id')];
        aim_store_write('collect/answers', ['date' => $today, 'answers' => []]);
    }
    foreach (['steps', 'jobs', 'pending'] as $k) $run[$k] = $run[$k] ?? [];
    if (!isset($run['agents'])) $run['agents'] = array_column(aim_panel_agents(), 'id');
    if (!is_array($run['nobg'] ?? [])) $run['nobg'] = ['openai' => true];   // 1.0 kept one switch for everything
    if (!empty($run['finished']) && !$force) return ['done' => true];
    $save = function () use (&$run) { aim_state_set(['collect' => $run]); };
    $obs = aim_store_read('observations', []) ?: [];
    $finish = function (string $step, array $r) use (&$run, &$obs, $save) {
        if (!empty($r['candidates'])) $run['new'] += aim_candidates_add($r['candidates']);
        foreach ($r['observations'] ?? [] as $o) { $obs = array_values(array_filter($obs, fn($x) => !(($x['metric'] ?? '') === $o['metric'] && ($x['source'] ?? '') === $o['source']))); $obs[] = $o; }
        $run['log'][] = ['step' => $step, 'ok' => !empty($r['ok']), 'note' => $r['error'] ?? ($r['skipped'] ?? ($r['note'] ?? '')), 'n' => count($r['candidates'] ?? [])];
        $run['done'][] = $step;
        $run['steps'][$step]['state'] = !empty($r['ok']) ? 'done' : 'failed';
        aim_store_write('observations', $obs);
        $save();
    };
    $begin = function (string $step) use (&$run, $save) {
        $run['steps'][$step] = ['state' => 'running', 'n' => (int)($run['steps'][$step]['n'] ?? 0) + 1, 'at' => aim_iso()];
        $save();
    };
    // an agent's answer to one question: kept for the merge step, and the agent's status for the admin page
    $answer = function (string $aid, array $agent, array $ans) {
        aim_collect_answer_set($aid, $agent['id'], $ans);
        aim_agent_status($agent['id'], $ans, 'research');
        return ['ok' => $ans['ok'], 'error' => $ans['ok'] ? null : $ans['error'], 'note' => !$ans['ok'] ? '' : (!empty($ans['found']) ? 'found ' . ($ans['display'] ?: 'a figure') . ($ans['basis'] === 'knowledge' ? ' (AI knowledge)' : '') : 'nothing newer')];
    };
    $aiUsed = false;
    $steps = aim_collect_steps($run['agents']);
    $agents = aim_agents();
    $noAnswer = fn(string $agId, string $err) => ['ok' => false, 'error' => $err, 'found' => false, 'provider' => $agId, 'model' => (string)($agents[$agId]['model'] ?? ''), 'cost' => 0];
    foreach ($steps as $step) {
        if (in_array($step, $run['done'], true)) continue;
        if ($left() <= 0) break;
        [$kind, $rest] = array_pad(explode(':', $step, 2), 2, '');
        $isAi = $kind === 'ask' || $kind === 'xwatch';
        $info = $run['steps'][$step] ?? [];
        if (($info['state'] ?? '') === 'running' && (int)($info['n'] ?? 0) >= ($isAi ? AIM_AI_TRIES : AIM_STEP_TRIES)) {
            $err = 'stopped by the host\'s time limit ' . (int)$info['n'] . ' times; skipped today';
            if ($kind === 'ask') { [$aid0, $ag0] = array_pad(explode(':', $rest, 2), 2, ''); if (isset($agents[$ag0])) aim_collect_answer_set($aid0, $ag0, $noAnswer($ag0, $err)); }
            $finish($step, ['ok' => false, 'error' => $err]);
            continue;
        }
        $ds = aim_working_dataset();
        try {
            if ($kind === 'finish') {
                $open = array_diff(array_slice($steps, 0, -1), $run['done']);
                if ($open) continue;                                   // waits for background answers
                $r = ['ok' => true, 'candidates' => array_merge(...array_values($run['pending'] ?: [[]]))];
                $run['pending'] = [];
                $run['finished'] = aim_iso();
            } elseif ($kind === 'ask') {
                [$aid, $agId] = array_pad(explode(':', $rest, 2), 2, '');
                $t = aim_research_target($aid);
                $agent = $agents[$agId] ?? null;
                if (!$t || !$agent) $r = ['ok' => false, 'error' => 'unknown question or agent'];
                elseif (isset($run['jobs'][$rest])) {                   // collect a background answer
                    if ($left() < 25) continue;
                    $res = aim_llm_bg_poll($run['jobs'][$rest], 1800, microtime(true) + $left() - 2);
                    if (!empty($res['pending'])) {
                        if (!empty($res['results_url'])) { $run['jobs'][$rest]['results_url'] = $res['results_url']; $save(); }   // answer ready: download on a later run
                        $run['steps'][$step]['wait'] = (string)($res['status'] ?? '');
                        continue;
                    }
                    unset($run['jobs'][$rest]);
                    $r = $answer($aid, $agent, aim_research_answer($t, $res));
                } elseif (!$agent['ready']) {
                    aim_collect_answer_set($aid, $agId, $noAnswer($agId, 'switched off or no key since the morning'));
                    $r = ['ok' => false, 'skipped' => 'agent switched off'];
                } elseif (($why = aim_research_blocked()) !== null) {
                    aim_collect_answer_set($aid, $agId, $noAnswer($agId, 'skipped: ' . $why));
                    $r = ['ok' => false, 'skipped' => $why];
                } elseif (!($q = aim_research_query($t, $ds, $agent))) $r = ['ok' => false, 'error' => 'unknown anchor'];
                elseif (aim_agent_background($agent) && aim_llm_bg_supported($q) && empty($run['nobg'][$agent['provider']])) {
                    if ($left() < 30) continue;
                    $begin($step);
                    $b = aim_llm_bg_start($q);
                    if ($b['ok']) { $run['jobs'][$rest] = $b['job']; $run['steps'][$step]['state'] = 'waiting'; $save(); continue; }
                    $e = (string)$b['error'];
                    if (preg_match('/^HTTP (400|404|405|422)/', $e)) {   // this provider refuses background requests (model or account): answer directly today
                        $run['nobg'][$agent['provider']] = true; $run['steps'][$step]['state'] = 'retry'; $save();
                        aim_log('collect', 'background mode refused, using direct calls', ['provider' => $agent['provider'], 'error' => $e]);
                        continue;
                    }
                    if ((preg_match('/^HTTP (408|409|425|429|5\d\d)/', $e) || !preg_match('/^HTTP /', $e)) && (int)($run['steps'][$step]['n'] ?? 0) < AIM_AI_TRIES + 1) {
                        $run['steps'][$step]['state'] = 'retry'; $save();   // busy or unreachable: try again on a later run
                        continue;
                    }
                    $r = $answer($aid, $agent, $noAnswer($agId, $e));
                } else {
                    if ($aiUsed || $left() < AIM_AI_SYNC_TIMEOUT + 4) continue;   // needs a fresh scheduler run; later steps may still be quick
                    $begin($step); $aiUsed = true;
                    $res = aim_llm($q);
                    if (!$res['ok'] && aim_http_transient((string)$res['error']) && (int)($run['steps'][$step]['n'] ?? 0) < AIM_AI_TRIES) {
                        $run['steps'][$step]['state'] = 'retry'; $save();   // too slow or busy this time: one more try on a later run
                        aim_agent_status($agId, $res, 'research');
                        continue;
                    }
                    $r = $answer($aid, $agent, aim_research_answer($t, $res));
                }
            } elseif ($kind === 'merge') {
                $aid = $rest;
                $mine = array_values(array_filter($steps, fn($s) => str_starts_with($s, 'ask:' . $aid . ':')));
                if (array_diff($mine, $run['done'])) continue;          // answers still missing
                $t = aim_research_target($aid);
                if (!$t) $r = ['ok' => false, 'error' => 'unknown question'];
                elseif (!$mine) $r = ['ok' => false, 'skipped' => 'no research agent ready (add a key under AI agents)'];
                else {
                    $answers = [];
                    foreach (aim_collect_answers($aid) as $id => $x) if (in_array('ask:' . $aid . ':' . $id, $mine, true)) $answers[$id] = $x + ['w' => $agents[$id]['weight'] ?? 0];
                    $r = aim_panel_merge($t, $ds, $answers, count($mine));
                    if (!empty($r['candidates'])) { $run['pending'][$aid] = $r['candidates']; $r['candidates'] = []; }
                }
            } elseif ($kind === 'xwatch') {
                $x = aim_xwatch_step($run, $left, $aiUsed, $begin, $save);
                if ($x === null) continue;                              // waiting (background answer or a fresh run)
                $r = $x;
            } else {
                $begin($step);
                if ($step === 'openrouter') $r = aim_collect_openrouter($ds);
                elseif ($step === 'eia') $r = aim_collect_eia($ds);
                elseif ($step === 'edgar') $r = aim_collect_edgar($ds);
                elseif ($step === 'epoch') $r = aim_collect_epoch($ds);
                else $r = ['ok' => false, 'error' => 'unknown step'];
            }
        } catch (Throwable $e) { $r = ['ok' => false, 'error' => $e->getMessage()]; }
        $finish($step, $r);
    }
    $save();
    if (!empty($run['finished'])) {
        aim_state_set(['collect' => $run, 'lastCollectAt' => aim_iso()]);
        aim_write_status();
        $xw = (int)($run['xwatchNew'] ?? 0);
        if (($run['new'] > 0 || $xw > 0) && function_exists('aim_admin_notify')) aim_admin_notify('AI Forecast Atlas: ' . ($run['new'] > 0 ? $run['new'] . ' new data point' . ($run['new'] > 1 ? 's' : '') : '') . ($run['new'] > 0 && $xw > 0 ? ' and ' : '') . ($xw > 0 ? $xw . ' X watch post' . ($xw > 1 ? 's' : '') : '') . ' to review', "The daily data check found new information.\nReview and approve it before Friday 13:00: " . aim_site_url('admin/') . "\n");
        return ['done' => true, 'new' => $run['new'], 'xwatch' => $xw];
    }
    return ['progress' => count($run['done']) . '/' . count($steps), 'waiting' => array_keys($run['jobs'])];
}
