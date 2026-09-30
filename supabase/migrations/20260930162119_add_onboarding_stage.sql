-- Track exactly where each user is in the BMONI onboarding flow.
-- Stages (in order):
--   profile       → XPay profile created, no BMONI setup started
--   bmoni_user    → BMONI user created, wallet not yet provisioned
--   bmoni_wallet  → Smart wallet provisioned, KYC/Nigeria rail not started
--   bmoni_kyc     → Nigeria rail started (BVN submitted), VBA pending
--   complete      → Nigeria rail active, VBA received — fully onboarded

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_stage TEXT NOT NULL DEFAULT 'complete'
  CHECK (onboarding_stage IN ('profile','bmoni_user','bmoni_wallet','bmoni_kyc','complete'));

-- All existing profiles that have no bmoni setup should be marked as needing it
UPDATE profiles
SET onboarding_stage = 'profile'
WHERE bmoni_user_id IS NULL;

UPDATE profiles
SET onboarding_stage = 'bmoni_user'
WHERE bmoni_user_id IS NOT NULL AND bmoni_wallet_id IS NULL;

UPDATE profiles
SET onboarding_stage = 'bmoni_wallet'
WHERE bmoni_wallet_id IS NOT NULL AND bmoni_onboarding_status != 'rail_active';

UPDATE profiles
SET onboarding_stage = 'complete'
WHERE bmoni_onboarding_status = 'rail_active';
