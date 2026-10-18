<?php
/* AI Forecast Atlas — imprint (legal notice). Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
require __DIR__ . '/aim-config.php';
require AIM_PRIVATE . '/lib/bootstrap.php';
$s = aim_settings()['site'];
$miss = fn($v, $what) => $v !== '' ? aim_h($v) : '<span class="err">[' . aim_h($what) . ' — add it in the admin page, Settings → Site and company]</span>';
$f = fn(string $k) => trim((string)($s[$k] ?? ''));
$ids = [];
if ($f('register') !== '') $ids[] = 'Commercial register: ' . aim_h($f('register'));
if ($f('uid') !== '') $ids[] = 'Company number (UID): ' . aim_h($f('uid'));
if ($f('vat') !== '') $ids[] = 'VAT number: ' . aim_h($f('vat'));
$b = '<h1>Imprint</h1>'
 . '<p><b>' . aim_h($f('company') ?: 'Creoox AG') . '</b>' . ($f('legal_form') !== '' ? '<br>' . aim_h($f('legal_form')) : '') . '<br>' . nl2br($miss($f('address'), 'address of the registered office')) . '</p>'
 . ($f('postal') !== '' ? '<p>Postal address: ' . aim_h($f('postal')) . '</p>' : '')
 . '<p>Email: ' . $miss($f('email'), 'contact email') . ($f('phone') !== '' ? '<br>Phone: ' . aim_h($f('phone')) : '') . '</p>'
 . ($f('represented_by') !== '' ? '<p>Represented by: ' . aim_h($f('represented_by')) . '</p>' : '')
 . '<p>' . ($ids ? implode('<br>', $ids) : $miss('', 'commercial register and number')) . '</p>'
 . ($f('authority') !== '' ? '<p>Supervisory authority for data protection: ' . aim_h($f('authority')) . '</p>' : '')
 . ($f('imprint_extra') !== '' ? '<p>' . nl2br(aim_h($f('imprint_extra'))) . '</p>' : '')
 . '<h2>About this site</h2><p>AI Forecast Atlas is a scenario model of how AI is becoming a commodity. It is published for information. It is not a forecast and not investment, legal or tax advice. We check the data carefully but give no guarantee that it is complete or correct. Values found with AI research and posts listed under X watch are checked by a person before they are published; X watch items are signals, not data.</p>'
 . '<p>Links to other websites and posts on X lead to content we do not control; their operators and authors are responsible for it.</p>'
 . '<h2>Licences</h2><p>Published data and charts: CC BY 4.0 (credit “AI Forecast Atlas by Creoox AG”). Code, scenario model and design: Business Source License 1.1 — the source is public, but it may not be used to offer a competing service without a licence from Creoox AG' . ($f('repo_url') !== '' ? ' (<a href="' . aim_h($f('repo_url')) . '">source code</a>)' : '') . '. Third-party data keep their own terms; posts on X belong to their authors.</p>'
 . '<h2>Trademarks</h2><p class="note">All company and product names are trademarks™ or registered® trademarks of their respective holders; their use does not imply any affiliation with or endorsement by them. Autodesk is a registered trademark of Autodesk, Inc., and/or its subsidiaries and/or affiliates in the USA and/or other countries; Creoox AG is not affiliated with Autodesk, Inc.</p>';
aim_page('Imprint', $b, 'en', 200, false);
