-- Employee ID + SSN fields on employees, and an "employee" scoping column on
-- documents so the new Documents tab in the Edit Employee modal can store
-- W4/I-9/SSN copy/driver license/etc. paperwork per employee.
-- Run this in: Supabase Dashboard → SQL Editor

ALTER TABLE employees  ADD COLUMN IF NOT EXISTS employee_id text;
ALTER TABLE employees  ADD COLUMN IF NOT EXISTS ssn text;
ALTER TABLE documents  ADD COLUMN IF NOT EXISTS employee text;
