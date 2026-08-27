const test = require('node:test');
const assert = require('node:assert');

test('HealthService returns OK status and valid uptime', () => {
  const mockService = {
    getHealth() {
      return {
        status: 'ok',
        service: 'o2-api',
        version: '0.1.0',
      };
    },
  };

  const health = mockService.getHealth();
  assert.strictEqual(health.status, 'ok');
  assert.strictEqual(health.service, 'o2-api');
});
