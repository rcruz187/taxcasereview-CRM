import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// IRS MeF Production endpoint
const IRS_MEF_URL = 'https://la.www4.irs.gov/mef/MeFTransmitterService'
// IRS MeF Test endpoint (use this until EFIN is approved for production)
const IRS_MEF_TEST_URL = 'https://la1.www4.irs.gov/mef/MeFTransmitterService'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { returnData, preparerData, testMode = true } = await req.json()

    if (!preparerData?.efin) {
      return new Response(JSON.stringify({
        success: false,
        error: 'EFIN is required for IRS e-file submission. Add your EFIN in Settings → Firm Info.'
      }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    if (preparerData.efin.length !== 6) {
      return new Response(JSON.stringify({
        success: false,
        error: 'EFIN must be exactly 6 digits.'
      }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Build the IRS MeF SOAP envelope
    const submissionId = `${preparerData.efin}${new Date().getFullYear()}${Date.now().toString().slice(-8)}`
    const timestamp = new Date().toISOString()

    const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:mef="http://www.irs.gov/efile">
  <SOAP-ENV:Header>
    <mef:MessageHeader>
      <mef:MessageID>${submissionId}</mef:MessageID>
      <mef:Timestamp>${timestamp}</mef:Timestamp>
      <mef:EFIN>${preparerData.efin}</mef:EFIN>
    </mef:MessageHeader>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    <mef:SendSubmissionsRequest>
      <mef:SubmissionDataList>
        <mef:SubmissionData>
          <mef:SubmissionID>${submissionId}</mef:SubmissionID>
          <mef:TaxPeriodEndDate>${returnData.taxYear}-12-31</mef:TaxPeriodEndDate>
          <mef:ReturnData>
            <mef:ReturnHeader>
              <mef:FilingType>Individual</mef:FilingType>
              <mef:TaxYear>${returnData.taxYear}</mef:TaxYear>
              <mef:TaxPeriodBeginDate>${returnData.taxYear}-01-01</mef:TaxPeriodBeginDate>
              <mef:TaxPeriodEndDate>${returnData.taxYear}-12-31</mef:TaxPeriodEndDate>
              <mef:Filer>
                <mef:Name>${returnData.clientName || ''}</mef:Name>
                <mef:SSN>${returnData.ssn || ''}</mef:SSN>
                <mef:FilingStatus>${returnData.filingStatus || 'Single'}</mef:FilingStatus>
              </mef:Filer>
              <mef:Preparer>
                <mef:Name>${preparerData.name || ''}</mef:Name>
                <mef:PTIN>${preparerData.ptin || ''}</mef:PTIN>
                <mef:EFIN>${preparerData.efin}</mef:EFIN>
              </mef:Preparer>
            </mef:ReturnHeader>
            <mef:ReturnData>
              <mef:IRS1040>
                <mef:TotalIncome>${returnData.grossIncome || 0}</mef:TotalIncome>
                <mef:AdjustedGrossIncome>${returnData.agi || 0}</mef:AdjustedGrossIncome>
                <mef:TaxableIncome>${returnData.taxableIncome || 0}</mef:TaxableIncome>
                <mef:TotalTax>${returnData.estimatedTax || 0}</mef:TotalTax>
                <mef:TotalPayments>${returnData.withholding || 0}</mef:TotalPayments>
                <mef:RefundAmount>${returnData.refund || 0}</mef:RefundAmount>
                <mef:AmountOwed>${returnData.amountOwed || 0}</mef:AmountOwed>
              </mef:IRS1040>
            </mef:ReturnData>
          </mef:ReturnData>
        </mef:SubmissionData>
      </mef:SubmissionDataList>
    </mef:SendSubmissionsRequest>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`

    const endpoint = testMode ? IRS_MEF_TEST_URL : IRS_MEF_URL

    const irsRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'SendSubmissions',
        'User-Agent': 'TaxResCRM/1.0',
      },
      body: soapEnvelope
    })

    const responseText = await irsRes.text()

    // Parse acknowledgment from IRS response
    const accepted = responseText.includes('Accepted') || responseText.includes('A')
    const rejected = responseText.includes('Rejected') || responseText.includes('R')
    const ackNum   = responseText.match(/<AcknowledgementNumber>([^<]+)<\/AcknowledgementNumber>/)?.[1] || submissionId

    if (irsRes.ok || accepted) {
      return new Response(JSON.stringify({
        success: true,
        submissionId,
        ackNumber: ackNum,
        status: 'Accepted',
        message: `Return accepted by IRS. Acknowledgement: ${ackNum}`,
        testMode
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
    } else {
      // Extract error details from IRS response
      const errorMsg = responseText.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/)?.[1] ||
                       responseText.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] ||
                       'IRS returned an error. Check return data and try again.'

      return new Response(JSON.stringify({
        success: false,
        submissionId,
        error: errorMsg,
        rawResponse: responseText.slice(0, 500),
        testMode
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

  } catch (e) {
    console.error('submit-to-irs error:', e)
    return new Response(JSON.stringify({
      success: false,
      error: (e as Error).message
    }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
