<?php
/* AI Forecast Atlas — loads the server library. Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */
if (PHP_VERSION_ID < 80000) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'AI Forecast Atlas needs PHP 8.0 or newer; this server runs PHP ' . PHP_VERSION . '. See the installation guide, step "PHP version".';
    exit;
}
date_default_timezone_set('Europe/Zurich');
@ini_set('display_errors', '0');
error_reporting(E_ALL);
foreach (['util', 'settings', 'http', 'security', 'i18n', 'pages', 'llm', 'chat', 'mailjet', 'subscriptions', 'publish', 'feeds', 'newsletter', 'collectors', 'review', 'xwatch', 'cron', 'admin_api', 'mcp'] as $aim_lib) {
    require_once __DIR__ . '/' . $aim_lib . '.php';
}
unset($aim_lib);
set_exception_handler(function (Throwable $e) {
    aim_log('error', get_class($e) . ': ' . $e->getMessage(), ['at' => basename($e->getFile()) . ':' . $e->getLine()]);
    if (!headers_sent()) {
        http_response_code(500);
        $json = str_contains((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'json') || str_contains((string)($_SERVER['REQUEST_URI'] ?? ''), '/api/');
        header('Content-Type: ' . ($json ? 'application/json' : 'text/plain') . '; charset=utf-8');
        echo $json ? '{"ok":false,"error":{"code":"server","message":"Server error. The administrator can see the details in the admin page logs."}}' : 'Server error. Details are in the AI Forecast Atlas error log.';
    }
});
