import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const homeLatency = new Trend('home_latency', true);
const loginLatency = new Trend('login_latency', true);

export const options = {
  scenarios: {
    baseline_30: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
      exec: 'publicFlow',
      gracefulStop: '15s',
    },
    burst_50: {
      executor: 'constant-vus',
      vus: 50,
      startTime: '5m15s',
      duration: '2m',
      exec: 'publicFlow',
      gracefulStop: '15s',
    },
    burst_100: {
      executor: 'constant-vus',
      vus: 100,
      startTime: '7m30s',
      duration: '1m',
      exec: 'publicFlow',
      gracefulStop: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    home_latency: ['p(95)<1200'],
    login_latency: ['p(95)<1500'],
  },
};

const BASE = (__ENV.BASE_URL || '').replace(/\/$/, '');

function record(res, trend, expectedStatuses = [200, 301, 302, 307, 308]) {
  trend.add(res.timings.duration);
  const ok = check(res, {
    'status acceptable': (r) => expectedStatuses.includes(r.status),
    'response under 3s': (r) => r.timings.duration < 3000,
  });
  errorRate.add(!ok);
}

export function publicFlow() {
  const home = http.get(`${BASE}/`, { redirects: 0, tags: { route: 'home' } });
  record(home, homeLatency);

  const login = http.get(`${BASE}/login`, { redirects: 0, tags: { route: 'login' } });
  record(login, loginLatency, [200, 301, 302, 307, 308, 404]);

  sleep(Math.random() * 2 + 1);
}
