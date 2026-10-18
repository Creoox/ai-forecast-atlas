<?php
/* AI Forecast Atlas — languages (EN/DE/FR/PL) for emails and subscriber pages, localized number formats.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_cfg(string $name): array
{
    static $c = [];
    if (!isset($c[$name])) $c[$name] = aim_read_json(AIM_PRIVATE . '/config/' . $name . '.json', []) ?: [];
    return $c[$name];
}
function aim_langs(): array { return aim_cfg('i18n')['langs'] ?? ['en']; }
function aim_lang($l): string { $l = strtolower(substr((string)$l, 0, 2)); return in_array($l, aim_langs(), true) ? $l : 'en'; }
/** Translate a UI string; {name} placeholders are replaced from $vars. */
function aim_t(string $key, string $lang = 'en', array $vars = []): string
{
    $e = aim_cfg('i18n')['t'][$key] ?? null;
    $s = is_array($e) ? ($e[$lang] ?? $e['en'] ?? $key) : $key;
    foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
    return $s;
}
/** Format codes for every measure (same as the dashboard). */
function aim_metric_formats(): array
{
    return [
        'K' => 'B', 'R' => 'B', 'CC' => 'B', 'ccov' => 'cov', 'cov' => 'cov', 'VL' => 'T', 'VN' => 'T', 'Mult' => 'x', 'S' => 'idx', 'Cs' => 'idx', 'Bs' => 'idx',
        'G' => 'mo', 'Np' => 'cnt', 'Pf' => 'usd', 'Pc' => 'usd', 'prem' => 'x', 'mf' => 'x', 'DC' => 'twh', 'Pp' => 'idx', 'GR' => 'usdh', 'DR' => 'idx', 'LB' => 'usd0',
        'Ufp' => 'pct', 'Uopp' => 'pct', 'STp' => 'pct', 'SVp' => 'pct', 'OS' => 'pct', 'ES' => 'pct', 'LS' => 'pct', 'AS' => 'pct', 'TC' => 'pct', 'PF' => 'idx', 'SN' => 'idx',
        'GDP' => 'pp', 'AU' => 'pct', 'AUd' => 'pct', 'AUp' => 'pct', 'CRp' => 'pct', 'BLD' => 'B', 'AUa' => 'pct', 'AUdev' => 'pct', 'seatG' => 'idx', 'seatA' => 'idx', 'CtaskI' => 'ix', 'PLAT' => 'idx',
    ];
}
function aim_num($v, int $dec, string $lang = 'en'): string
{
    $n = aim_cfg('i18n')['num'][$lang] ?? ['dec' => '.', 'thou' => ','];
    return number_format((float)$v, $dec, $n['dec'], $n['thou']);
}
/** Localized value with unit, following the dashboard's rounding rules. */
function aim_fmt(string $k, $v, string $lang = 'en'): string
{
    if ($v === null || !is_numeric($v) || !is_finite((float)$v)) return '—';
    $v = (float)$v;
    $f = aim_metric_formats()[$k] ?? '';
    $n = aim_cfg('i18n')['num'][$lang] ?? aim_cfg('i18n')['num']['en'];
    $wrap = fn(array $pp, string $num) => $pp[0] . $num . $pp[1];
    switch ($f) {
        case 'B': return $v >= 1000 ? $wrap($n['T'], aim_num($v / 1000, 2, $lang)) : $wrap($n['B'], aim_num(round($v), 0, $lang));
        case 'T': return $wrap($n['T'], aim_num($v, $v >= 10 ? 1 : 2, $lang));
        case 'usd': return $wrap($n['usd'], aim_num($v, $v >= 10 ? 1 : ($v >= 0.1 ? 2 : 3), $lang));
        case 'usdh': return $wrap($n['usd'], aim_num($v, 2, $lang));
        case 'usd0': return $wrap($n['usd'], aim_num(round($v), 0, $lang));
        case 'pct': return aim_num($v, $v < 10 ? 1 : 0, $lang) . $n['pct'];
        case 'cov': return aim_num(round($v * 100), 0, $lang) . $n['pct'];
        case 'x': return aim_num($v, $v < 10 ? 1 : 0, $lang) . $n['x'];
        case 'idx': case 'cnt': return aim_num(round($v), 0, $lang);
        case 'ix': return aim_num($v, $v < 1 ? 2 : ($v < 10 ? 1 : 0), $lang);
        case 'mo': return aim_num($v, 1, $lang) . $n['mo'];
        case 'twh': return aim_num(round($v), 0, $lang) . $n['twh'];
        case 'pp': $a = abs($v) < 0.05 ? 0.0 : $v; return ($a >= 0 ? '+' : '−') . aim_num(abs($a), 1, $lang) . $n['pp'];
    }
    return aim_num($v, 2, $lang);
}
function aim_metric_name(string $k, string $lang, string $en): string
{
    if ($lang === 'en') return $en;
    return aim_cfg('i18n')['metrics'][$k][$lang] ?? $en;
}
/** [name, short] of a scenario in a language. */
function aim_scenario_name(array $scn, string $lang): array
{
    if ($lang !== 'en' && isset(aim_cfg('i18n')['scenarios'][$scn['key']][$lang])) return aim_cfg('i18n')['scenarios'][$scn['key']][$lang];
    return [$scn['name'] ?? $scn['key'], $scn['short'] ?? $scn['key']];
}
/** "Q4 2030" in the reader's language. */
function aim_quarter(string $label, string $lang): string
{
    if (!preg_match('/^Q([1-4]) (\d{4})$/', $label, $m)) return $label;
    $roman = ['', 'I', 'II', 'III', 'IV'][(int)$m[1]];
    $tpl = aim_cfg('i18n')['quarter'][$lang] ?? 'Q{q} {y}';
    return str_replace(['{q}', '{y}', '{r}'], [$m[1], $m[2], $roman], $tpl);
}
function aim_date_l(string $iso, string $lang, bool $withTime = false): string
{
    try { $d = (new DateTimeImmutable($iso))->setTimezone(new DateTimeZone(AIM_TZ)); } catch (Throwable $e) { return $iso; }
    $months = [
        'en' => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        'de' => ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
        'fr' => ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
        'pl' => ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'],
    ];
    $m = ($months[$lang] ?? $months['en'])[(int)$d->format('n') - 1];
    $s = $lang === 'de' ? $d->format('j') . '. ' . $m . ' ' . $d->format('Y') : $d->format('j') . ' ' . $m . ' ' . $d->format('Y');
    if ($withTime) $s .= ', ' . $d->format('H:i') . ' ' . ($d->format('I') === '1' ? 'CEST' : 'CET');
    return $s;
}
