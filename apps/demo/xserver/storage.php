<?php
// Storage gateway only. No membership, generation, lottery or application DB.
declare(strict_types=1);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function fail(int $status): void { http_response_code($status); exit; }
$configPath = __DIR__ . '/.storage-config.php';
if (!is_file($configPath)) fail(503);
$config = require $configPath;
$secret = $config['secret'] ?? '';
$root = $config['directory'] ?? '';
if (!preg_match('/^[a-f0-9]{64}$/D', $secret) || !is_dir($root)) fail(503);
$realRoot = realpath($root);
$publicRoot = realpath($_SERVER['DOCUMENT_ROOT']);
if (!$realRoot || !$publicRoot || $realRoot === $publicRoot || str_starts_with($realRoot, $publicRoot . DIRECTORY_SEPARATOR)) fail(503);
$method = $_SERVER['REQUEST_METHOD'];
$key = $_GET['key'] ?? '';
if (!is_string($key) || !preg_match('#^(photos/[a-f0-9]{64}/\d{4}-\d{2}-\d{2}(/[a-f0-9]{64})?|works/[A-Z0-9]{8}/\d{4}-\d{2}-\d{2}|global/\d{4}-\d{2}-\d{2}/[a-f0-9]{64})$#D', $key)) fail(400);
if (!in_array($method, ['GET', 'PUT'], true)) fail(405);
$timestamp = $_SERVER['HTTP_X_SCHIILD_TIME'] ?? '';
$signature = $_SERVER['HTTP_X_SCHIILD_SIGNATURE'] ?? '';
if (!ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 60 || !preg_match('/^[a-f0-9]{64}$/D', $signature)) fail(403);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 3000000) fail(413);
$body = file_get_contents('php://input', false, null, 0, 3000001);
if ($body === false || strlen($body) > 3000000 || ($method === 'GET' && $body !== '')) fail(413);
$expected = hash_hmac('sha256', "$method\n$key\n$timestamp\n" . hash('sha256', $body), $secret);
if (!hash_equals($expected, $signature)) fail(403);
$file = $realRoot . '/' . hash('sha256', $key) . '.image';
if ($method === 'GET') {
 if (!is_file($file)) fail(404);
 header('Content-Type: application/octet-stream');
 header('Content-Length: ' . filesize($file));
 readfile($file); exit;
}
$size = @getimagesizefromstring($body);
$photo = str_starts_with($key, 'photos/');
$dimension = $photo ? 1080 : (str_starts_with($key, 'global/') ? 256 : 128);
if (!$size || $size[0] !== $dimension || $size[1] !== $dimension || $size[2] !== ($photo ? IMAGETYPE_JPEG : IMAGETYPE_PNG)) fail(400);
$lock = fopen($file . '.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) fail(503);
if (is_file($file)) { flock($lock, LOCK_UN); fclose($lock); http_response_code(200); exit; }
$temp = tempnam($realRoot, '.upload-');
if (!$temp || file_put_contents($temp, $body) !== strlen($body) || !chmod($temp, 0600) || !rename($temp, $file)) { if ($temp) @unlink($temp); fail(503); }
flock($lock, LOCK_UN); fclose($lock);
http_response_code(201);
