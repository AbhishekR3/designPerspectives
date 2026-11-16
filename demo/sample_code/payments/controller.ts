/** Payments Controller: HTTP entry point for payment requests. */

import { Router } from "express";
import { runPayment } from "./orchestrator";
import { sessionUser } from "./session";
import type { PaymentRequest } from "./types";

export const payments = Router();

payments.post("/api/payments", async (req, res) => {
  const user = await sessionUser(req.header("Authorization"));
  if (!user) return res.status(401).json({ error: "Session expired. Sign in again." });
  const outcome = await runPayment(user, req.body as PaymentRequest);
  res.status(outcome.status === "rejected" ? 422 : 202).json(outcome);
});
