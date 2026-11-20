-- A new tenant stores `{}` and reads the running config. A tenant that exists keeps what it stores: one created on an
-- earlier default allows unregistered clients until a system admin turns that off for it.
ALTER TABLE "tenants" ALTER COLUMN "restrictions" SET DEFAULT '{}';
