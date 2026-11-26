import { publishTestEvent, runCli } from './broker.mjs';

await runCli((client) => publishTestEvent(client, process.argv[2]));
