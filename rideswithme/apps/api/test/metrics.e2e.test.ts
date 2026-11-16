import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness, resetState } from './harness';
import { passenger } from './ride-fixtures';

const TOKEN = 'metrics-token-for-tests-0123456789';
let h: Harness;
beforeAll(async () => {
  h = await createHarness({ METRICS_TOKEN: TOKEN });
  await resetState(h);
});
afterAll(async () => h.close());

describe('metrics', () => {
  it('is hidden without the token and reports health and safety numbers with it', async () => {
    await h.http.get('/metrics').expect(404);
    await h.http
      .get('/metrics')
      .set('Authorization', 'Bearer wrong-token-wrong-token-wrong')
      .expect(404);
    const p = await passenger(h);
    await h.http.post('/v1/sos').set('Authorization', p.auth).send({}).expect(201);
    await h.http.get('/health/live').expect(200);
    const res = await h.http.get('/metrics').set('Authorization', `Bearer ${TOKEN}`).expect(200);
    expect(res.text).toMatch(/^rwm_sos_open_alerts 1$/m);
    expect(res.text).toMatch(/^rwm_ledger_mismatched_wallets 0$/m);
    expect(res.text).toMatch(
      /rwm_http_request_duration_seconds_count\{method="POST",route="\/v1\/sos",status="201"\} 1/,
    );
    // Routes are patterns, never raw URLs with ids.
    expect(res.text).not.toMatch(/route="\/v1\/rides\/[0-9a-f-]{36}/);
  });
});
