-- PostgreSQL requires enum additions to commit before a later transaction can use them.
ALTER TYPE "WireTransferStatus" ADD VALUE IF NOT EXISTS 'awaiting_proof';
ALTER TYPE "WireTransferStatus" ADD VALUE IF NOT EXISTS 'cancelled';
