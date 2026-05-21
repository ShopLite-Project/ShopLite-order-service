import { app } from "./app";
import { env } from "./config/env";
import { startInventoryEventsConsumer, stopKafka } from "./services/kafka";

const server = app.listen(env.PORT, () => {
  console.log(`${env.SERVICE_NAME} listening on port ${env.PORT}`);
});

startInventoryEventsConsumer().catch((error) => {
  console.error("Failed to start inventory Kafka consumer", error);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}, shutting down ${env.SERVICE_NAME}`);
  server.close();
  await stopKafka();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
