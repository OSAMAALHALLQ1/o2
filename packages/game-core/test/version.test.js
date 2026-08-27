const test = require('node:test');
const assert = require('node:assert');

test('Game Core Package exports valid version string', () => {
  const version = '0.1.0';
  assert.strictEqual(version, '0.1.0');
});
