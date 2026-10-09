/** A payment event from a gateway, after its signature was verified. */
export interface GatewayEvent {
  id: string;
  type: "payment.succeeded" | "payment.failed" | "refund.succeeded" | "refund.failed";
  payment_id: string;
  refund_id?: string;
  amount_minor?: number;
  currency?: string;
  provider_reference?: string;
  reason?: string;
}

/** What the server knows about a connection when it verifies a webhook or sends a refund. */
export interface ConnectionSecret {
  connection_id: string;
  gateway: string;
  provider: string;
  secret_ciphertext: string;
  public_config: Record<string, unknown>;
}

/**
 * One payment provider. Decision P5: the launch gateway is decided later, so GoMenu ships with a
 * built-in test gateway; a real provider is a new adapter registered in ./index.ts.
 * Payment success is accepted only from verifyWebhook() → apply_payment_event (spec §11).
 */
export interface GatewayAdapter {
  provider: string;
  /** Validate the owner's credentials with the provider; returns what to show and what to seal. */
  connect(input: Record<string, string>): Promise<{ publicConfig: Record<string, string>; secret: string }>;
  /** Where to send the diner to pay. */
  checkoutUrl(payment: { payment_id: string; amount_minor: number; currency: string }, origin: string): Promise<string>;
  /** Parse and verify a webhook. null = not authentic (reject with 401). */
  verifyWebhook(rawBody: string, headers: Headers, conn: ConnectionSecret): GatewayEvent | null;
  /** Ask the provider to refund; the result arrives later as a refund.* webhook. */
  refund(input: { payment_id: string; refund_id: string; amount_minor: number }, conn: ConnectionSecret): Promise<void>;
}
