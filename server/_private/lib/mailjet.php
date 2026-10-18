<?php
/* AI Forecast Atlas — Mailjet client: transactional and newsletter sending (Send API v3.1), contact list management
   (managecontact), contact properties and audience snapshots. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

const AIM_MJ_PROPS = ['aim_lang' => 'str', 'aim_freq' => 'str', 'aim_cats' => 'str', 'aim_consent_at' => 'datetime', 'aim_consent_ver' => 'str', 'aim_source' => 'str'];
const AIM_CONSENT_VERSION = '2026-10';

function aim_mj_ready(): bool
{
    $m = aim_settings()['mailjet'];
    return $m['public_key'] !== '' && $m['private_key'] !== '' && $m['from_email'] !== '';
}
function aim_mj_list_ready(): bool { return aim_mj_ready() && (string)aim_settings()['mailjet']['list_id'] !== ''; }
function aim_mj(string $method, string $path, array $o = []): array
{
    $m = aim_settings()['mailjet'];
    $o['basic'] = [$m['public_key'], $m['private_key']];
    $o['timeout'] = $o['timeout'] ?? 30;
    return aim_http($method, rtrim($m['base'], '/') . $path, $o);
}
/** Send up to 50 messages. Returns ['ok' => n, 'failed' => [[email, reason]...], 'error' => string|null]. */
function aim_mj_send(array $messages, int $timeout = 30): array
{
    $m = aim_settings()['mailjet'];
    $body = ['Messages' => $messages];
    if (!empty($m['sandbox'])) $body['SandboxMode'] = true;
    $r = aim_mj('POST', '/v3.1/send', ['json' => $body, 'timeout' => $timeout]);
    $res = ['ok' => 0, 'failed' => [], 'error' => null, 'status' => $r['status']];
    if (!is_array($r['json']) || !isset($r['json']['Messages'])) { $res['error'] = aim_http_problem($r); return $res; }
    foreach ($r['json']['Messages'] as $i => $msg) {
        $to = $messages[$i]['To'][0]['Email'] ?? '?';
        if (($msg['Status'] ?? '') === 'success') $res['ok']++;
        else $res['failed'][] = [$to, (string)($msg['Errors'][0]['ErrorMessage'] ?? 'error')];
    }
    if (function_exists('aim_nl_count_sent')) aim_nl_count_sent($res['ok']);   // every email counts against the plan's daily limit
    return $res;
}
function aim_mj_message(string $toEmail, string $toName, string $subject, string $html, string $text, array $extra = []): array
{
    $m = aim_settings()['mailjet'];
    $msg = [
        'From' => ['Email' => $m['from_email'], 'Name' => $m['from_name'] ?: 'AI Forecast Atlas'],
        'To' => [array_filter(['Email' => $toEmail, 'Name' => $toName])],
        'Subject' => $subject, 'TextPart' => $text, 'HTMLPart' => $html,
        'TrackOpens' => 'disabled', 'TrackClicks' => 'disabled',
    ];
    if ($m['reply_to'] !== '') $msg['ReplyTo'] = ['Email' => $m['reply_to']];
    return array_merge($msg, $extra);
}
/** Add, update or unsubscribe a list member. $action: addforce | addnoforce | unsub | remove. */
function aim_mj_manage(string $email, string $name, string $action, array $props = []): array
{
    $list = (string)aim_settings()['mailjet']['list_id'];
    $body = ['Email' => $email, 'Action' => $action];
    if ($name !== '') $body['Name'] = $name;
    if ($props) $body['Properties'] = $props;
    $r = aim_mj('POST', '/v3/REST/contactslist/' . rawurlencode($list) . '/managecontact', ['json' => $body]);
    return ['ok' => $r['status'] >= 200 && $r['status'] < 300, 'error' => $r['status'] >= 300 || $r['error'] ? aim_http_problem($r) : null];
}
/** Create the contact properties the newsletter needs (idempotent). */
function aim_mj_ensure_properties(): array
{
    $r = aim_mj('GET', '/v3/REST/contactmetadata?Limit=1000');
    if (!is_array($r['json'])) return ['ok' => false, 'error' => aim_http_problem($r)];
    $have = [];
    foreach (($r['json']['Data'] ?? []) as $d) $have[$d['Name'] ?? ''] = true;
    $made = [];
    foreach (AIM_MJ_PROPS as $name => $type) {
        if (isset($have[$name])) continue;
        $c = aim_mj('POST', '/v3/REST/contactmetadata', ['json' => ['Datatype' => $type, 'Name' => $name, 'NameSpace' => 'static']]);
        if ($c['status'] >= 300) return ['ok' => false, 'error' => 'Could not create property ' . $name . ': ' . aim_http_problem($c)];
        $made[] = $name;
    }
    return ['ok' => true, 'created' => $made];
}
/** Properties of one contact (by email), or null. */
function aim_mj_contact(string $email): ?array
{
    $c = aim_mj('GET', '/v3/REST/contact/' . rawurlencode($email));
    $id = $c['json']['Data'][0]['ID'] ?? null;
    if (!$id) return null;
    $d = aim_mj('GET', '/v3/REST/contactdata/' . rawurlencode((string)$id));
    $props = [];
    foreach (($d['json']['Data'][0]['Data'] ?? []) as $p) $props[$p['Name']] = $p['Value'];
    return ['id' => $id, 'name' => (string)($c['json']['Data'][0]['Name'] ?? ''), 'props' => $props];
}
/** Snapshot of the list: every subscribed member with email, name and properties. */
function aim_mj_audience(): array
{
    $list = rawurlencode((string)aim_settings()['mailjet']['list_id']);
    $page = function (string $path) {
        $all = []; $off = 0;
        for ($i = 0; $i < 200; $i++) {
            $r = aim_mj('GET', $path . (str_contains($path, '?') ? '&' : '?') . 'Limit=1000&Offset=' . $off . '&Sort=ID');
            if (!is_array($r['json'])) throw new RuntimeException('Mailjet: ' . aim_http_problem($r));
            $data = $r['json']['Data'] ?? [];
            $all = array_merge($all, $data);
            if (count($data) < 1000) break;
            $off += 1000;
        }
        return $all;
    };
    $recips = $page('/v3/REST/listrecipient?ContactsList=' . $list);
    $contacts = $page('/v3/REST/contact?ContactsList=' . $list);
    $data = $page('/v3/REST/contactdata?ContactsList=' . $list);
    $email = []; $name = [];
    foreach ($contacts as $c) { $email[$c['ID']] = $c['Email'] ?? ''; $name[$c['ID']] = $c['Name'] ?? ''; }
    $props = [];
    foreach ($data as $d) { $p = []; foreach (($d['Data'] ?? []) as $x) $p[$x['Name']] = $x['Value']; $props[$d['ContactID'] ?? $d['ID'] ?? 0] = $p; }
    $out = [];
    foreach ($recips as $r) {
        if (!empty($r['IsUnsubscribed'])) continue;
        $id = $r['ContactID'] ?? null;
        if (!$id || empty($email[$id])) continue;
        $out[] = ['e' => $email[$id], 'n' => $name[$id] ?? '', 'p' => $props[$id] ?? []];
    }
    return $out;
}
