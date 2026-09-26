import { createApp } from './app.js';
import { loadConfig, type Config } from './config/env.js';

// Entry point: validate config, build the app, start listening. No logic lives
// here, which is why it is excluded from coverage.

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  // Fail fast with a readable message instead of a stack trace.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

createApp(config).listen(config.port, (error) => {
  // Express 5 passes listen errors (e.g. port already in use) to this callback.
  if (error) throw error;
  console.log(`Server listening on port ${config.port} (${config.nodeEnv})`);
});
