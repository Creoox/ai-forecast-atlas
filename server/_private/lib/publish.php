<?php
/* AI Forecast Atlas — weekly releases: staging (from the admin page or the optional automation), publishing on
   Friday 13:00 Swiss time (or carrying the last release forward when nothing new was staged), and the public
   files that follow: archive, latest, release.js for the dashboard, release pages, feeds, sitemap, status.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

const AIM_RELEASE_FILE_RX = '#^(release\.json|dataset\.json|metrics\.json|scenarios\.json|datapackage\.json|series/[A-Z]{3,5}\.(json|csv)|series/all\.csv|impacts/[A-Z]{3,5}\.json|charts/[A-Za-z]{1,8}\.svg)\z#';

function aim_state(): array { return aim_store_read('state', []) ?: []; }
function aim_state_set(array $patch): array { return aim_store_update('state', fn($s) => array_merge(is_array($s) ? $s : [], $patch), []); }
function aim_releases_index(): array
{
    $i = aim_read_json(aim_public('data/releases/index.json'), null);
    return is_array($i) && isset($i['releases']) ? $i : ['schema' => 'aimonitor.releases/1', 'releases' => []];
}
function aim_valid_release_id(string $id): bool { return (bool)preg_match('/^\d{4}-W\d{2}(\.\d{1,2})?$/', $id); }

/** Check an uploaded release bundle; returns [ok, message, files]. Files map path => content (strings). */
function aim_validate_bundle(string $id, array $files): array
{
    if (!aim_valid_release_id($id)) return [false, 'Bad release id.', []];
    $total = 0; $clean = [];
    foreach ($files as $path => $content) {
        $path = (string)$path;
        if (!preg_match(AIM_RELEASE_FILE_RX, $path)) return [false, 'Unexpected file: ' . $path, []];
        if (!is_string($content)) return [false, 'Bad content: ' . $path, []];
        $len = strlen($content); $total += $len;
        if ($len > 3000000 || $total > 12000000) return [false, 'Release too large.', []];
        if (str_ends_with($path, '.svg') && !aim_svg_safe($content)) return [false, 'Chart rejected: ' . $path, []];
        if (str_ends_with($path, '.json') && json_decode($content, true) === null) return [false, 'Invalid JSON: ' . $path, []];
        $clean[$path] = $content;
    }
    foreach (['release.json', 'dataset.json', 'series/all.csv'] as $req) if (!isset($clean[$req])) return [false, 'Missing ' . $req, []];
    // every link that the dashboard, release pages and emails will show must be a plain web link
    foreach (['release.json', 'dataset.json'] as $jf) { $bad = aim_unsafe_link(json_decode($clean[$jf], true)); if ($bad !== null) return [false, 'Unsafe link in ' . $jf . ': ' . mb_substr($bad, 0, 80), []]; }
    $rel = json_decode($clean['release.json'], true);
    if (($rel['schema'] ?? '') !== 'aimonitor.release/1' || ($rel['id'] ?? '') !== $id) return [false, 'release.json does not match the release id.', []];
    return [true, 'ok', $clean];
}
/** First value of a "url" field (at any depth) that is not empty and not a plain http(s) link, or null. */
function aim_unsafe_link($v): ?string
{
    if (!is_array($v)) return null;
    foreach ($v as $k => $x) {
        if ($k === 'url' && is_string($x) && $x !== '' && !aim_url_ok($x)) return $x;
        if (is_array($x) && ($bad = aim_unsafe_link($x)) !== null) return $bad;
    }
    return null;
}
/** Charts are drawn by our own code: only plain drawing elements, no links, scripts, styles or entities. */
function aim_svg_safe(string $svg): bool
{
    if (!str_starts_with(ltrim($svg), '<svg') || str_contains($svg, '<!') || str_contains($svg, '<?')) return false;
    $dec = html_entity_decode($svg, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    foreach ([$svg, $dec] as $x) if (preg_match('/<script|<foreignObject|<style|\son[a-z]+\s*=|javascript:|=\s*["\']?\s*data:|href\s*=|url\s*\(|@import/i', $x)) return false;
    if (preg_match_all('#</?\s*([a-zA-Z][\w:.-]*)#', $svg, $m)) {
        $ok = ['svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan', 'title', 'desc'];
        foreach ($m[1] as $tag) if (!in_array(strtolower($tag), $ok, true)) return false;
    }
    return true;
}
/** Staged builds are kept as one guarded file, so they stay private until Friday even where .htaccess is ignored. */
function aim_stage(string $id, array $files, string $by): array
{
    [$ok, $msg, $clean] = aim_validate_bundle($id, $files);
    if (!$ok) return ['ok' => false, 'error' => $msg];
    aim_with_lock('stage', function () use ($id, $clean) {
        if (is_dir(aim_storage('staged/' . $id))) aim_rmtree(aim_storage('staged/' . $id));
        aim_store_write('staged/' . $id, ['id' => $id, 'files' => $clean]);
    });
    aim_store_write('staged/' . $id . '-meta', ['id' => $id, 'stagedAt' => aim_iso(), 'by' => $by, 'files' => count($clean)]);
    aim_log('release', 'staged', ['id' => $id, 'by' => $by, 'files' => count($clean)]);
    return ['ok' => true, 'id' => $id, 'files' => count($clean)];
}

/* Browser upload transport only. The existing bundle validator remains the publication gate. */
const AIM_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const AIM_UPLOAD_MAX_PART_BYTES = 300000;
const AIM_UPLOAD_MAX_PARTS = 64;
class AimStageUploadError extends RuntimeException
{
    public string $reason;
    public function __construct(string $reason, string $message) { parent::__construct($message); $this->reason = $reason; }
}
function aim_upload_valid_id($upload): bool { return is_string($upload) && preg_match('/\A[a-f0-9]{32}\z/', $upload) === 1; }
function aim_upload_failure($id, string $reason, string $message): array
{
    // Never log bundle validation messages: they may contain an uploaded path or URL.
    $safeId = is_string($id) && preg_match('/\A\d{4}-W\d{2}(?:\.\d{1,2})?\z/', $id) ? $id : '';
    aim_log('release', 'stage-failed', ['id' => $safeId, 'reason' => $reason]);
    return ['ok' => false, 'error' => $message];
}
/** Unlike the general helper, an upload lock must fail closed if the lock file cannot be opened. */
function aim_upload_locked(callable $fn)
{
    if (is_link(aim_storage('uploads'))) throw new RuntimeException('Upload storage is unavailable.');
    aim_mkdir(aim_storage('locks'));
    $path = aim_storage('locks/stage-upload.lock');
    $fh = @fopen($path, 'c');
    if (!$fh) throw new RuntimeException('Upload lock is unavailable.');
    try {
        if (!flock($fh, LOCK_EX)) throw new RuntimeException('Upload lock is unavailable.');
        @touch($path);
        return $fn();
    } finally { flock($fh, LOCK_UN); fclose($fh); }
}
/** Delete only one flat upload folder under the private uploads root; never follow a symlink. */
function aim_upload_remove(string $upload): void
{
    if (!aim_upload_valid_id($upload) || is_link(aim_storage('uploads'))) return;
    $dir = aim_storage('uploads/' . $upload);
    if (is_link($dir) || !is_dir($dir)) return;
    foreach (scandir($dir) ?: [] as $name) {
        if ($name === '.' || $name === '..') continue;
        $file = $dir . '/' . $name;
        if (is_link($file) || is_file($file)) @unlink($file);
    }
    @rmdir($dir);
}
/** Caller holds the upload lock. Directory mtime records the most recently accepted part. */
function aim_upload_prune_locked(): int
{
    $removed = 0;
    foreach (glob(aim_storage('uploads/*'), GLOB_ONLYDIR) ?: [] as $dir) {
        if (!aim_upload_valid_id(basename($dir)) || is_link($dir)) continue;
        $mtime = @filemtime($dir);
        if ($mtime !== false && $mtime < time() - 86400) {
            aim_upload_remove(basename($dir));
            if (!is_dir($dir)) $removed++;
        }
    }
    return $removed;
}
function aim_upload_prune(): int
{
    try { return aim_upload_locked(fn() => aim_upload_prune_locked()); }
    catch (Throwable $e) { aim_log('release', 'stage-failed', ['id' => '', 'reason' => 'upload-cleanup-unavailable']); return 0; }
}
/** Read guarded parts and verify their stored metadata before counting or combining them. */
function aim_upload_parts(string $upload, int $total): array
{
    $parts = []; $bytes = 0;
    for ($i = 0; $i < $total; $i++) {
        $rel = 'uploads/' . $upload . '/' . $i;
        if (is_link(aim_store_path($rel))) throw new AimStageUploadError('invalid-part-storage', 'Upload storage is invalid. Start the upload again.');
        if (!is_file(aim_store_path($rel))) continue;
        $part = aim_store_read($rel);
        if (!is_array($part) || ($part['index'] ?? null) !== $i || ($part['total'] ?? null) !== $total || !is_string($part['data'] ?? null) || strlen($part['data']) > AIM_UPLOAD_MAX_PART_BYTES) {
            throw new AimStageUploadError('invalid-part-metadata', 'Upload parts are inconsistent. Start the upload again.');
        }
        $bytes += strlen($part['data']);
        if ($bytes > AIM_UPLOAD_MAX_BYTES) throw new AimStageUploadError('upload-too-large', 'The upload exceeds the 8 MiB transport limit.');
        $parts[$i] = $part['data'];
    }
    return [$parts, $bytes];
}
/** Accept a zero-based part. Identical retries are safe; part contents and total cannot be changed. */
function aim_stage_part(array $in): array
{
    try {
        $upload = $in['upload'] ?? null; $index = $in['index'] ?? null; $total = $in['total'] ?? null; $data = $in['data'] ?? null;
        if (!aim_upload_valid_id($upload)) throw new AimStageUploadError('invalid-upload-id', 'Bad upload id.');
        if (!is_int($total) || $total < 1 || $total > AIM_UPLOAD_MAX_PARTS || !is_int($index) || $index < 0 || $index >= $total) throw new AimStageUploadError('invalid-part-index', 'Bad upload part index or total.');
        if (!is_string($data) || strlen($data) > AIM_UPLOAD_MAX_PART_BYTES) throw new AimStageUploadError('invalid-part-size', 'An upload part must be a string of at most 300,000 characters.');
        return aim_upload_locked(function () use ($upload, $index, $total, $data) {
            aim_upload_prune_locked();
            $dir = aim_storage('uploads/' . $upload);
            $metaRel = 'uploads/' . $upload . '/meta';
            if (is_link($dir) || is_link(aim_store_path($metaRel))) throw new AimStageUploadError('invalid-upload-storage', 'Upload storage is invalid. Start the upload again.');
            $meta = aim_store_read($metaRel);
            if ($meta !== null && (!is_array($meta) || ($meta['total'] ?? null) !== $total)) throw new AimStageUploadError('inconsistent-total', 'The upload part total changed. Start the upload again.');
            if ($meta === null && is_dir($dir)) throw new AimStageUploadError('missing-upload-metadata', 'Upload metadata is missing. Start the upload again.');
            [$parts, $bytes] = aim_upload_parts($upload, $total);
            if (array_key_exists($index, $parts)) {
                if ($parts[$index] !== $data) throw new AimStageUploadError('conflicting-part', 'This upload part was already supplied with different contents.');
            } elseif ($bytes + strlen($data) > AIM_UPLOAD_MAX_BYTES) throw new AimStageUploadError('upload-too-large', 'The upload exceeds the 8 MiB transport limit.');
            if ($meta === null) {
                aim_store_write($metaRel, ['total' => $total]);
            }
            if (!array_key_exists($index, $parts)) aim_store_write('uploads/' . $upload . '/' . $index, ['index' => $index, 'total' => $total, 'data' => $data]);
            @touch($dir);
            return ['ok' => true, 'upload' => $upload, 'index' => $index, 'total' => $total];
        });
    } catch (AimStageUploadError $e) { return aim_upload_failure(null, $e->reason, $e->getMessage()); }
    catch (Throwable $e) { return aim_upload_failure(null, 'upload-storage-unavailable', 'The server could not save this upload part. Start the upload again.'); }
}
/** Commit is terminal: remove its parts on success or rejection, and pass plain file strings to aim_stage. */
function aim_stage_commit(array $in): array
{
    $id = $in['id'] ?? null;
    try {
        $upload = $in['upload'] ?? null;
        if (!aim_upload_valid_id($upload)) throw new AimStageUploadError('invalid-upload-id', 'Bad upload id.');
        return aim_upload_locked(function () use ($upload, $id, $in) {
            try {
                if (!is_string($id) || !aim_valid_release_id($id)) throw new AimStageUploadError('invalid-release-id', 'Bad release id.');
                $encoding = $in['encoding'] ?? null; $sha = $in['sha256'] ?? null;
                if (!is_string($encoding) || !in_array($encoding, ['gzip', 'json'], true)) throw new AimStageUploadError('invalid-encoding', 'Unsupported upload encoding.');
                if (!is_string($sha) || preg_match('/\A[a-f0-9]{64}\z/', $sha) !== 1) throw new AimStageUploadError('invalid-checksum', 'Bad upload checksum.');
                $metaRel = 'uploads/' . $upload . '/meta';
                if (is_link(aim_storage('uploads/' . $upload)) || is_link(aim_store_path($metaRel))) throw new AimStageUploadError('invalid-upload-storage', 'Upload storage is invalid. Start the upload again.');
                $meta = aim_store_read($metaRel);
                $total = is_array($meta) ? ($meta['total'] ?? null) : null;
                if (!is_int($total) || $total < 1 || $total > AIM_UPLOAD_MAX_PARTS) throw new AimStageUploadError('missing-upload-metadata', 'The upload was not found or has expired. Start the upload again.');
                [$parts, $bytes] = aim_upload_parts($upload, $total);
                if (count($parts) !== $total) throw new AimStageUploadError('missing-part', 'An upload part is missing. Start the upload again.');
                $encoded = implode('', $parts); unset($parts);
                if (!hash_equals($sha, hash('sha256', $encoded))) throw new AimStageUploadError('checksum-mismatch', 'The upload checksum does not match. Start the upload again.');
                $bin = base64_decode($encoded, true);
                if ($bin === false || base64_encode($bin) !== $encoded) throw new AimStageUploadError('invalid-base64', 'The upload is not valid base64.');
                unset($encoded);
                if ($encoding === 'gzip') {
                    if (!function_exists('gzdecode')) throw new AimStageUploadError('gzip-unavailable', 'PHP extension zlib is unavailable. Start the upload again without compression.');
                    $json = @gzdecode($bin, 16000000);
                    if ($json === false) throw new AimStageUploadError('invalid-gzip', 'The compressed upload is invalid or exceeds 16,000,000 decoded bytes.');
                } else $json = $bin;
                unset($bin);
                if (strlen($json) > 16000000) throw new AimStageUploadError('decoded-too-large', 'The decoded upload exceeds 16,000,000 bytes.');
                $payload = json_decode($json, true); unset($json);
                if (!is_array($payload) || !is_string($payload['id'] ?? null) || !is_array($payload['files'] ?? null)) throw new AimStageUploadError('invalid-json-envelope', 'The upload must contain a release id and plain file strings.');
                if ($payload['id'] !== $id) throw new AimStageUploadError('release-id-mismatch', 'The upload does not match the release id.');
                $r = aim_stage($id, $payload['files'], 'admin');
                if (empty($r['ok'])) aim_upload_failure($id, 'bundle-validation-failed', 'The uploaded release failed validation.');
                return $r;
            } finally { aim_upload_remove($upload); }
        });
    } catch (AimStageUploadError $e) { return aim_upload_failure($id, $e->reason, $e->getMessage()); }
    catch (Throwable $e) { return aim_upload_failure($id, 'upload-commit-failed', 'The server could not finish this upload. Start the upload again.'); }
}
function aim_rmtree(string $dir): void
{
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    @rmdir($dir);
}
function aim_read_tree(string $dir): array
{
    $out = [];
    if (!is_dir($dir)) return $out;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if (!$f->isFile()) continue;
        $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($dir) + 1));
        if (preg_match(AIM_RELEASE_FILE_RX, $rel)) $out[$rel] = (string)file_get_contents($f->getPathname());
    }
    ksort($out);
    return $out;
}
/** Ids of the staged builds (a staged id of an earlier week is also accepted by the Friday run). */
function aim_staged_ids(): array
{
    $ids = [];
    foreach (glob(aim_storage('staged/*-meta.php')) ?: [] as $f) { $id = substr(basename($f), 0, -9); if (aim_valid_release_id($id) && is_file(aim_store_path('staged/' . $id))) $ids[] = $id; }
    foreach (glob(aim_storage('staged/*'), GLOB_ONLYDIR) ?: [] as $d) { $id = basename($d); if (aim_valid_release_id($id) && !in_array($id, $ids, true)) $ids[] = $id; }
    sort($ids);
    return $ids;
}
/** Files of a staged build: from the guarded file, or from a folder (the base release written by the build script). */
function aim_staged_files(string $id): array
{
    $b = aim_store_read('staged/' . $id);
    if (is_array($b) && is_array($b['files'] ?? null)) {
        $out = [];
        foreach ($b['files'] as $p => $c) if (is_string($c) && preg_match(AIM_RELEASE_FILE_RX, (string)$p)) $out[(string)$p] = $c;
        ksort($out);
        return $out;
    }
    return aim_read_tree(aim_storage('staged/' . $id));
}
function aim_unstage(string $id): void
{
    if (!aim_valid_release_id($id)) return;
    aim_rmtree(aim_storage('staged/' . $id));
    @unlink(aim_store_path('staged/' . $id));
    @unlink(aim_store_path('staged/' . $id . '-meta'));
}
function aim_release_lite(array $r): array
{
    $keep = ['id', 'publishedAt', 'next', 'asOf', 'engine', 'base', 'carryForward', 'summary', 'notes', 'highlights', 'xwatch'];
    $o = array_intersect_key($r, array_flip($keep));
    $o['changes'] = array_map(fn($c) => array_intersect_key($c, array_flip(['id', 'metric', 'name', 'fromText', 'toText', 'status', 'period', 'src', 'url', 'quote', 'refs', 'via', 'reviewed'])), $r['changes'] ?? []);
    return $o;
}

/**
 * Publish a release. $source: 'staged' (files from storage/staged/<stagedId>) or 'carry' (copy of the latest with a new id).
 * Writes data/releases/<id>/, refreshes data/latest/, release.js, index, release page, feeds, sitemap, status; queues the newsletter.
 */
function aim_publish(string $id, string $source, ?string $stagedId = null, string $by = 'schedule'): array
{
    return aim_with_lock('publish', function () use ($id, $source, $stagedId, $by) {
        if (!aim_valid_release_id($id)) return ['ok' => false, 'error' => 'Bad release id.'];
        $now = aim_now();
        $next = aim_next_release($now->modify('+1 minute'));
        if ($source === 'staged') {
            $files = aim_staged_files($stagedId ?: $id);
            if (!isset($files['release.json'])) return ['ok' => false, 'error' => 'Nothing staged.'];
        } else {
            $files = aim_read_tree(aim_public('data/latest'));
            if (!isset($files['release.json'])) return ['ok' => false, 'error' => 'No previous release to carry forward.'];
        }
        $rel = json_decode($files['release.json'], true);
        $prevId = $rel['id'] ?? '';
        $rel['id'] = $id;
        $rel['publishedAt'] = aim_iso($now);
        $rel['next'] = aim_iso($next);
        if ($source === 'carry') {
            $rel['carryForward'] = true; $rel['base'] = false; $rel['changes'] = []; $rel['highlights'] = []; $rel['moves'] = [];
            $waiting = function_exists('aim_working_diff') ? count(aim_working_diff()) : 0;
            $rel['summary'] = 'No new release was built this week: starting values and all scenario paths are unchanged since release ' . $prevId . '.'
                . ($waiting ? ' ' . $waiting . ' reviewed value' . ($waiting > 1 ? 's are' : ' is') . ' waiting for the next build.' : '');
            if ($waiting && function_exists('aim_admin_notify')) aim_admin_notify('AI Forecast Atlas: approved values were not released', $waiting . ' approved value' . ($waiting > 1 ? 's were' : ' was') . ' not staged, so release ' . $id . ' repeats ' . $prevId . '. Build and stage the release under Admin → Release; it goes out next Friday, or publish it now.' . "\n" . aim_site_url('admin/') . "\n");
            $rel['carriedFrom'] = $prevId;
        }
        // X watch: the posts the editor approved since the previous release (signals, not data)
        $rel['xwatch'] = function_exists('aim_xwatch_since') ? aim_xwatch_since(aim_state()['lastReleaseAt'] ?? null, 20) : [];
        $rel['licence'] = 'CC BY 4.0 — credit “AI Forecast Atlas by Creoox AG”, aiforecastatlas.com, release ' . $id;
        $files['release.json'] = aim_json_encode($rel, true) . "\n";
        foreach ($files as $path => $content) {   // the release id also appears in chart footers and series files
            if (str_ends_with($path, '.svg')) $files[$path] = preg_replace('/release \d{4}-W\d{2}(?:\.\d{1,2})?/', 'release ' . $id, $content);
            elseif (preg_match('#^(series|impacts)/[A-Z]+\.json$#', $path)) $files[$path] = preg_replace('/"release":"[^"]*"/', '"release":"' . $id . '"', $content, 1);
        }
        if (isset($files['datapackage.json'])) { $dp = json_decode($files['datapackage.json'], true); if (is_array($dp)) { $dp['name'] = 'ai-forecast-atlas-' . strtolower($id); $dp['title'] = 'AI Forecast Atlas weekly release ' . $id; $dp['version'] = $id; $files['datapackage.json'] = aim_json_encode($dp, true) . "\n"; } }
        $dir = aim_public('data/releases/' . $id);
        foreach ($files as $path => $content) aim_write($dir . '/' . $path, $content);
        $ds = json_decode($files['dataset.json'] ?? '{}', true) ?: [];
        aim_write($dir . '/index.html', aim_release_page($rel, array_keys($files)));
        // latest: overwrite file by file (each write is atomic)
        foreach ($files as $path => $content) aim_write(aim_public('data/latest/' . $path), $content);
        aim_write(aim_public('data/latest/release.js'), "window.AIMONITOR_DATA = " . aim_json_encode(['release' => aim_release_lite($rel), 'dataset' => $ds]) . ";\n");
        // index
        $idx = aim_releases_index();
        $idx['releases'] = array_values(array_filter($idx['releases'], fn($e) => ($e['id'] ?? '') !== $id));
        array_unshift($idx['releases'], ['id' => $id, 'publishedAt' => $rel['publishedAt'], 'asOf' => $rel['asOf'] ?? null, 'summary' => $rel['summary'] ?? '', 'changes' => count($rel['changes'] ?? []), 'carryForward' => !empty($rel['carryForward']), 'base' => !empty($rel['base']), 'url' => 'data/releases/' . $id . '/']);
        $idx['updated'] = aim_iso($now);
        $idx['next'] = aim_iso($next);
        aim_write_json(aim_public('data/releases/index.json'), $idx, true);
        aim_write_feeds();
        aim_discovery_on_publish($rel);
        aim_state_set(['lastRelease' => $id, 'lastReleaseAt' => aim_iso($now), 'lastReleaseSource' => $source]);
        aim_write_status();
        if ($source === 'staged') aim_unstage($stagedId ?: $id);
        aim_log('release', 'published', ['id' => $id, 'source' => $source, 'by' => $by]);
        if (function_exists('aim_nl_queue')) aim_nl_queue($rel);
        if (function_exists('aim_admin_notify')) aim_admin_notify('AI Forecast Atlas: release ' . $id . ' published', ($rel['summary'] ?? '') . "\n\n" . aim_site_url('data/releases/' . $id . '/'));
        return ['ok' => true, 'id' => $id, 'source' => $source];
    });
}
/** Friday release: publish this week's staged build, else carry the last release forward. */
function aim_publish_scheduled(): array
{
    $now = aim_now();
    $id = aim_week_id($now);
    $st = aim_state();
    if (($st['lastScheduledWeek'] ?? '') === $id) return ['ok' => true, 'skipped' => 'already published'];
    $staged = aim_staged_ids();
    $use = null;
    foreach (array_reverse($staged) as $sid) if (strcmp(substr($sid, 0, 8), $id) <= 0) { $use = $sid; break; }
    $r = $use ? aim_publish($id, 'staged', $use) : aim_publish($id, 'carry');
    if (!empty($r['ok'])) aim_state_set(['lastScheduledWeek' => $id]);
    return $r;
}
/** Manual publication from the admin page (keeps the Friday schedule intact). */
function aim_publish_now(string $stagedId): array
{
    if (!in_array($stagedId, aim_staged_ids(), true)) return ['ok' => false, 'error' => 'No staged build with this id.'];
    $week = aim_week_id(aim_now());
    $idx = aim_releases_index();
    $have = array_column($idx['releases'], 'id');
    $id = $week; $n = 0;
    while (in_array($id, $have, true)) { $n++; $id = $week . '.' . $n; }
    $r = aim_publish($id, 'staged', $stagedId, 'admin');
    if (!empty($r['ok']) && $id === $week) aim_state_set(['lastScheduledWeek' => $week]);
    return $r;
}
function aim_write_status(array $extra = []): void
{
    $st = aim_state();
    $status = array_merge([
        'schema' => 'aimonitor.status/1', 'updated' => aim_iso(), 'lastRelease' => $st['lastRelease'] ?? null, 'lastReleaseAt' => $st['lastReleaseAt'] ?? null,
        'nextRelease' => aim_iso(aim_next_release()), 'lastCheck' => $st['lastCollectAt'] ?? null, 'observations' => aim_store_read('observations', []) ?: [],
    ], $extra);
    aim_write_json(aim_public('data/status.json'), $status, true);
}
/** Plain-language label of how a value entered the data. */
function aim_via_text(array $c): string
{
    $v = is_array($c['via'] ?? null) ? $c['via'] : [];
    $t = ['api' => 'official data interface', 'ai' => 'AI-assisted research, reviewed by the team', 'ai-knowledge' => 'AI knowledge without a specific source, reviewed by the team', 'manual' => 'entered by the team', 'desk' => 'desk research', 'assumption' => 'assumption', 'model' => 'model construct'][$v['type'] ?? ''] ?? '';
    if ($t === '') return '';
    $p = is_array($v['panel'] ?? null) ? $v['panel'] : null;
    if ($p) {
        $t = ($v['type'] === 'ai-knowledge' ? 'AI research panel, lead answer from AI knowledge without a specific source' : 'AI research panel') . ', reviewed by the team: ' . (int)($p['answered'] ?? 0) . ' of ' . (int)($p['asked'] ?? 0) . ' agents answered';
        $valEdited = preg_match('/value/', (string)($v['edited'] ?? '')) === 1;
        if (!empty($v['model'])) $t .= $valEdited ? ', value set by the reviewer, source from ' . $v['model'] : ', value and source from ' . $v['model'];
        $nums = array_filter($p['members'] ?? [], fn($m) => array_key_exists('agrees', $m));
        if ($nums) $t .= '; ' . count(array_filter($nums, fn($m) => !empty($m['agrees']))) . ' of ' . count($nums) . ' agree within ±' . round(100 * (float)($p['tol'] ?? 0.1)) . '%';
    } elseif (!empty($v['model'])) $t .= ' (' . $v['model'] . ')';
    if (!$p && is_array($v['check'] ?? null) && array_key_exists('agree', $v['check'])) $t .= '; second opinion' . (!empty($v['check']['by']) ? ' by ' . $v['check']['by'] : '') . ': ' . (!empty($v['check']['agree']) ? 'agrees' : 'disagrees');
    if (!empty($v['edited'])) $t .= '; ' . lcfirst((string)$v['edited']);
    if (!empty($c['reviewed'])) $t .= '; reviewed ' . $c['reviewed'];
    return $t;
}
function aim_release_page(array $r, array $files): string
{
    $s = aim_settings();
    $home = rtrim((string)$s['site']['url'], '/') . '/';
    $H = aim_h($home);
    $rows = '';
    foreach ($r['changes'] ?? [] as $c) {
        $src = !empty($c['url']) && aim_url_ok((string)$c['url']) ? '<a href="' . aim_h($c['url']) . '" rel="noopener">' . aim_h($c['src'] ?? 'source') . '</a>' : aim_h($c['src'] ?? '');
        $more = '';
        if (!empty($c['quote'])) $more .= '<blockquote>“' . aim_h($c['quote']) . '”</blockquote>';
        $refs = array_values(array_filter(is_array($c['refs'] ?? null) ? $c['refs'] : [], fn($x) => is_array($x) && aim_url_ok((string)($x['url'] ?? ''))));
        if ($refs) $more .= '<p class="small">Also: ' . implode(' · ', array_map(fn($x) => '<a href="' . aim_h($x['url']) . '" rel="noopener">' . aim_h($x['title'] ?? $x['url']) . '</a>', array_slice($refs, 0, 6))) . '</p>';
        $via = aim_via_text($c);
        if ($via !== '') $more .= '<p class="small">How it entered the data: ' . aim_h($via) . '</p>';
        $pm = is_array($c['via']['panel']['members'] ?? null) ? $c['via']['panel']['members'] : [];
        if ($pm) {
            $li = '';
            foreach ($pm as $m) {
                $what = ($m['v'] ?? '') !== '' ? $m['v'] : (!empty($m['none']) ? 'nothing newer' : '—');
                $memberSource = !empty($m['url']) && aim_url_ok((string)$m['url']) ? ' · <a href="' . aim_h($m['url']) . '" rel="noopener">' . aim_h($m['title'] ?? 'source') . '</a>' : (($m['basis'] ?? '') === 'knowledge' && ($m['v'] ?? '') !== '' ? ' · AI knowledge' : '');
                $li .= '<li>' . aim_h(($m['agent'] ?? '') . ' ' . ($m['model'] ?? '')) . ' (weight ' . (int)($m['w'] ?? 0) . '): ' . aim_h($what) . $memberSource . (!empty($m['lead']) ? ' · <b>published</b>' : (array_key_exists('agrees', $m) ? ($m['agrees'] ? ' · agrees' : ' · differs') : '')) . '</li>';
            }
            $more .= '<details class="small"><summary>Answers of the AI research panel</summary><ul>' . $li . '</ul></details>';
        }
        $name = !empty($c['id']) ? '<a href="' . $H . '#src-' . aim_h($c['id']) . '">' . aim_h($c['name'] ?? $c['id']) . '</a>' : aim_h($c['name'] ?? '');
        $rows .= '<tr><td>' . $name . '</td><td>' . aim_h($c['fromText'] ?? '') . '</td><td>' . aim_h($c['toText'] ?? '') . '</td><td>' . $src . $more . '</td></tr>';
    }
    $dl = '';
    foreach ($files as $f) if (preg_match(AIM_RELEASE_FILE_RX, $f)) $dl .= '<li><a href="' . aim_h(aim_site_url('data/releases/' . $r['id'] . '/' . $f)) . '">' . aim_h($f) . '</a></li>';
    $hl = '';
    foreach ($r['highlights'] ?? [] as $h) $hl .= '<li>' . aim_h($h) . '</li>';
    $xw = '';
    foreach ((is_array($r['xwatch'] ?? null) ? $r['xwatch'] : []) as $x) {
        $posts = implode(' · ', array_map(fn($p) => aim_url_ok((string)($p['url'] ?? '')) ? '<a href="' . aim_h($p['url']) . '" rel="noopener">@' . aim_h($p['handle'] ?? '') . '</a>' . (!empty($p['kind']) ? ' (' . aim_h($p['kind']) . ')' : '') : '', is_array($x['posts'] ?? null) ? $x['posts'] : []));
        $refs = implode(' · ', array_map(fn($p) => aim_url_ok((string)($p['url'] ?? '')) ? '<a href="' . aim_h($p['url']) . '" rel="noopener">' . aim_h($p['title'] ?? $p['url']) . '</a>' : '', is_array($x['refs'] ?? null) ? $x['refs'] : []));
        $xw .= '<li><b>' . aim_h((string)($x['title'] ?? '')) . '</b> <span class="small">credibility ' . aim_h((string)($x['credibility'] ?? '')) . ' · impact on X ' . aim_h((string)($x['impact'] ?? '')) . ' · ' . aim_h((string)($x['date'] ?? '')) . '</span>'
            . '<p class="small">' . aim_h((string)($x['summary'] ?? '')) . (!empty($x['why']) ? ' <i>Why it matters:</i> ' . aim_h((string)$x['why']) : '') . '</p>'
            . '<p class="small">Posts: ' . $posts . ($refs !== '' ? ' · Also: ' . $refs : '') . '</p></li>';
    }
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Forecast Atlas release ' . aim_h($r['id']) . '</title>'
        . '<meta name="description" content="' . aim_h(mb_substr((string)($r['summary'] ?? ''), 0, 200)) . '"><link rel="icon" href="' . $H . 'favicon.svg" type="image/svg+xml">'
        . aim_discovery_head('AI Forecast Atlas release ' . $r['id'], mb_substr((string)($r['summary'] ?? ''), 0, 200), 'releases/' . $r['id'] . '/', $r, 'Report')
        . '<style>:root{--bg:#f3f2ed;--ink:#17171a;--ink2:#43413c;--rule:#dfdcd2;--a:#9c5500;color-scheme:light}@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--ink:#f1efe8;--ink2:#c9c6bc;--rule:#2a2a2e;--a:#f5a524;color-scheme:dark}}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}main{max-width:860px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left,0px)) 40px max(16px,env(safe-area-inset-right,0px))}a{color:var(--a)}p,li{color:var(--ink2)}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}.tw{overflow-x:auto}h1{text-wrap:balance}blockquote{margin:6px 0;padding-left:10px;border-left:3px solid var(--rule);color:var(--ink2);font-size:13px}.small{font-size:12.5px;margin:4px 0}</style></head><body><main>'
        . '<p><a href="' . $H . '">AI Forecast Atlas</a> · ' . aim_discovery_link('releases/', 'All releases') . ' · ' . aim_discovery_link('methodology/', 'Sources and methods') . '</p>'
        . '<h1>Weekly release ' . aim_h($r['id']) . '</h1><p>Published ' . aim_h(aim_date_l($r['publishedAt'] ?? aim_iso(), 'en', true)) . ' · data to ' . aim_h((string)($r['asOf'] ?? '')) . ' · engine ' . aim_h((string)($r['engine'] ?? '')) . '</p>'
        . '<p>' . aim_h((string)($r['summary'] ?? '')) . '</p>'
        . (!empty($r['notes']) ? '<h2>Editorial notes</h2><p>' . nl2br(aim_h((string)$r['notes'])) . '</p>' : '')
        . ($rows ? '<h2>What changed, and where it comes from</h2><div class="tw"><table><thead><tr><th>Measure</th><th>Was</th><th>Now</th><th>Source</th></tr></thead><tbody>' . $rows . '</tbody></table></div>' : '')
        . ($hl ? '<h2>How the scenarios moved</h2><ul>' . $hl . '</ul>' : '')
        . ($xw ? '<h2>X watch — posts the editor is watching</h2><p class="small">Found on X by Grok (xAI) with its X search, labelled for credibility and impact, approved by a person. Signals, not data: they do not change the model.</p><ul>' . $xw . '</ul>' : '')
        . '<h2>How values enter the data</h2><p>Official sources are read automatically every morning. Research questions go to a panel of AI agents (OpenAI, Anthropic Claude, Google Gemini, xAI Grok and DeepSeek); each answer names its source page and quotes it, or is marked as the model’s own knowledge, and the answers are combined by weighted median. Nothing is published until a person has reviewed it (<a href="' . $H . '#verify">how we verify</a>). Every starting value, with its source, link, quote and derivation, is listed in ' . aim_discovery_link('data/releases/' . $r['id'] . '/dataset.json', 'dataset.json') . ' and on the dashboard under <a href="' . $H . '#sources">Sources &amp; methods</a>; the formulas behind the scenario paths are under <a href="' . $H . '#method-K">Methods</a>.</p>'
        . '<h2>Files</h2><ul>' . $dl . '</ul><p>Licence: CC BY 4.0 — credit “AI Forecast Atlas by Creoox AG”, aiforecastatlas.com, release ' . aim_h($r['id']) . '. A scenario model, not a forecast and not investment advice.</p>'
        . aim_discovery_footer($r) . '</main></body></html>';
}
function aim_write_sitemap(): void
{
    $base = rtrim(aim_settings()['site']['url'], '/') . '/';
    $b = aim_discovery_latest();
    $r = $b['release'] ?? [];
    $date = aim_discovery_date($r);
    $urls = [$base => $date];
    foreach (['privacy.php', 'imprint.php'] as $path) if (is_file(aim_public($path))) $urls[$base . $path] = date(DATE_ATOM, filemtime(aim_public($path)));
    $paths = ['scenarios/', 'measures/', 'releases/', 'about/', 'faq/', 'methodology/'];
    foreach ($b['scenarios'] ?? [] as $s) $paths[] = aim_discovery_scenario_path($s['key']);
    foreach ($b['metrics'] ?? [] as $key => $m) $paths[] = aim_discovery_measure_path($key);
    foreach ($paths as $path) if (is_file(aim_public($path . 'index.html'))) $urls[$base . $path] = $date;
    foreach (aim_discovery_published_ids() as $id) {
        $path = 'releases/' . $id . '/';
        if (!is_file(aim_public($path . 'index.html'))) continue;
        $rel = aim_read_json(aim_public('data/releases/' . $id . '/release.json'), []);
        $urls[$base . $path] = aim_discovery_date(is_array($rel) ? $rel : []);
    }
    $x = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as $u => $modified) $x .= '  <url><loc>' . aim_h($u) . '</loc>' . ($modified !== '' ? '<lastmod>' . aim_h($modified) . '</lastmod>' : '') . '</url>' . "\n";
    aim_write(aim_public('sitemap.xml'), $x . "</urlset>\n");
    $robots = '# Search and training crawlers are welcome to public content. Published data: CC BY 4.0.' . "\n";
    foreach (['*', 'GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'PerplexityBot'] as $bot) $robots .= 'User-agent: ' . $bot . "\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /_private/\nDisallow: /check.php\n\n";
    aim_write(aim_public('robots.txt'), $robots . 'Sitemap: ' . $base . "sitemap.xml\n");
}
