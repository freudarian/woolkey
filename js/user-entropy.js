/**
 * user-entropy.js
 * Optional user-generated entropy mixed in addition to Web Crypto output.
 */

'use strict';

const _UE_POOL_SIZE = 128;
const _UE_POOL = new Uint32Array(_UE_POOL_SIZE);
let _UE_INDEX = 0;
let _UE_COUNT = 0;
let _UE_READY = false;
let _UE_LAST_T = 0;
let _UE_EVENT_COUNTER = 0;
let _UE_ENABLED = true;

function _ueMix32(value) {
  let x = (value >>> 0);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function _uePush(seed) {
  const i = _UE_INDEX;
  const mixed = _ueMix32(seed ^ _UE_POOL[(i + 17) % _UE_POOL_SIZE] ^ (_UE_EVENT_COUNTER++ >>> 0));
  _UE_POOL[i] = (_UE_POOL[i] ^ mixed) >>> 0;
  _UE_INDEX = (i + 1) % _UE_POOL_SIZE;
  if (_UE_COUNT < _UE_POOL_SIZE) _UE_COUNT++;
}

function _ueCollectEvent(e) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const dt = Math.floor((now - _UE_LAST_T) * 1000) >>> 0;
  _UE_LAST_T = now;

  let x = 0;
  let y = 0;
  let pressure = 0;

  if (typeof e.clientX === 'number') x = e.clientX;
  if (typeof e.clientY === 'number') y = e.clientY;
  if (e.touches && e.touches.length > 0) {
    x = e.touches[0].clientX || 0;
    y = e.touches[0].clientY || 0;
    pressure = Math.floor((e.touches[0].force || 0) * 1024) >>> 0;
  }

  const base = ((x & 0xffff) << 16) ^ (y & 0xffff) ^ (dt << 1) ^ pressure;
  _uePush(base >>> 0);
}

function _ueCollectKey(e) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const dt = Math.floor((now - _UE_LAST_T) * 1000) >>> 0;
  _UE_LAST_T = now;
  const code = (typeof e.code === 'string' ? e.code.length : 0) & 0xffff;
  const which = (typeof e.which === 'number' ? e.which : 0) & 0xffff;
  _uePush((((code << 16) ^ which) ^ (dt << 1)) >>> 0);
}

function _ueGetWord() {
  if (_UE_COUNT === 0) return 0;
  const a = _UE_POOL[_UE_INDEX % _UE_COUNT] >>> 0;
  const b = _UE_POOL[(_UE_INDEX + 37) % _UE_COUNT] >>> 0;
  const c = _UE_POOL[(_UE_INDEX + 73) % _UE_COUNT] >>> 0;
  return _ueMix32((a ^ b ^ c ^ (_UE_EVENT_COUNTER++ >>> 0)) >>> 0);
}

function initUserEntropyCollector() {
  if (_UE_READY) return;
  _UE_READY = true;
  _UE_LAST_T = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (typeof window === 'undefined') return;
  window.addEventListener('mousemove', _ueCollectEvent, { passive: true });
  window.addEventListener('touchmove', _ueCollectEvent, { passive: true });
  window.addEventListener('pointermove', _ueCollectEvent, { passive: true });
  window.addEventListener('keydown', _ueCollectKey, { passive: true });
}

function userEntropyWord() {
  if (!_UE_ENABLED) return 0;
  return _ueGetWord();
}

function userEntropySampleCount() {
  return _UE_COUNT;
}

function setUserEntropyMixingEnabled(enabled) {
  _UE_ENABLED = enabled !== false;
}
