<?php
/**
 * WoolKey API configuration.
 *
 * Copy this file to config.php and set a strong token.
 * config.php is blocked from web access via .htaccess.
 *
 * Leave api_token empty to allow unauthenticated access (dev/demo only).
 * In production, always set a long random token.
 *
 * Generate a token:   php -r "echo bin2hex(random_bytes(32));"
 */
return [
    'api_token' => '',
];
