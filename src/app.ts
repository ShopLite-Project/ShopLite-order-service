import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { healthRouter } from "./routes/health";
import { ordersRouter } from "./routes/orders";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

app.get("/", (_request, response) => {
  response.status(200).json({
    service: "shoplite-order-service",
    message: "ShopLite order service is running"
  });
});

app.use("/health", healthRouter);
app.use("/orders", ordersRouter);
