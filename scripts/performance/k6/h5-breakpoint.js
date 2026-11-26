import http from 'k6/http';
import { check } from 'k6';
import { readCatalog } from './common.js';
import { breakpointOptions } from './h5-breakpoint-options.mjs';

// common.js enforces the authorized local MOCK/loopback boundary at init.
export const options = breakpointOptions(__ENV);

export default function () {
  readCatalog(http, check);
}
