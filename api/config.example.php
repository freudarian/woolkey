<?php
/**
 * WoolKey API configuration.
 *
 * Copy this file to config.php and set a strong token.
 * config.php is blocked from web access via .htaccess.
 *
 * Generate a token:   php -r "echo bin2hex(random_bytes(32));"
 *
 * POST /api/generate refuses to run until this file exists and either
 * 'api_token' is set or 'allow_unauthenticated' is explicitly true.
 * That is deliberate: an unauthenticated generator on a public host is a
 * free CPU/bandwidth faucet for anyone who finds it.
 */
return [
    /**
     * Shared secret. Callers send it as `X-Api-Key: <token>` or
     * `Authorization: Bearer <token>`. Compared with hash_equals().
     */
    'api_token' => '',

    /**
     * Set true ONLY for local development. When true, POST works with no
     * token. Leave false in production.
     */
    'allow_unauthenticated' => false,

    /**
     * CORS origins permitted to call the endpoint from a browser.
     * Use ['*'] for any origin (safe here: auth is a header, not a cookie),
     * or list exact origins, e.g. ['https://woolkey.com'].
     */
    'allowed_origins' => ['*'],

    /**
     * Per-IP rate limit.
     */
    'rate_limit' => [
        'requests' => 20,
        'window'   => 60,   // seconds
    ],

    /**
     * Maximum credentials returned from a single request ("count" field).
     */
    'max_count' => 20,

    /**
     * Maximum accepted request body size, in bytes.
     */
    'max_body_bytes' => 16384,
];
