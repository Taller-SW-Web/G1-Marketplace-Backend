import { peekQueues, runCli } from './broker.mjs';

await runCli((client) => peekQueues(client, process.argv[2] === undefined ? 5 : Number(process.argv[2])));
