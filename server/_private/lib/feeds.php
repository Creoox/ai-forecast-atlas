<?php
/* AI Forecast Atlas — release feeds (RSS 2.0, Atom, JSON Feed 1.1) and the release calendar (iCalendar).
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_x(string $s): string { return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function aim_feed_items(int $n = 30): array
{
    $base = rtrim(aim_settings()['site']['url'], '/') . '/';
    $items = [];
    foreach (array_slice(aim_releases_index()['releases'], 0, $n) as $e) {
        $rel = aim_read_json(aim_public('data/releases/' . $e['id'] . '/release.json'), []) ?: [];
        $changes = $rel['changes'] ?? [];
        $title = 'AI Forecast Atlas weekly release ' . $e['id'] . (!empty($e['carryForward']) ? ': no new data' : (!empty($e['base']) ? ': base data' : (count($changes) ? ': ' . count($changes) . ' data update' . (count($changes) > 1 ? 's' : '') : '')));
        $html = '<p>' . aim_h((string)($rel['summary'] ?? $e['summary'] ?? '')) . '</p>';
        if ($changes) {
            $html .= '<ul>';
            foreach ($changes as $c) $html .= '<li>' . aim_h(($c['name'] ?? $c['id']) . ': ' . ($c['fromText'] ?? '') . ' → ' . ($c['toText'] ?? '')) . (!empty($c['src']) ? ' <small>(' . aim_h($c['src']) . ')</small>' : '') . '</li>';
            $html .= '</ul>';
        }
        foreach (($rel['highlights'] ?? []) as $i => $h) $html .= ($i === 0 ? '<p>How the scenarios moved:</p><ul>' : '') . '<li>' . aim_h($h) . '</li>';
        if (!empty($rel['highlights'])) $html .= '</ul>';
        $xw = is_array($rel['xwatch'] ?? null) ? $rel['xwatch'] : [];
        foreach ($xw as $i => $x) {
            $post = $x['posts'][0]['url'] ?? '';
            $html .= ($i === 0 ? '<p>X watch — posts the editor is watching (signals, not data):</p><ul>' : '') . '<li>' . aim_h((string)($x['title'] ?? ''))
                . (aim_url_ok((string)$post) ? ' <a href="' . aim_h($post) . '">@' . aim_h((string)($x['posts'][0]['handle'] ?? 'post')) . '</a>' : '') . '</li>';
        }
        if ($xw) $html .= '</ul>';
        $html .= '<p><a href="' . aim_h($base) . '">Open AI Forecast Atlas</a> · <a href="' . aim_h($base . 'data/releases/' . $e['id'] . '/release.json') . '">Release data (JSON)</a></p>';
        $items[] = ['id' => $e['id'], 'url' => $base . 'data/releases/' . $e['id'] . '/', 'title' => $title, 'summary' => (string)($rel['summary'] ?? $e['summary'] ?? ''), 'html' => $html, 'date' => (string)$e['publishedAt']];
    }
    return $items;
}
function aim_write_feeds(): void
{
    $s = aim_settings();
    $base = rtrim($s['site']['url'], '/') . '/';
    $items = aim_feed_items();
    $updated = $items[0]['date'] ?? aim_iso();
    $desc = 'Weekly releases of AI Forecast Atlas: data updates and scenario paths for AI capex, revenue, token prices, compute, energy and work, 2023–2035. By Creoox AG. CC BY 4.0.';
    // RSS 2.0
    $rss = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>'
        . '<title>AI Forecast Atlas — weekly releases</title><link>' . aim_x($base) . '</link><description>' . aim_x($desc) . '</description><language>en</language>'
        . '<atom:link href="' . aim_x($base . 'feeds/releases.xml') . '" rel="self" type="application/rss+xml"/>'
        . '<lastBuildDate>' . aim_x(date(DATE_RSS, strtotime($updated))) . '</lastBuildDate><copyright>CC BY 4.0, Creoox AG</copyright>';
    foreach ($items as $it) {
        $rss .= '<item><title>' . aim_x($it['title']) . '</title><link>' . aim_x($it['url']) . '</link><guid isPermaLink="true">' . aim_x($it['url']) . '</guid>'
            . '<pubDate>' . aim_x(date(DATE_RSS, strtotime($it['date']))) . '</pubDate><description><![CDATA[' . str_replace(']]>', ']]&gt;', $it['html']) . ']]></description></item>';
    }
    $rss .= '</channel></rss>' . "\n";
    aim_write(aim_public('feeds/releases.xml'), $rss);
    // Atom
    $atom = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<feed xmlns="http://www.w3.org/2005/Atom"><title>AI Forecast Atlas — weekly releases</title>'
        . '<subtitle>' . aim_x($desc) . '</subtitle><link href="' . aim_x($base) . '"/><link rel="self" href="' . aim_x($base . 'feeds/releases-atom.xml') . '"/>'
        . '<id>' . aim_x($base) . '</id><updated>' . aim_x(date(DATE_ATOM, strtotime($updated))) . '</updated><author><name>Creoox AG</name><uri>https://creoox.com</uri></author><rights>CC BY 4.0</rights>';
    foreach ($items as $it) {
        $atom .= '<entry><title>' . aim_x($it['title']) . '</title><link href="' . aim_x($it['url']) . '"/><id>' . aim_x($it['url']) . '</id>'
            . '<updated>' . aim_x(date(DATE_ATOM, strtotime($it['date']))) . '</updated><summary>' . aim_x($it['summary']) . '</summary>'
            . '<content type="html">' . aim_x($it['html']) . '</content></entry>';
    }
    $atom .= '</feed>' . "\n";
    aim_write(aim_public('feeds/releases-atom.xml'), $atom);
    // JSON Feed 1.1
    $jf = ['version' => 'https://jsonfeed.org/version/1.1', 'title' => 'AI Forecast Atlas — weekly releases', 'home_page_url' => $base, 'feed_url' => $base . 'feeds/releases.json',
        'description' => $desc, 'icon' => $base . 'og.png', 'favicon' => $base . 'favicon.svg', 'authors' => [['name' => 'Creoox AG', 'url' => 'https://creoox.com']], 'language' => 'en',
        'items' => array_map(fn($it) => ['id' => $it['url'], 'url' => $it['url'], 'title' => $it['title'], 'summary' => $it['summary'], 'content_html' => $it['html'], 'date_published' => date(DATE_ATOM, strtotime($it['date'])), 'tags' => ['ai-forecast-atlas', 'release']], $items)];
    aim_write_json(aim_public('feeds/releases.json'), $jf, true);
    aim_write(aim_public('feeds/schedule.ics'), aim_ics());
}
/** Calendar with the recurring Friday 13:00 release (Europe/Zurich) plus the last releases as dated events. */
function aim_ics(): string
{
    $s = aim_settings();
    $base = rtrim($s['site']['url'], '/') . '/';
    $host = parse_url($base, PHP_URL_HOST) ?: 'aiforecastatlas.com';
    $esc = fn(string $t) => str_replace(["\\", ";", ",", "\n"], ["\\\\", "\\;", "\\,", "\\n"], $t);
    $fold = function (string $line) { $out = ''; while (strlen($line) > 74) { $cut = 74; while ($cut > 0 && (ord($line[$cut]) & 0xC0) === 0x80) $cut--; $out .= substr($line, 0, $cut) . "\r\n "; $line = substr($line, $cut); } return $out . $line . "\r\n"; };
    $stamp = gmdate('Ymd\THis\Z');
    $first = aim_next_release(aim_now()->modify('-7 days'));
    $L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Creoox AG//AI Forecast Atlas//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:AI Forecast Atlas releases', 'X-WR-TIMEZONE:Europe/Zurich',
        'BEGIN:VTIMEZONE', 'TZID:Europe/Zurich', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19810329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
        'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19961027T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE',
        'BEGIN:VEVENT', 'UID:weekly-release@' . $host, 'DTSTAMP:' . $stamp, 'DTSTART;TZID=Europe/Zurich:' . $first->format('Ymd\THis'), 'DURATION:PT15M', 'RRULE:FREQ=WEEKLY;BYDAY=FR',
        'SUMMARY:' . $esc('AI Forecast Atlas weekly release'), 'DESCRIPTION:' . $esc('New data and updated scenario paths every Friday at 13:00 Swiss time. ' . $base), 'URL:' . $base, 'END:VEVENT'];
    foreach (array_slice(aim_releases_index()['releases'], 0, 12) as $e) {
        $t = new DateTimeImmutable($e['publishedAt']);
        $L = array_merge($L, ['BEGIN:VEVENT', 'UID:release-' . $e['id'] . '@' . $host, 'DTSTAMP:' . $stamp, 'DTSTART:' . $t->setTimezone(new DateTimeZone('UTC'))->format('Ymd\THis\Z'), 'DURATION:PT5M',
            'SUMMARY:' . $esc('AI Forecast Atlas release ' . $e['id']), 'DESCRIPTION:' . $esc((string)($e['summary'] ?? '')), 'URL:' . $base . 'data/releases/' . $e['id'] . '/', 'TRANSP:TRANSPARENT', 'END:VEVENT']);
    }
    $L[] = 'END:VCALENDAR';
    $out = '';
    foreach ($L as $line) $out .= $fold($line);
    return $out;
}
