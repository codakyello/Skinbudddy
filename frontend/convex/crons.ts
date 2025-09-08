import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 1. Cron job that calls the process refund function in order.ts
crons.interval(
  "processRefunds",
  {
    minutes: 5,
  },
  internal.order._sweepPendingRefunds,
  {}
);

// 2. Another cron job that calls the verifyPendingPaymentsSweep
crons.interval(
  "verifyPendingPayments",
  {
    minutes: 5,
  },
  internal.order.verifyPendingPaymentsSweep,
  {}
);

export default crons;
