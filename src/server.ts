import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`${env.SERVICE_NAME} listening on port ${env.PORT}`);
});
