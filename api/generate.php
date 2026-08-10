<?php
declare(strict_types=1);

// ── Security headers ──────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

// ── Helpers ───────────────────────────────────────────────────────────────────

function api_error(int $code, string $message): never {
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}

function boolv(mixed $value, bool $default = false): bool {
    if (!isset($value)) return $default;
    return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
}

function intv(mixed $value, int $default, int $min, int $max): int {
    if (!isset($value) || !is_numeric($value)) return $default;
    $n = (int) $value;
    return ($n >= $min && $n <= $max) ? $n : $default;
}

/**
 * Cryptographically secure random integer in [0, $maxExclusive).
 * Uses rejection sampling to eliminate modulo bias, matching the JS implementation.
 */
function secure_random_int(int $maxExclusive): int {
    if ($maxExclusive < 2) return 0;
    $bytesNeeded = (int) ceil(log($maxExclusive, 2) / 8) ?: 1;
    $maxValue = (int) pow(256, $bytesNeeded);
    $limit = $maxValue - ($maxValue % $maxExclusive);
    do {
        $buf = random_bytes($bytesNeeded);
        $value = 0;
        for ($i = 0; $i < $bytesNeeded; $i++) {
            $value = $value * 256 + ord($buf[$i]);
        }
    } while ($value >= $limit);
    return $value % $maxExclusive;
}

/**
 * Fisher-Yates shuffle using secure_random_int.
 */
function secure_shuffle(array &$arr): void {
    for ($i = count($arr) - 1; $i > 0; $i--) {
        $j = secure_random_int($i + 1);
        [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
    }
}

// ── Rate limiting (file-based, server-side only) ──────────────────────────────

function rate_limit_check(): void {
    $ip        = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
    $dir       = sys_get_temp_dir() . '/woolkey_rl';
    $file      = $dir . '/' . $ip;
    $window    = 60;   // seconds
    $maxReqs   = 20;   // per window

    if (!is_dir($dir)) mkdir($dir, 0700, true);

    $now  = time();
    $data = [];

    if (file_exists($file)) {
        $raw = @file_get_contents($file);
        if ($raw !== false) {
            $data = array_filter(
                json_decode($raw, true) ?: [],
                fn($t) => ($now - $t) < $window
            );
        }
    }

    if (count($data) >= $maxReqs) {
        api_error(429, 'Too many requests. Try again in a moment.');
    }

    $data[] = $now;
    @file_put_contents($file, json_encode(array_values($data)), LOCK_EX);
}

// ── Auth token check ──────────────────────────────────────────────────────────

function auth_check(): void {
    $configFile = __DIR__ . '/config.php';
    if (!file_exists($configFile)) {
        // No config = open access (dev/demo mode).
        return;
    }
    $config = require $configFile;
    if (empty($config['api_token'])) return;

    $provided = '';
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['HTTP_X_API_KEY'] ?? '';
    if (str_starts_with($header, 'Bearer ')) {
        $provided = substr($header, 7);
    } elseif (!empty($_SERVER['HTTP_X_API_KEY'])) {
        $provided = $_SERVER['HTTP_X_API_KEY'];
    }

    if (!hash_equals($config['api_token'], $provided)) {
        api_error(401, 'Unauthorized');
    }
}

// ── Word list ─────────────────────────────────────────────────────────────────

function load_words(): array {
    static $words = null;
    if ($words !== null) return $words;

    $js  = @file_get_contents(__DIR__ . '/../data/words.js');
    if ($js === false) return [];

    // Extract the array literal between the outer [ ]
    if (!preg_match('/\[\s*("(?:[^"\\\\]|\\\\.)*"(?:\s*,\s*"(?:[^"\\\\]|\\\\.)*")*\s*)\]/s', $js, $m)) {
        return [];
    }
    preg_match_all('/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"/', $m[1], $wm);
    $words = $wm[1] ?? [];
    return $words;
}

// ── Generation ────────────────────────────────────────────────────────────────

function generate_password(array $opts): array {
    $length     = intv($opts['length']            ?? null, 24, 8, 128);
    $lower      = boolv($opts['includeLowercase'] ?? null, true);
    $upper      = boolv($opts['includeUppercase'] ?? null, true);
    $numbers    = boolv($opts['includeNumbers']   ?? null, true);
    $symbols    = boolv($opts['includeSymbols']   ?? null, false);
    $noAmbig    = boolv($opts['avoidAmbiguous']   ?? null, false);
    $excluded   = isset($opts['excludedCharacters']) ? (string) $opts['excludedCharacters'] : '';

    $ambiguous  = '0O1Il5S8B';
    $excluded_chars = array_flip(str_split($excluded . ($noAmbig ? $ambiguous : '')));

    $filter = fn(string $s) => implode('', array_filter(str_split($s), fn($c) => !isset($excluded_chars[$c])));

    $sets = [
        'lowercase' => 'abcdefghijklmnopqrstuvwxyz',
        'uppercase' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'numbers'   => '0123456789',
        'symbols'   => '!@#$%^&*()-_=+[]{};:,.?',
    ];

    $groups = [];
    if ($lower)   { $s = $filter($sets['lowercase']); if (strlen($s) > 0) $groups[] = $s; }
    if ($upper)   { $s = $filter($sets['uppercase']); if (strlen($s) > 0) $groups[] = $s; }
    if ($numbers) { $s = $filter($sets['numbers']);   if (strlen($s) > 0) $groups[] = $s; }
    if ($symbols) { $s = $filter($sets['symbols']);   if (strlen($s) > 0) $groups[] = $s; }

    if (empty($groups)) api_error(400, 'At least one character group must be enabled');
    if ($length < count($groups)) api_error(400, 'Password length too short for selected character groups');

    $fullPool = implode('', $groups);
    $chars    = [];

    // Guarantee at least one char from each group
    foreach ($groups as $group) {
        $chars[] = $group[secure_random_int(strlen($group))];
    }

    // Fill remaining from full pool
    while (count($chars) < $length) {
        $chars[] = $fullPool[secure_random_int(strlen($fullPool))];
    }

    secure_shuffle($chars);
    $value    = implode('', $chars);
    $poolSize = strlen($fullPool);
    $bits     = $length * log($poolSize, 2);

    return ['value' => $value, 'poolSize' => $poolSize, 'bits' => $bits];
}

function generate_passphrase(array $opts): array {
    $wordCount  = intv($opts['wordCount']    ?? null, 4, 4, 8);
    $sep_key    = isset($opts['separator']) ? (string) $opts['separator'] : 'hyphen';
    $capitalize = boolv($opts['capitalize'] ?? null, false);
    $addNumber  = boolv($opts['addNumber']  ?? null, false);

    $separators = ['hyphen' => '-', 'underscore' => '_', 'dot' => '.', 'space' => ' '];
    $sep        = $separators[$sep_key] ?? '-';

    $wordList = load_words();
    if (count($wordList) < 2) api_error(500, 'Word list unavailable');

    $words = [];
    for ($i = 0; $i < $wordCount; $i++) {
        $word    = $wordList[secure_random_int(count($wordList))];
        $words[] = $capitalize ? ucfirst($word) : $word;
    }

    $phrase = implode($sep, $words);
    if ($addNumber) {
        $phrase .= $sep . str_pad((string) secure_random_int(100), 2, '0', STR_PAD_LEFT);
    }

    $bits = $wordCount * log(count($wordList), 2);
    return ['value' => $phrase, 'wordCount' => $wordCount, 'wordListSize' => count($wordList), 'bits' => $bits];
}

function strength_label(float $bits): array {
    if ($bits < 40)  return ['label' => 'Weak',        'level' => 0];
    if ($bits < 60)  return ['label' => 'Fair',        'level' => 1];
    if ($bits < 80)  return ['label' => 'Strong',      'level' => 2];
    if ($bits < 100) return ['label' => 'Very strong', 'level' => 3];
    return                   ['label' => 'Excellent',  'level' => 4];
}

// ── Request handling ──────────────────────────────────────────────────────────

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    api_error(405, 'Method not allowed');
}

rate_limit_check();
auth_check();

$raw   = file_get_contents('php://input');
$input = json_decode($raw ?: '{}', true);
if (!is_array($input)) api_error(400, 'Invalid JSON body');

$mode = (string) ($input['mode'] ?? '');
if ($mode !== 'password' && $mode !== 'passphrase') {
    api_error(400, 'mode must be "password" or "passphrase"');
}

$opts = is_array($input['options'] ?? null) ? $input['options'] : [];

if ($mode === 'password') {
    $gen      = generate_password($opts);
    $strength = strength_label($gen['bits']);
    echo json_encode([
        'mode'     => $mode,
        'value'    => $gen['value'],
        'entropy'  => [
            'bits'  => round($gen['bits'], 2),
            'label' => $strength['label'],
            'level' => $strength['level'],
        ],
        'metadata' => [
            'entropyMode' => 'system',
            'poolSize'    => $gen['poolSize'],
            'length'      => strlen($gen['value']),
        ],
    ]);
} else {
    $gen      = generate_passphrase($opts);
    $strength = strength_label($gen['bits']);
    echo json_encode([
        'mode'     => $mode,
        'value'    => $gen['value'],
        'entropy'  => [
            'bits'  => round($gen['bits'], 2),
            'label' => $strength['label'],
            'level' => $strength['level'],
        ],
        'metadata' => [
            'entropyMode'  => 'system',
            'wordCount'    => $gen['wordCount'],
            'wordListSize' => $gen['wordListSize'],
        ],
    ]);
}
