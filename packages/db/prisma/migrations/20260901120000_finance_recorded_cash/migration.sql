-- Cash is an accounting-only rail for money received and posted by Finance.
-- It is deliberately absent from every payer-facing payment-method contract.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cash';
