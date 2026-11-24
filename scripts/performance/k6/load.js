import http from 'k6/http';
import { check } from 'k6';
import { commonThresholds, readCatalog } from './common.js';

export const options = {
  discardResponseBodies: true,
  scenarios: {
    catalog_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: commonThresholds,
};

export default function () {
  readCatalog(http, check);
}
