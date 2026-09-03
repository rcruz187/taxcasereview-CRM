DROP POLICY IF EXISTS hide_qa_certification_employees_from_staff ON public.employees;

CREATE POLICY hide_qa_certification_employees_from_staff
ON public.employees
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  (
    COALESCE(notes, '') NOT ILIKE 'TEMP QA%'
    AND COALESCE(id::text, '') NOT LIKE 'qa_%'
    AND COALESCE(email, '') NOT LIKE 'qa_%@%'
  )
  OR lower(COALESCE(email, '')) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);
