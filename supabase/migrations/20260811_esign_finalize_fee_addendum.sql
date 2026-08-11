-- Fix esign_finalize: 'Fee Agreement Addendum' sent from the E-Sign page dropdown
-- was not in the v_target_status CASE block, so it never advanced the lead to
-- 'Addendum Signed' and never fired create_addendum_installments.
-- Adding it alongside 'Service Addendum' gives it identical pipeline behavior.
-- This is the only change — no other behavior is modified.

CREATE OR REPLACE FUNCTION esign_finalize(
  p_id text, p_client_name text, p_doc_type text, p_signed_by text, p_signer_ip text,
  p_signed_at timestamptz, p_saved_doc_type text,
  p_cert_url text DEFAULT NULL, p_attachments jsonb DEFAULT '[]',
  p_cert_size bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entity_type text; v_lead_id text; v_lead_status text; v_lead_assigned text;
  v_target_status text; v_note_text text;
  v_due_date text := to_char(now() + interval '1 day', 'YYYY-MM-DD');
  v_assignee2 text; v_att jsonb; v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM esigns WHERE id = p_id;
  IF v_tenant IS NULL THEN v_tenant := '61a89aef-0e7e-4ea2-b222-44ab2024655a'::uuid; END IF;

  SELECT id, status, "assignedTo" INTO v_lead_id, v_lead_status, v_lead_assigned
  FROM leads WHERE name = p_client_name AND tenant_id = v_tenant
  ORDER BY created_at DESC LIMIT 1;

  v_entity_type := CASE WHEN v_lead_id IS NOT NULL THEN 'lead' ELSE 'client' END;

  BEGIN
    INSERT INTO tasks (title,"clientName","assignedTo",priority,"dueDate",done,notes,section_title,created_at,tenant_id)
    SELECT ws.title,p_client_name,'System','Normal',
      to_char(now()+make_interval(days=>COALESCE(ws.due_in_days,1)),'YYYY-MM-DD'),
      false,COALESCE(ws.notes,''),ws.section_title,now(),v_tenant
    FROM workflow_templates wt JOIN workflow_steps ws ON ws.template_id=wt.id
    WHERE wt.active=true AND wt.entity_type IN (v_entity_type,'both')
      AND wt.trigger_event='esign_signed' AND wt.tenant_id=v_tenant
      AND (wt.trigger_value IS NULL OR wt.trigger_value=p_doc_type);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_target_status := CASE p_doc_type
      WHEN 'Full Investigation Package' THEN 'Tax Inv Agreement Signed'
      WHEN 'Service Addendum'           THEN 'Addendum Signed'
      WHEN 'Fee Agreement Addendum'     THEN 'Addendum Signed'   -- ← THE FIX
      WHEN 'Tax Service Agreement'      THEN 'Tax Inv Agreement Signed'
      WHEN 'Service Agreement'          THEN 'Tax Inv Agreement Signed'
      ELSE NULL END;
    IF v_target_status IS NOT NULL AND v_lead_id IS NOT NULL THEN
      PERFORM 1 FROM (
        SELECT array_position(ARRAY['New Lead','Contacted','Consultation Scheduled','Consultation Completed',
          'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid','Tax Investigation Active',
          'IRS Facts Received','Addendum Sent','Addendum Signed','Resolution Fee Paid','Converted to Client'],
          v_lead_status) AS cur_idx,
          array_position(ARRAY['New Lead','Contacted','Consultation Scheduled','Consultation Completed',
          'Tax Inv Agreement Sent','Tax Inv Agreement Signed','Tax Inv Fee Paid','Tax Investigation Active',
          'IRS Facts Received','Addendum Sent','Addendum Signed','Resolution Fee Paid','Converted to Client'],
          v_target_status) AS target_idx
      ) idx WHERE COALESCE(idx.cur_idx,0) < idx.target_idx;
      IF FOUND THEN
        UPDATE leads SET status=v_target_status WHERE id=v_lead_id;
        v_lead_status := v_target_status;
      END IF;
    END IF;
    -- AUTO-CREATE PAYMENT INSTALLMENTS when addendum is signed (either doc_type)
    IF v_target_status = 'Addendum Signed' THEN
      PERFORM create_addendum_installments(p_client_name, v_tenant);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    IF v_target_status='Tax Inv Agreement Signed' AND v_lead_id IS NOT NULL AND v_lead_status='Tax Inv Fee Paid' THEN
      UPDATE leads SET status='Tax Investigation Active' WHERE id=v_lead_id;
      v_assignee2 := COALESCE(v_lead_assigned,'Unassigned');
      INSERT INTO tasks(title,"clientName",priority,"dueDate",done,"assignedTo",notes,created_at,tenant_id)
      VALUES
        ('📞 Call IRS — gather tax investigation info for '||p_client_name,p_client_name,'High',v_due_date,false,v_assignee2,
         'Call IRS with POA to pull transcripts, balances, lien info, assessment dates, and filing history.',now(),v_tenant),
        ('🧾 Review financial intake — build resolution plan for '||p_client_name,p_client_name,'High',v_due_date,false,v_assignee2,
         'Review the Financial Profile populated from the client''s intake submission. Determine best resolution path.',now(),v_tenant);
      INSERT INTO lead_notes(lead_id,lead_name,text,type,author,created_at,tenant_id)
      VALUES(v_lead_id,p_client_name,'✍️ Agreement signed — fee already paid, auto-advanced to Tax Investigation Active. 2 tasks created for '||v_assignee2||'.','System','System (E-Sign)',now(),v_tenant);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_note_text := '✅ '||p_doc_type||' signed — by: '||p_signed_by||' | IP: '||COALESCE(p_signer_ip,'')||' | '||p_signed_at::text;
    IF v_lead_id IS NOT NULL THEN
      INSERT INTO lead_notes(lead_id,lead_name,text,type,author,created_at,tenant_id)
      VALUES(v_lead_id,p_client_name,v_note_text,'E-Sign','System',p_signed_at,v_tenant);
    ELSE
      INSERT INTO client_notes(clientname,text,author,visible_to_client,created_at,tenant_id)
      VALUES(p_client_name,v_note_text,'System',false,p_signed_at,v_tenant);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    INSERT INTO documents(client,name,"docType",notes,created_at,tenant_id)
    VALUES(p_client_name,'Signed '||p_doc_type||' — '||p_client_name,p_saved_doc_type,
      'Signed by: '||p_signed_by||E'\nIP: '||COALESCE(p_signer_ip,'')||E'\nDate: '||p_signed_at::text,p_signed_at,v_tenant);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    IF p_cert_url IS NOT NULL THEN
      INSERT INTO documents(client,name,"docType",file_url,file_name,file_size,notes,source,uploaded_by,created_at,tenant_id)
      VALUES(p_client_name,'Certificate of Completion — '||p_doc_type||' — '||p_client_name,p_saved_doc_type,
        p_cert_url,'certificate_completion.pdf',p_cert_size,
        'Signed by: '||p_signed_by||' | IP: '||COALESCE(p_signer_ip,'')||' | '||p_signed_at::text,
        'E-Signature','System',p_signed_at,v_tenant);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    FOR v_att IN SELECT * FROM jsonb_array_elements(p_attachments) LOOP
      INSERT INTO documents(client,name,"docType",file_url,file_name,file_size,notes,source,uploaded_by,created_at,tenant_id)
      VALUES(p_client_name,'Signed '||split_part(v_att->>'label',' — ',1)||' — '||p_client_name,p_saved_doc_type,
        v_att->>'url',(v_att->>'formType')||'_signed.pdf',(v_att->>'fileSize')::bigint,
        'Signed by: '||p_signed_by||E'\nIP: '||COALESCE(p_signer_ip,'')||E'\nDate: '||p_signed_at::text||E'\n✅ Certificate of completion appended',
        'E-Signature','System',p_signed_at,v_tenant);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    IF jsonb_array_length(p_attachments)>0 THEN UPDATE esigns SET signed_attachments=p_attachments WHERE id=p_id; END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('entity_type',v_entity_type,'lead_id',v_lead_id);
END;
$$;

GRANT EXECUTE ON FUNCTION esign_finalize(text, text, text, text, text, timestamptz, text, text, jsonb, bigint) TO anon, authenticated;
