<?php
declare(strict_types=1);

/**
 * WoolKey credential generation endpoint.
 *
 * GET  /api/generate   → machine-readable capability descriptor (no auth)
 * GET  /api/health     → liveness probe (no auth)
 * POST /api/generate   → generate password(s) or passphrase(s) (auth required)
 *
 * Stateless. Nothing generated here is written to disk, logged, or retained.
 */

const WOOLKEY_API_VERSION = '1.1.0';

// Hosts that ship serialize_precision=17 render round($bits, 2) as
// 149.94999999999999 in JSON. -1 selects the shortest representation that
// round-trips, so entropy comes out as 149.95 everywhere.
ini_set('serialize_precision', '-1');

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Load config.php merged over defaults. Returns null when config.php is absent.
 */
function api_config(): ?array {
    static $config = false;
    if ($config !== false) return $config;

    $file = __DIR__ . '/config.php';
    if (!is_file($file)) return $config = null;

    $loaded = require $file;
    if (!is_array($loaded)) $loaded = [];

    $defaults = [
        'api_token'             => '',
        'allow_unauthenticated' => false,
        'allowed_origins'       => ['*'],
        'rate_limit'            => ['requests' => 20, 'window' => 60],
        'max_count'             => 20,
        'max_body_bytes'        => 16384,
    ];

    $merged = array_merge($defaults, $loaded);
    $merged['rate_limit'] = array_merge($defaults['rate_limit'], (array) ($loaded['rate_limit'] ?? []));
    if (!is_array($merged['allowed_origins'])) $merged['allowed_origins'] = ['*'];

    return $config = $merged;
}

/**
 * Config value with a fallback for when config.php does not exist yet
 * (GET routes stay usable so an agent can still discover the endpoint).
 */
function cfg(string $key, mixed $fallback): mixed {
    $config = api_config();
    return $config === null ? $fallback : ($config[$key] ?? $fallback);
}

// ── Headers ───────────────────────────────────────────────────────────────────

function send_base_headers(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('X-WoolKey-Version: ' . WOOLKEY_API_VERSION);
}

/**
 * CORS. Auth travels in a header rather than a cookie, so '*' is safe here —
 * a hostile page still cannot mint a valid request without the token.
 */
function send_cors_headers(): void {
    $allowed = cfg('allowed_origins', ['*']);
    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';

    header('Vary: Origin');
    if (in_array('*', $allowed, true)) {
        header('Access-Control-Allow-Origin: *');
    } elseif ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, Authorization');
    header('Access-Control-Expose-Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, X-WoolKey-Version');
    header('Access-Control-Max-Age: 600');
}

// ── Responses ─────────────────────────────────────────────────────────────────

function json_out(array $payload, int $code = 200): never {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * @param string $field Request field the caller should fix, '' when not applicable.
 */
function api_error(int $code, string $message, string $field = ''): never {
    $body = ['error' => $message, 'status' => $code];
    if ($field !== '') $body['field'] = $field;
    json_out($body, $code);
}

// ── Input validation ──────────────────────────────────────────────────────────
//
// Out-of-range values are rejected, never silently clamped. An agent that asks
// for a 200-character password must be told no, not handed a 24-character one
// it will assume is 200.

function want_int(array $src, string $key, int $default, int $min, int $max, string $path): int {
    if (!array_key_exists($key, $src) || $src[$key] === null) return $default;
    $value = $src[$key];
    if (is_bool($value) || !is_numeric($value) || (int) $value != $value) {
        api_error(400, "$path must be an integer", $path);
    }
    $n = (int) $value;
    if ($n < $min || $n > $max) {
        api_error(400, "$path must be between $min and $max", $path);
    }
    return $n;
}

function want_bool(array $src, string $key, bool $default, string $path): bool {
    if (!array_key_exists($key, $src) || $src[$key] === null) return $default;
    $value = filter_var($src[$key], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
    if ($value === null) api_error(400, "$path must be a boolean", $path);
    return $value;
}

function want_string(array $src, string $key, string $default, int $maxLen, string $path): string {
    if (!array_key_exists($key, $src) || $src[$key] === null) return $default;
    $value = $src[$key];
    if (!is_string($value)) api_error(400, "$path must be a string", $path);
    if (strlen($value) > $maxLen) api_error(400, "$path must be at most $maxLen characters", $path);
    return $value;
}

function want_enum(array $src, string $key, string $default, array $allowed, string $path): string {
    $value = want_string($src, $key, $default, 64, $path);
    if (!in_array($value, $allowed, true)) {
        api_error(400, "$path must be one of: " . implode(', ', $allowed), $path);
    }
    return $value;
}

// ── Randomness ────────────────────────────────────────────────────────────────
//
// random_int() is PHP's audited CSPRNG wrapper; it is already unbiased, so no
// hand-rolled rejection sampling is needed on this side.

function secure_index(int $countExclusive): int {
    return $countExclusive < 2 ? 0 : random_int(0, $countExclusive - 1);
}

function secure_shuffle(array &$arr): void {
    for ($i = count($arr) - 1; $i > 0; $i--) {
        $j = random_int(0, $i);
        [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
    }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

function rate_limit_dir(): string {
    return sys_get_temp_dir() . '/woolkey_rl';
}

/**
 * Drop stale buckets so the temp directory does not grow without bound.
 * Runs probabilistically to keep the common path cheap.
 */
function rate_limit_gc(int $window): void {
    if (random_int(1, 50) !== 1) return;
    $dir = rate_limit_dir();
    $cutoff = time() - ($window * 5);
    foreach (@glob($dir . '/*') ?: [] as $path) {
        if (@filemtime($path) < $cutoff) @unlink($path);
    }
}

function rate_limit_check(): void {
    $limits  = cfg('rate_limit', ['requests' => 20, 'window' => 60]);
    $maxReqs = max(1, (int) ($limits['requests'] ?? 20));
    $window  = max(1, (int) ($limits['window'] ?? 60));

    $dir = rate_limit_dir();
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    rate_limit_gc($window);

    $file = $dir . '/' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
    $now  = time();
    $hits = [];

    if (is_file($file)) {
        $raw = @file_get_contents($file);
        if ($raw !== false) {
            $hits = array_filter(
                json_decode($raw, true) ?: [],
                fn($t) => is_int($t) && ($now - $t) < $window
            );
        }
    }

    $oldest    = $hits === [] ? $now : min($hits);
    $resetIn   = max(1, $window - ($now - $oldest));
    $remaining = max(0, $maxReqs - count($hits) - 1);

    header('X-RateLimit-Limit: ' . $maxReqs);
    header('X-RateLimit-Remaining: ' . $remaining);
    header('X-RateLimit-Reset: ' . $resetIn);

    if (count($hits) >= $maxReqs) {
        header('Retry-After: ' . $resetIn);
        api_error(429, "Rate limit exceeded: $maxReqs requests per $window seconds. Retry in {$resetIn}s.");
    }

    $hits[] = $now;
    @file_put_contents($file, json_encode(array_values($hits)), LOCK_EX);
}

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Read the Authorization header.
 *
 * Apache does not hand this to PHP by default — under cPanel it arrives only if
 * CGIPassAuth is on, and a mod_rewrite passthrough lands it in
 * REDIRECT_HTTP_AUTHORIZATION instead. Check every location so
 * "Authorization: Bearer <token>" works regardless of host configuration.
 */
function authorization_header(): string {
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($_SERVER[$key])) return (string) $_SERVER[$key];
    }
    if (function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) return (string) $value;
        }
    }
    return '';
}

function auth_check(): void {
    $config = api_config();

    if ($config === null) {
        api_error(503, 'API not configured. Copy api/config.example.php to api/config.php and set an api_token.');
    }

    $token = (string) $config['api_token'];

    if ($token === '') {
        if ($config['allow_unauthenticated'] === true) return;
        api_error(503, 'API not configured. Set api_token in api/config.php, or set allow_unauthenticated => true for local development.');
    }

    $provided = '';
    if (!empty($_SERVER['HTTP_X_API_KEY'])) {
        $provided = (string) $_SERVER['HTTP_X_API_KEY'];
    } else {
        $header = authorization_header();
        if (stripos($header, 'Bearer ') === 0) $provided = substr($header, 7);
    }

    if ($provided === '' || !hash_equals($token, $provided)) {
        header('WWW-Authenticate: Bearer realm="WoolKey"');
        api_error(401, 'Unauthorized. Send the token as "X-Api-Key: <token>" or "Authorization: Bearer <token>".');
    }
}

// ── Word list ─────────────────────────────────────────────────────────────────

function load_words(): array {
    static $words = null;
    if ($words !== null) return $words;

    $js = @file_get_contents(__DIR__ . '/../data/words.js');
    if ($js === false) return $words = [];

    // data/words.js is a classic script declaring `var WORDS = [ "..." , ... ];`
    $start = strpos($js, '[');
    $end   = strrpos($js, ']');
    if ($start === false || $end === false || $end <= $start) return $words = [];

    preg_match_all('/"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"/', substr($js, $start, $end - $start), $matches);
    return $words = $matches[1] ?? [];
}

// ── Generation ────────────────────────────────────────────────────────────────

const PW_CHAR_SETS = [
    'lowercase' => 'abcdefghijklmnopqrstuvwxyz',
    'uppercase' => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'numbers'   => '0123456789',
    'symbols'   => '!@#$%^&*()-_=+[]{};:,.?',
];
const PW_AMBIGUOUS  = '0O1Il5S8B';
const PP_SEPARATORS = ['hyphen' => '-', 'underscore' => '_', 'dot' => '.', 'space' => ' '];

/**
 * Resolve password options once so a batch does not re-validate per item.
 */
function password_plan(array $opts): array {
    $length   = want_int($opts, 'length', 24, 8, 128, 'options.length');
    $lower    = want_bool($opts, 'includeLowercase', true,  'options.includeLowercase');
    $upper    = want_bool($opts, 'includeUppercase', true,  'options.includeUppercase');
    $numbers  = want_bool($opts, 'includeNumbers',   true,  'options.includeNumbers');
    $symbols  = want_bool($opts, 'includeSymbols',   false, 'options.includeSymbols');
    $noAmbig  = want_bool($opts, 'avoidAmbiguous',   false, 'options.avoidAmbiguous');
    $excluded = want_string($opts, 'excludedCharacters', '', 128, 'options.excludedCharacters');

    $drop   = array_flip(str_split($excluded . ($noAmbig ? PW_AMBIGUOUS : '') ?: ' '));
    $filter = fn(string $s) => implode('', array_filter(str_split($s), fn($c) => !isset($drop[$c])));

    $groups = [];
    foreach (['lowercase' => $lower, 'uppercase' => $upper, 'numbers' => $numbers, 'symbols' => $symbols] as $name => $enabled) {
        if (!$enabled) continue;
        $set = $filter(PW_CHAR_SETS[$name]);
        if ($set !== '') $groups[] = $set;
    }

    if ($groups === []) {
        api_error(400, 'At least one character group must be enabled and not fully excluded', 'options');
    }
    if ($length < count($groups)) {
        api_error(400, 'options.length is too short to include one character from every enabled group', 'options.length');
    }

    $pool = implode('', $groups);
    return [
        'length'   => $length,
        'groups'   => $groups,
        'pool'     => $pool,
        'poolSize' => strlen($pool),
        'bits'     => $length * log(strlen($pool), 2),
    ];
}

function password_from_plan(array $plan): string {
    $chars = [];
    // Guarantee at least one character from each enabled group.
    foreach ($plan['groups'] as $group) {
        $chars[] = $group[secure_index(strlen($group))];
    }
    while (count($chars) < $plan['length']) {
        $chars[] = $plan['pool'][secure_index($plan['poolSize'])];
    }
    secure_shuffle($chars);
    return implode('', $chars);
}

function passphrase_plan(array $opts): array {
    $wordCount  = want_int($opts, 'wordCount', 4, 4, 8, 'options.wordCount');
    $separator  = want_enum($opts, 'separator', 'hyphen', array_keys(PP_SEPARATORS), 'options.separator');
    $capitalize = want_bool($opts, 'capitalize', false, 'options.capitalize');
    $addNumber  = want_bool($opts, 'addNumber',  false, 'options.addNumber');

    $words = load_words();
    if (count($words) < 2) api_error(500, 'Word list unavailable');

    return [
        'wordCount'    => $wordCount,
        'separator'    => PP_SEPARATORS[$separator],
        'capitalize'   => $capitalize,
        'addNumber'    => $addNumber,
        'words'        => $words,
        'wordListSize' => count($words),
        'bits'         => $wordCount * log(count($words), 2),
    ];
}

function passphrase_from_plan(array $plan): string {
    $picked = [];
    for ($i = 0; $i < $plan['wordCount']; $i++) {
        $word = $plan['words'][secure_index($plan['wordListSize'])];
        $picked[] = $plan['capitalize'] ? ucfirst($word) : $word;
    }
    $phrase = implode($plan['separator'], $picked);
    if ($plan['addNumber']) {
        $phrase .= $plan['separator'] . str_pad((string) secure_index(100), 2, '0', STR_PAD_LEFT);
    }
    return $phrase;
}

function strength_label(float $bits): array {
    if ($bits < 40)  return ['label' => 'Weak',        'level' => 0];
    if ($bits < 60)  return ['label' => 'Fair',        'level' => 1];
    if ($bits < 80)  return ['label' => 'Strong',      'level' => 2];
    if ($bits < 100) return ['label' => 'Very strong', 'level' => 3];
    return                   ['label' => 'Excellent',  'level' => 4];
}

// ── Capability descriptor ─────────────────────────────────────────────────────

function base_path(): string {
    $self = $_SERVER['SCRIPT_NAME'] ?? '/api/generate.php';
    return rtrim(str_replace('/generate.php', '', $self), '/');
}

function descriptor(): array {
    $base    = base_path();
    $limits  = cfg('rate_limit', ['requests' => 20, 'window' => 60]);
    $secured = ($c = api_config()) !== null && (string) $c['api_token'] !== '';

    return [
        'name'        => 'WoolKey Credential Generator',
        'version'     => WOOLKEY_API_VERSION,
        'description' => 'Generates cryptographically secure passwords and passphrases. Stateless: no credential is stored, logged, or retained.',
        'openapi'     => $base . '/openapi.json',
        'stateless'   => true,
        'storage'     => 'none',
        'auth'        => [
            'required' => $secured,
            'scheme'   => 'api-key',
            'headers'  => ['X-Api-Key: <token>', 'Authorization: Bearer <token>'],
        ],
        'endpoints' => [
            ['method' => 'GET',  'path' => $base . '/generate', 'auth' => false, 'description' => 'This descriptor'],
            ['method' => 'GET',  'path' => $base . '/health',   'auth' => false, 'description' => 'Liveness probe'],
            ['method' => 'POST', 'path' => $base . '/generate', 'auth' => $secured, 'description' => 'Generate credentials'],
        ],
        'limits' => [
            'maxCount'  => (int) cfg('max_count', 20),
            'rateLimit' => [
                'requests'      => (int) ($limits['requests'] ?? 20),
                'windowSeconds' => (int) ($limits['window'] ?? 60),
            ],
            'maxBodyBytes' => (int) cfg('max_body_bytes', 16384),
        ],
        'request' => [
            'mode'        => ['type' => 'string', 'required' => true, 'enum' => ['password', 'passphrase']],
            'count'       => ['type' => 'integer', 'required' => false, 'default' => 1, 'min' => 1, 'max' => (int) cfg('max_count', 20)],
            'entropyMode' => [
                'type' => 'string', 'required' => false, 'default' => 'system', 'enum' => ['system'],
                'note' => '"system+user" is browser-only (window.WoolKeyAPI); the server has no user input to mix.',
            ],
        ],
        'modes' => [
            'password' => [
                'options' => [
                    'length'             => ['type' => 'integer', 'default' => 24, 'min' => 8, 'max' => 128],
                    'includeLowercase'   => ['type' => 'boolean', 'default' => true],
                    'includeUppercase'   => ['type' => 'boolean', 'default' => true],
                    'includeNumbers'     => ['type' => 'boolean', 'default' => true],
                    'includeSymbols'     => ['type' => 'boolean', 'default' => false],
                    'avoidAmbiguous'     => ['type' => 'boolean', 'default' => false, 'note' => 'Excludes ' . PW_AMBIGUOUS],
                    'excludedCharacters' => ['type' => 'string',  'default' => '', 'maxLength' => 128],
                ],
                'symbolSet' => PW_CHAR_SETS['symbols'],
            ],
            'passphrase' => [
                'options' => [
                    'wordCount'  => ['type' => 'integer', 'default' => 4, 'min' => 4, 'max' => 8],
                    'separator'  => ['type' => 'string',  'default' => 'hyphen', 'enum' => array_keys(PP_SEPARATORS)],
                    'capitalize' => ['type' => 'boolean', 'default' => false],
                    'addNumber'  => ['type' => 'boolean', 'default' => false, 'note' => 'Appends a two-digit suffix; not counted toward entropy.'],
                ],
                'wordListSize' => count(load_words()),
            ],
        ],
        'strengthLevels' => [
            ['level' => 0, 'label' => 'Weak',        'minBits' => 0],
            ['level' => 1, 'label' => 'Fair',        'minBits' => 40],
            ['level' => 2, 'label' => 'Strong',      'minBits' => 60],
            ['level' => 3, 'label' => 'Very strong', 'minBits' => 80],
            ['level' => 4, 'label' => 'Excellent',   'minBits' => 100],
        ],
    ];
}

// ── Request handling ──────────────────────────────────────────────────────────

send_base_headers();
send_cors_headers();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method === 'GET') {
    if (isset($_GET['health'])) {
        json_out(['status' => 'ok', 'version' => WOOLKEY_API_VERSION, 'time' => gmdate('c')]);
    }
    rate_limit_check();
    json_out(descriptor());
}

if ($method !== 'POST') {
    header('Allow: GET, POST, OPTIONS');
    api_error(405, 'Method not allowed. Use POST to generate, GET for the capability descriptor.');
}

rate_limit_check();
auth_check();

$maxBody = (int) cfg('max_body_bytes', 16384);
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBody) {
    api_error(413, "Request body must be at most $maxBody bytes");
}

$raw = file_get_contents('php://input', false, null, 0, $maxBody + 1);
if ($raw === false) $raw = '';
if (strlen($raw) > $maxBody) {
    api_error(413, "Request body must be at most $maxBody bytes");
}

$input = json_decode($raw === '' ? '{}' : $raw, true);
if (!is_array($input)) {
    api_error(400, 'Invalid JSON body: ' . json_last_error_msg());
}

if (!array_key_exists('mode', $input) || $input['mode'] === null) {
    api_error(400, 'mode is required and must be "password" or "passphrase"', 'mode');
}
$mode = want_enum($input, 'mode', 'password', ['password', 'passphrase'], 'mode');

// The server has no pointer/keyboard input to mix, so accepting "system+user"
// here would be a lie about how the value was produced.
$entropyMode = want_enum($input, 'entropyMode', 'system', ['system', 'system+user'], 'entropyMode');
if ($entropyMode === 'system+user') {
    api_error(400, 'entropyMode "system+user" is available only in the browser API (window.WoolKeyAPI). The server supports "system".', 'entropyMode');
}

$maxCount = (int) cfg('max_count', 20);
$count    = want_int($input, 'count', 1, 1, $maxCount, 'count');

if (array_key_exists('options', $input) && $input['options'] !== null && !is_array($input['options'])) {
    api_error(400, 'options must be an object', 'options');
}
$opts = is_array($input['options'] ?? null) ? $input['options'] : [];

if ($mode === 'password') {
    $plan     = password_plan($opts);
    $strength = strength_label((float) $plan['bits']);
    $entropy  = ['bits' => round((float) $plan['bits'], 2), 'label' => $strength['label'], 'level' => $strength['level']];

    $results = [];
    for ($i = 0; $i < $count; $i++) {
        $value = password_from_plan($plan);
        $results[] = [
            'value'    => $value,
            'entropy'  => $entropy,
            'metadata' => [
                'entropyMode' => 'system',
                'poolSize'    => $plan['poolSize'],
                'length'      => strlen($value),
            ],
        ];
    }
} else {
    $plan     = passphrase_plan($opts);
    $strength = strength_label((float) $plan['bits']);
    $entropy  = ['bits' => round((float) $plan['bits'], 2), 'label' => $strength['label'], 'level' => $strength['level']];

    $results = [];
    for ($i = 0; $i < $count; $i++) {
        $results[] = [
            'value'    => passphrase_from_plan($plan),
            'entropy'  => $entropy,
            'metadata' => [
                'entropyMode'  => 'system',
                'wordCount'    => $plan['wordCount'],
                'wordListSize' => $plan['wordListSize'],
            ],
        ];
    }
}

// Top-level value/entropy/metadata mirror results[0] so existing single-result
// callers keep working unchanged.
json_out([
    'mode'     => $mode,
    'count'    => $count,
    'value'    => $results[0]['value'],
    'entropy'  => $results[0]['entropy'],
    'metadata' => $results[0]['metadata'],
    'results'  => $results,
]);
