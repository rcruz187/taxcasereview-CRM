-- Add address and filing status fields to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS "filingStatus" text DEFAULT 'Single';
