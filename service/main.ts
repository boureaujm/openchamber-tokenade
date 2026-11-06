import { createDashboardServer } from "./server";

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN;

if (!Number.isInteger(port) || port < 1 || port > 65_535 || !token) {
  process.exitCode = 1;
} else {
  createDashboardServer({ token }).listen(port, "127.0.0.1");
}
