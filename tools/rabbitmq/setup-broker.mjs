import { runCli, setupBroker } from './broker.mjs';

await runCli(async (client) => {
  await setupBroker(client, process.env);
  return { configurado: true };
});
