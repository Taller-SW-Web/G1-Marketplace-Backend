import http from 'k6/http';
import { check } from 'k6';
import { commonThresholds, readCatalog } from './common.js';

export const options = {
  discardResponseBodies: true,
  scenarios: {
    catalog_spike: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '10s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '10s', target: 5 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: commonThresholds,
};

export default function () {
  readCatalog(http, check);
}
