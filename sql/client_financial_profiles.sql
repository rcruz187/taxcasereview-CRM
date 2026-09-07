-- ============================================================================
-- Client Financial Profile (TO Worksheet equivalent)
-- One row per client. JSON columns hold structured sub-sections.
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_financial_profiles (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_name text UNIQUE NOT NULL,

  -- Basic / household info
  dob text,
  county text,
  household_under_65 numeric DEFAULT 0,
  household_over_65 numeric DEFAULT 0,
  filing_status text,
  tax_years_not_filed text,
  has_lived_other_states text,
  other_states_notes text,

  -- Employment - Taxpayer (JSON: employer, length, position, pay_frequency, gross_pay,
  --   gross_monthly_salary, fed_withheld, ss_med_withheld, state_withheld, notes)
  employment_taxpayer_1 jsonb DEFAULT '{}',
  employment_taxpayer_2 jsonb DEFAULT '{}',
  -- Employment - Spouse
  employment_spouse_1 jsonb DEFAULT '{}',
  employment_spouse_2 jsonb DEFAULT '{}',

  -- Business 1 / 2 (JSON: name, address, ein, structure, date_opened, date_closed,
  --   pct_ownership, other_partners, num_employees, payroll_processor,
  --   current_941_filings, current_941_payments, net_income, k1_distribution, notes)
  business_1 jsonb DEFAULT '{}',
  business_2 jsonb DEFAULT '{}',

  -- Other income sources (JSON array)
  other_income jsonb DEFAULT '[]',

  -- Real estate (JSON array, up to 4 properties: address, monthly_rent, mortgage_1,
  --   mortgage_2, purchase_year, purchase_amount, refi_year, refi_amount,
  --   zillow_value, mortgage_length, mortgage_balance, rental_income, is_primary)
  real_estate jsonb DEFAULT '[]',

  -- Vehicles (JSON array, up to 4: make_model, year, purchase_date, purchase_amount,
  --   monthly_payment, final_payment_date, mileage, kbb_value, remaining_balance)
  vehicles jsonb DEFAULT '[]',

  -- Other secured debt (e.g. student loans)
  other_secured_debt jsonb DEFAULT '{}', -- {monthly_payment, final_payment_date, remaining_balance}

  -- Assets (JSON array of generic asset rows: type, description, value, loan_against)
  -- type in: bank_account, life_insurance, retirement, business_asset, additional_asset
  assets jsonb DEFAULT '[]',
  cash_on_hand numeric DEFAULT 20,

  -- Credit cards / lines of credit (JSON array: name, balance, limit, min_payment)
  credit_cards jsonb DEFAULT '[]',

  -- Monthly living expenses (actual amounts entered by staff)
  expenses jsonb DEFAULT '{}',
  -- keys: housing_1st_mortgage, housing_2nd_mortgage, homeowners_insurance, property_taxes,
  --   hoa_dues, rent, renters_insurance, electricity, water_sewer_trash, waste_sewer,
  --   trash, heating_gas, heating_propane, cell_phone, internet, cable, pest_control,
  --   lawn, maintenance, public_transportation, vehicle_1_payment, vehicle_2_payment,
  --   car_misc, health_major_medical, health_supplemental, health_dental, health_vision,
  --   health_oop, credit_card_min, child_support, court_judgment, child_care,
  --   life_term, life_whole, irs_installment, state_installment

  -- IRS / state liability quick references (manual entry; full per-year tables = Phase 2)
  irs_personal_liability numeric,
  irs_civil_penalty_liability numeric,
  irs_business_1120s_liability numeric,
  irs_business_941_liability numeric,
  irs_business_940_liability numeric,
  state_personal_liability numeric,
  recent_irs_notices text,

  -- Resolution
  resolution_eta text,
  total_recommended_fee numeric,
  tax_prep_fee_only numeric,
  proposed_resolution text,

  notes text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE client_financial_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON client_financial_profiles;
CREATE POLICY "Allow all for authenticated" ON client_financial_profiles
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
