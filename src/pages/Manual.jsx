import { useState } from 'react'

const MANUAL_SECTIONS = [
  {
    id: 'overview', icon: '🏠', label: 'Overview', category: 'Getting Started',
    title: 'What TaxRes CRM does',
    content: [
      { type: 'lead', text: 'TaxRes CRM replaces Canopy, Calendly, and your phone system with one platform built specifically for tax resolution. Every action — call, email, text, fax, document sent — logs automatically as a note on the file.' },
      { type: 'flow', items: ['New Lead', 'Financial Intake', 'Send Full Package', 'Client Signs ⭐', 'Tasks Auto-Created', 'Active Client', 'Resolution ✓'] },
      { type: 'h3', text: 'Core features' },
      { type: 'cards', items: [
        { icon: '🎯', title: 'Lead pipeline', body: 'Capture leads, send investigation packages, collect e-signatures, and convert to active clients — the pipeline tracks every stage automatically.' },
        { icon: '📄', title: 'IRS form generation', body: 'Pre-fill Form 2848, 8821, state POAs, and the 433-F from the client record. Rep name, CAF, PTIN, and signature block all populate automatically.' },
        { icon: '📞', title: 'Built-in phone system', body: 'Inbound call routing, IVR by extension, hold music, transfer, add-caller, voicemail, and AI-generated call summaries with auto-created tasks.' },
        { icon: '💳', title: 'Payments & AR', body: 'Charge cards, set up 3-installment plans from the signed addendum, track AR, and send Stripe payment links — all from the client file.' },
        { icon: '⚡', title: 'Automated workflows', body: 'When a client signs the Full Package, 6 tasks auto-create and assign to the right rep and associate based on role — no manual setup needed.' },
        { icon: '🔐', title: 'Client & employee portals', body: 'Clients sign docs, pay invoices, and upload files. Employees clock in and see their assigned cases from any device.' },
        { icon: '🤖', title: 'AI assistant', body: 'The 🤖 button on every page reads what\'s on screen and answers tax resolution questions, drafts emails, and explains IRS processes.' },
        { icon: '💬', title: 'Team chat & huddles', body: 'Slack-style channels, direct messages, and full-screen video huddles with screen share, raise hand, emoji reactions, and a thread panel.' },
      ]},
      { type: 'tip', text: 'Every communication — call, email, SMS, fax, booking, document sent — creates a note automatically. You never need to manually log anything.' },
    ]
  },
  {
    id: 'roles', icon: '👥', label: 'Roles & Access', category: 'Getting Started',
    title: 'Roles & access levels',
    content: [
      { type: 'lead', text: 'Every employee has one of four access levels. The CRM shows or hides features based on role — you only see what you need. Nashville Tax Solutions uses the labels Associate (Tax Advisor) and Para (Tax Associate).' },
      { type: 'table', headers: ['Role', 'Who it\'s for', 'What they can do'], rows: [
        ['Super Admin', 'Firm owner, lead EA', 'Everything — settings, all clients, billing, employee management, all reports, CRM Companies'],
        ['Admin', 'Office manager', 'All clients and leads, tasks, payments, calendar, reports — no firm settings'],
        ['Tax Advisor / Associate', 'EAs, CPAs, preparers', 'Assigned clients and leads, tasks, documents, IRS forms, calling, communications'],
        ['Tax Associate / Para', 'Paralegals, support staff', 'Clients/leads assigned to them, tasks, documents — no billing or settings'],
        ['Sales', 'Sales reps', 'Leads and communications — no billing, no client documents'],
        ['Read Only', 'Observers', 'View only — no edits, no payments, no sending'],
      ]},
      { type: 'h3', text: 'Phone extensions' },
      { type: 'info', text: 'Every employee has an extension. When a client calls and presses an extension, the call rings that rep\'s browser directly. No desk phone needed.' },
      { type: 'table', headers: ['Extension', 'Nashville employee'], rows: [
        ['101', 'Chris Bennett'],
        ['102', 'Adam Barr'],
        ['103', 'Amber Fischer'],
        ['104', 'Camille Loose'],
        ['105', 'Lucille Thomas-Menard'],
        ['106', 'Isabela Fuentes-Pettingill'],
        ['107', 'Art Sapunar'],
        ['108', 'Virginia Jiwa'],
      ]},
    ]
  },
  {
    id: 'dashboard', icon: '📊', label: 'Dashboard', category: 'Getting Started',
    title: 'Dashboard',
    content: [
      { type: 'lead', text: 'The dashboard is your daily snapshot. Tiles are draggable — rearrange them to match your workflow. The layout saves per user.' },
      { type: 'table', headers: ['Tile', 'What it shows', 'Links to'], rows: [
        ['Open Leads', 'Leads not yet converted or closed', 'Leads page'],
        ['Clients', 'Total active clients', 'Clients page'],
        ['Active Cases', 'Cases in active resolution stages', 'Cases page'],
        ['MTD 1st Trades', 'Investigation fees sold this month (from leads.taxFee)', 'Leads page'],
        ['MTD 2nd Trades', 'Resolution fees collected this month (from payments)', 'Payments page'],
        ['Unpaid Invoices', 'Outstanding invoice count', 'AR page'],
        ['Open Tasks', 'Incomplete tasks assigned to you', 'Tasks page'],
        ['Upcoming DL', 'IRS/state deadlines in next 14 days', 'Cases page'],
        ['Overdue DL', 'Deadlines already past', 'Cases page'],
        ['AR Outstanding', 'Total unpaid balance across all clients', 'AR page'],
      ]},
      { type: 'info', text: '1st Trades (investigation fees) and 2nd Trades (resolution fees) measure different things by design. 1st Trades = fees sold from leads this month. 2nd Trades = money actually collected in payments. They will not match — that\'s correct.' },
      { type: 'h3', text: 'Time zone display' },
      { type: 'info', text: 'The top-right corner shows Eastern, Central, Mountain, Pacific, Alaska, and Hawaii time simultaneously — useful when calling clients across time zones.' },
    ]
  },
  {
    id: 'leads', icon: '🎯', label: 'Leads', category: 'Client Pipeline',
    title: 'Leads',
    content: [
      { type: 'lead', text: 'A lead is anyone who has not yet signed an investigation agreement. Every new inquiry starts here. The pipeline tracks exactly where each lead is in the sales process.' },
      { type: 'h3', text: 'Creating a lead' },
      { type: 'steps', items: [
        { title: 'Go to Leads → + New Lead', desc: 'Fill in name, phone, email, and client type: Individual, Business, or Individual & Business. For Individual & Business, both the person\'s name AND the business name are stored separately — the person\'s name is the key the whole system uses.' },
        { title: 'Set the tax issue and investigation fee', desc: 'Enter the issue type (IRS balance, payroll tax, state, etc.), estimated tax owed, and the investigation fee. This fee populates MTD 1st Trades on the dashboard automatically.' },
        { title: 'Set the service agreement details (Nashville)', desc: 'Nashville leads include 12 service checkboxes (IA, OIC, Penalty Abatement, etc.), Sales Rep, Contract Fee, and a 3-trade payment schedule. These pre-fill the Addendum modal and carry through to the client on conversion.' },
        { title: 'Assign a Tax Advisor and Tax Associate', desc: 'Assigned To = the Tax Advisor (Associate at Nashville) who owns this lead. Tax Associate (Para) = the support person. Both get notified and tasks will auto-assign to them based on these roles.' },
        { title: 'Save — the lead is now in the pipeline', desc: 'Appears on the Leads page, dashboard, and the assigned rep\'s view.' },
      ]},
      { type: 'h3', text: 'Lead pipeline statuses' },
      { type: 'table', headers: ['Status', 'Meaning', 'Set how'], rows: [
        ['New Lead', 'Just entered', 'Auto on create'],
        ['Contacted', 'Outreach made', 'Manual'],
        ['Consultation Scheduled', 'Booking confirmed', 'Auto when booking created'],
        ['Consultation Completed', 'Consult happened', 'Manual'],
        ['Full Package Sent', 'E-sign package sent', 'Auto when package sent'],
        ['Tax Inv Agreement Signed', 'Package signed — tasks auto-created', 'Auto when signed'],
        ['Tax Investigation Active', 'Investigation underway', 'Manual'],
        ['Converted to Client', 'Now a full client', 'Auto on conversion'],
        ['Not Interested', 'Closed — no sale', 'Manual'],
      ]},
      { type: 'h3', text: 'Quick actions on a lead' },
      { type: 'cards', items: [
        { icon: '📦', title: 'Send Full Package', body: 'Sends Tax Service Agreement + Form 2848 + Form 8821 + State POA all in one e-sign envelope. When signed, the status advances automatically and 6 workflow tasks are created.' },
        { icon: '📋', title: 'Send Financial Intake', body: 'Sends a link to the 433-F financial intake wizard. Client fills it online — employment, income, expenses, assets. Data flows into the Financial Profile tab and pre-fills the 433-F form.' },
        { icon: '✍️', title: 'E-Signature', body: 'Send any individual document for e-signature. Options: Tax Service Agreement, Form 2848, Form 8821, Fee Agreement Addendum (auto-creates 3 installments when signed), 9465, OIC Application, or Custom.' },
        { icon: '💰', title: 'Send Payment Link', body: 'Sends a secure Stripe checkout link via email or SMS. Client pays on their device. Payment is captured and logged automatically as a note.' },
        { icon: '📅', title: 'Send Booking Link', body: 'Sends the online scheduling link. Client picks their own time from your available slots — just like Calendly but built in. Confirmation emails and 24h/1h reminders fire automatically.' },
        { icon: '📠', title: 'Send Fax', body: 'Fax a document directly from the lead file. The TO field starts blank — enter the fax number manually (not pre-filled with phone since phone ≠ fax). Confirmation logged as a note.' },
        { icon: '📧', title: 'Send Email', body: 'Send from pre-built templates (strike notices, onboarding, etc.) or compose custom. Sends from your firm\'s email address. Logged as a note automatically.' },
        { icon: '💬', title: 'Send SMS', body: 'Text the client directly. Templates include {name}, {firm}, and {phone} placeholders that fill from the client record. Reply thread tracked on the file.' },
      ]},
      { type: 'warn', text: 'Every action on a lead must write a note. The system does this automatically for every action listed above — calls, emails, texts, faxes, documents sent, bookings created. Never try to manually duplicate what the system already logs.' },
    ]
  },
  {
    id: 'esign', icon: '✍️', label: 'E-Signatures', category: 'Documents',
    title: 'E-Signatures',
    content: [
      { type: 'lead', text: 'Send documents for electronic signature directly from any lead or client file. No DocuSign account needed — everything is built in. The client gets an email with a secure link, signs with a typed signature, and the document is filed automatically.' },
      { type: 'h3', text: 'How to send an e-sign request' },
      { type: 'steps', items: [
        { title: 'Open the lead or client → E-Signatures tab or Quick Action', desc: 'The "Send Full Package" quick action is the fastest path — it bundles 2848 + 8821 + State POA + Tax Service Agreement into one envelope.' },
        { title: 'Choose document type and add a message', desc: 'For the E-Sign tab: Tax Service Agreement, Form 2848 (POA), Form 8821 (Tax Info Auth), Fee Agreement Addendum, 9465 Installment Agreement, OIC Application (656), or Custom Document.' },
        { title: 'Send — client receives a secure email link', desc: 'The link goes to the SignPage — a branded, public-facing signing page showing your firm\'s name and logo. No account needed. The client reviews and signs with their typed name.' },
        { title: 'Signature fires automatically', desc: 'The signed document is filed under Documents. A note is created on the file with a timestamp. If it\'s the Full Package, the pipeline advances and 6 workflow tasks are created immediately.' },
      ]},
      { type: 'h3', text: 'What you can track' },
      { type: 'table', headers: ['Column on E-Signs page', 'What it shows'], rows: [
        ['Sent', 'When the e-sign request was sent'],
        ['Opened', 'When the client first opened the signing link — if blank, they haven\'t looked at it yet'],
        ['Reminders', 'How many automatic reminders have been sent'],
        ['Status', 'Pending / Signed / Expired'],
        ['Signed', 'Date and time the signature was completed'],
      ]},
      { type: 'tip', text: 'Automatic reminders fire on Day 1, Day 3, and Day 7 after sending — every morning at 9 AM ET. You don\'t need to chase clients manually. Check the Opened column to see if they\'ve even looked at it.' },
      { type: 'h3', text: 'What fires when the Full Package is signed' },
      { type: 'flow', items: ['Client Signs', 'Status → Signed', 'Pipeline → Tax Inv Agreement Signed', '6 Workflow Tasks Created', 'Documents Filed', 'Note Logged ✓'] },
      { type: 'h3', text: 'Fee Agreement Addendum — special behavior' },
      { type: 'info', text: 'When the Fee Agreement Addendum is signed, the system automatically creates 3 payment installments based on the contract fee and schedule from the service agreement. These appear in the client\'s Payments tab immediately.' },
    ]
  },
  {
    id: 'conversion', icon: '🔄', label: 'Converting to Client', category: 'Client Pipeline',
    title: 'Converting a lead to a client',
    content: [
      { type: 'lead', text: 'Once the investigation agreement is signed and payment is collected, convert the lead to a full client with one click. Everything carries over — no re-entry.' },
      { type: 'info', text: 'When a client signs the Full Package, the system automatically advances the lead to "Tax Inv Agreement Signed" and creates workflow tasks. You still manually click Convert when you\'re ready to move them into the client roster.' },
      { type: 'h3', text: 'Steps to convert' },
      { type: 'steps', items: [
        { title: 'Confirm agreement is signed and payment received', desc: 'Check the E-Signatures tab for a Signed status and the Payments tab for the investigation fee.' },
        { title: 'Click "Convert to Client" from the lead quick actions', desc: 'The system checks for duplicate clients by name before creating the record. A double-click or race condition won\'t create two clients.' },
        { title: 'A client record and a case are created automatically', desc: 'All notes, documents, tasks, and payment methods carry over. A case is created and linked to the client. You land directly on the new client file.' },
        { title: 'Pipeline stage is set to "Investigation"', desc: 'Update to match where the case actually stands. The 6 workflow tasks already exist on the file from when the package was signed.' },
      ]},
      { type: 'h3', text: 'What carries over automatically' },
      { type: 'cards', items: [
        { icon: '📝', title: 'All notes & activity', body: 'Every call log, email, SMS, fax confirmation, and manual note — the complete history transfers to the client file.' },
        { icon: '📄', title: 'Documents', body: 'Signed agreements, POAs, financial intake PDFs, and any uploaded files are already on the client from day one.' },
        { icon: '💳', title: 'Payment methods', body: 'Saved cards from the lead are re-linked to the new client record. The 3 installment records from the addendum also carry.' },
        { icon: '✅', title: 'Workflow tasks', body: 'The 6 investigation tasks created when the package was signed remain open and re-link to the client. No re-triggering needed.' },
        { icon: '📋', title: 'Financial intake data', body: 'The 433-F data the client completed online is on the Financial Profile tab, ready to generate the form.' },
        { icon: '🏢', title: 'Business info', body: 'Business name, EIN, business address, and entity type all carry. The client file shows both personal and business sections.' },
      ]},
    ]
  },
  {
    id: 'clients', icon: '🏢', label: 'Clients & Cases', category: 'Client Pipeline',
    title: 'Clients & Cases',
    content: [
      { type: 'lead', text: 'The client file is the single source of truth for everything about that taxpayer. Every tab is a different lens on the same case.' },
      { type: 'h3', text: 'Client file tabs' },
      { type: 'table', headers: ['Tab', 'What\'s there'], rows: [
        ['Overview', 'Contact info, case summary, pipeline stage, assigned reps, all quick actions'],
        ['Notes & Activity', 'Every communication, document sent, status change, and manual note — in chronological order. The complete file history.'],
        ['Documents', 'All signed agreements, POAs, uploaded files, and generated forms — organized by folder (POA & Forms, Agreements, etc.)'],
        ['Tasks', 'Open and completed tasks linked to this client, with due dates and assigned reps'],
        ['E-Signatures', 'All e-sign requests — status, sent date, opened date, reminder count, and signed date'],
        ['Payments', 'Payment history, saved cards, 3-installment plan, invoices, and payment links sent'],
        ['Transactions', 'Full imported QuickBooks payment history ($4.12M for Nashville synced)'],
        ['Financial Profile', 'The completed 433-F / financial intake data — income, expenses, assets, employment, filing status'],
        ['IRS Portal', 'Transcript pulls, POA/CAF tracker, compliance records, CSED dates, assessment history'],
        ['Calls', 'Call logs with duration, outcome, Groq Whisper transcript, AI summary, and auto-created action items'],
        ['Cases', 'The linked case record — resolution stage, IRS deadlines, compliance status'],
        ['State Forms', 'State POA tracker, state-specific forms, and generated state documents'],
      ]},
      { type: 'h3', text: 'Pipeline stages' },
      { type: 'table', headers: ['Stage', 'What\'s happening'], rows: [
        ['Investigation', 'Active tax investigation — pulling transcripts, contacting IRS/state'],
        ['Financials', 'Financial intake received, building the resolution plan'],
        ['Negotiation', 'Actively negotiating with IRS or state'],
        ['Resolution Pending', 'Proposal submitted (OIC, IA, etc.) — awaiting IRS decision'],
        ['Collection Hold', 'Currently protected from collection action (CDP, TDC, etc.)'],
        ['Compliance Filing/Payment', 'Filing delinquent returns or making required payments'],
        ['Penalty Abatement', 'Abatement request submitted and pending'],
        ['Resolved', 'Resolution accepted by IRS/state'],
        ['Monitoring/Review', 'Post-resolution compliance monitoring period'],
        ['Close File', 'Case complete and closed'],
      ]},
      { type: 'h3', text: 'Searching clients' },
      { type: 'info', text: 'The client search covers: name, spouse name, phone, email, city, business name, SSN, EIN, tags, associate, and para. You can find any of Nashville\'s 755 clients by any of these fields instantly.' },
    ]
  },
  {
    id: 'workflows', icon: '⚡', label: 'Workflow Templates', category: 'Tasks & Workflows',
    title: 'Workflow templates',
    content: [
      { type: 'lead', text: 'Workflow templates are pre-built task checklists that fire automatically when triggered. The Tax Investigation templates fire the moment a client signs the Full Package — no manual setup.' },
      { type: 'h3', text: 'Templates available' },
      { type: 'table', headers: ['Template', 'Triggers when', 'Assigned to'], rows: [
        ['Tax Investigation — Personal (IRS)', 'Full Package signed by an individual or Individual & Business client', 'Steps 1-5 → Tax Associate/Para. Step 6 → Tax Advisor/Associate.'],
        ['Tax Investigation — Business (IRS)', 'Manual apply only', 'Same role split'],
        ['Tax Investigation — State', 'Manual apply only', 'Same role split — "Contact IRS" becomes "Contact State"'],
      ]},
      { type: 'info', text: 'Business and State templates stay manual because every Full Package signs the same doc type ("Full Investigation Package") — arming all three would create duplicate tasks on every signature. The rep applies Business or State manually after reviewing the case.' },
      { type: 'h3', text: 'The 6-step investigation checklist' },
      { type: 'steps', items: [
        { title: 'Download signed POA & file', desc: 'Retrieve the signed 2848/8821 from the Documents tab. Save it to your local files for submission.' },
        { title: 'Fax to IRS', desc: 'Fax the signed POA to the appropriate IRS fax number for the CAF unit. Log the fax confirmation number.' },
        { title: 'Contact IRS', desc: 'Call Practitioner Priority Service (PPS) at 866-860-4259. Confirm POA receipt and pull the full case history — balance, CSED dates, collection status, open periods.' },
        { title: 'Request transcripts & records', desc: 'Pull IMFOL, BMFOL, ACSS, and IRPTR via IRS e-Services or A2A. Upload transcripts to the client\'s IRS Portal tab.' },
        { title: 'Update info & notify Tax Advisor', desc: 'Update the case pipeline stage, CSED dates, and compliance status. Notify the advisor so they can review findings.' },
        { title: 'Review financial intake & build resolution plan', desc: 'Tax Advisor reviews the 433-F data and determines the resolution path: OIC, IA, CNC, Penalty Abatement, etc. Due in 7 days.' },
      ]},
      { type: 'h3', text: 'Task assignment rules' },
      { type: 'table', headers: ['Role in template', 'Who gets the task'], rows: [
        ['ADVISOR', 'The Tax Advisor (or Associate at Nashville) listed in the Assigned To field on the client'],
        ['ASSOCIATE', 'The Tax Associate (or Para at Nashville) listed on the client. If none set, auto round-robins to the next available associate.'],
      ]},
      { type: 'warn', text: 'Editing a workflow template does NOT update tasks already created from it. To use updated steps on an existing client, delete the old tasks manually and sign a fresh package to re-trigger the template.' },
      { type: 'h3', text: 'Applying a template manually' },
      { type: 'info', text: 'Open the client file → Tasks tab → "Apply a workflow template →" → select the template. Tasks are created instantly, assigned by role, spaced 1 second apart to preserve sort order.' },
    ]
  },
  {
    id: 'tasks', icon: '✅', label: 'Tasks', category: 'Tasks & Workflows',
    title: 'Tasks',
    content: [
      { type: 'lead', text: 'Tasks are the checklist that keeps cases moving. Every task is linked to a client or lead, has a due date, and is assigned to a specific person. Completed tasks stay on the file permanently — they\'re soft-deleted, never gone.' },
      { type: 'h3', text: 'Creating a task' },
      { type: 'cards', items: [
        { icon: '👤', title: 'From the client file', body: 'Tasks tab → Add Task. Client link pre-fills. Or use the ⚡ quick-pick dropdown for common tasks without opening the modal.' },
        { icon: '📋', title: 'From the Tasks page', body: 'Global task list → + Add. Type the client or lead name to link it. The template picker resolves whether the name is a client or lead automatically.' },
        { icon: '⚡', title: 'From workflow templates', body: 'Apply a template to create a full checklist at once — 6 tasks, pre-assigned by role, due dates spaced out.' },
      ]},
      { type: 'h3', text: 'Quick-pick common tasks' },
      { type: 'info', text: 'The ⚡ dropdown on the task form includes: 📞 Call Client · 📠 Fax to IRS · 📧 Send Email · 📄 Pull Transcripts · ✅ Review Financial Intake · 📑 File Return · ⚖️ Review OIC · 🔔 Follow Up · 📬 Send Letter · 📋 Update Case Notes' },
      { type: 'h3', text: 'Sort order' },
      { type: 'info', text: 'Tasks sort by due date ascending, then by creation time. Workflow templates space tasks 1 second apart at creation time so they appear in the correct order even when due dates match.' },
    ]
  },
  {
    id: 'calling', icon: '📞', label: 'Calling', category: 'Communications',
    title: 'Calling',
    content: [
      { type: 'lead', text: 'The CRM includes a full phone system powered by SignalWire. Make and receive calls directly in the browser — no desk phone needed. Every call is logged automatically on the client or lead file.' },
      { type: 'h3', text: 'Making an outbound call' },
      { type: 'steps', items: [
        { title: 'Click any phone number in the CRM', desc: 'Phone numbers on leads, clients, and the employee directory are clickable. One click dials.' },
        { title: 'The Active Call Bar appears at the bottom of the screen', desc: 'Shows the number, elapsed time, and all call controls. You can navigate anywhere in the CRM while the call is active.' },
        { title: 'Use call controls while connected', desc: 'Mute, hold (parks caller with hold music), transfer to another rep by their extension, or add a third caller to the conference.' },
        { title: 'Hang up — call is logged automatically', desc: 'A note is added to the client\'s Notes & Activity with the duration and outcome. The call also appears in the Calls tab.' },
      ]},
      { type: 'h3', text: 'Inbound call flow' },
      { type: 'flow', items: ['Client calls main number', 'IVR answers', 'Client presses extension', 'Rep\'s browser rings', 'Rep answers or voicemail'] },
      { type: 'h3', text: 'Call controls' },
      { type: 'table', headers: ['Control', 'What it does'], rows: [
        ['Mute', 'Silences your mic — the caller stays connected but can\'t hear you'],
        ['Hold', 'Parks the caller with hold music — they hear music, you\'re free to talk'],
        ['Transfer', 'Transfer to another rep by their extension number (101, 102, etc.)'],
        ['Add Caller', 'Add a third party to the call — creates a conference'],
        ['Hang Up', 'Ends the call for everyone'],
      ]},
      { type: 'h3', text: 'AI Call Summaries' },
      { type: 'info', text: 'After every recorded call, Groq Whisper transcribes the audio and LLaMA analyzes it. The Calls tab on the client file shows the full transcript, an AI-generated summary of key points and client concerns, and any action items identified — which are auto-created as tasks on the file.' },
      { type: 'h3', text: 'Voicemail' },
      { type: 'info', text: 'If no rep answers, calls roll to voicemail. Recordings appear in the call log. The system does not forward to personal phones — all calls route through the CRM browser.' },
    ]
  },
  {
    id: 'email', icon: '📧', label: 'Email', category: 'Communications',
    title: 'Email',
    content: [
      { type: 'lead', text: 'Send and receive email directly in the CRM. Every email sent from a client file is logged as a note automatically. Inbound emails from clients match to their file and log as notes too.' },
      { type: 'h3', text: 'Email providers' },
      { type: 'table', headers: ['Office', 'Email system'], rows: [
        ['Tax Case Review', 'Gmail — connected per-employee via Google OAuth'],
        ['Nashville Tax Solutions', 'Microsoft 365 — connected via Azure + M365 OAuth per employee'],
      ]},
      { type: 'h3', text: 'Sending from a client file' },
      { type: 'steps', items: [
        { title: 'Open client → Quick Actions → Send Email', desc: 'Or click the email icon next to the client\'s email address.' },
        { title: 'Choose a template or compose', desc: 'Templates pre-fill subject and body. {name}, {firm}, and {phone} substitute automatically from the client record and your firm settings.' },
        { title: 'Send — logged immediately as a note', desc: 'Shows as "Email sent" in Notes & Activity with the subject line and timestamp.' },
      ]},
      { type: 'h3', text: 'Email templates' },
      { type: 'table', headers: ['Template', 'When to use'], rows: [
        ['1st Strike — Payment', 'First missed payment reminder'],
        ['2nd Strike — Payment', 'Second missed payment — more urgent'],
        ['3rd Strike — Payment', 'Final warning before account action'],
        ['1st Strike — Documents', 'First reminder for missing documents'],
        ['2nd Strike — Documents', 'Second reminder — escalated tone'],
        ['3rd Strike — Documents', 'Final request before escalation'],
        ['Not Responsible Notice', 'Notify client they\'re not responsible for a specific liability'],
        ['Revoke POA', 'Notify client and IRS of POA revocation'],
      ]},
      { type: 'h3', text: 'Email inbox' },
      { type: 'info', text: 'The Email page shows your connected inbox with real-time notifications for new messages. New emails trigger a browser notification when you\'re on another page. Compose and reply directly — replies are logged to the matching client file.' },
    ]
  },
  {
    id: 'chat', icon: '🗨️', label: 'Team Chat & Huddles', category: 'Communications',
    title: 'Team Chat & Huddles',
    content: [
      { type: 'lead', text: 'Team Chat is your internal communication hub. Channels for group discussions, direct messages for one-on-one, and full video huddles — all without leaving the CRM.' },
      { type: 'h3', text: 'Channels & direct messages' },
      { type: 'info', text: 'The default channel is #general. Admins can create additional channels (e.g. #collections, #payroll). Click any employee name in the left sidebar to open a direct message. Each DM is a private symmetric channel — only the two participants can see it.' },
      { type: 'h3', text: 'Message notifications' },
      { type: 'info', text: 'When you receive a message while on another page, the CRM fires a browser notification (if permitted) and a clickable toast at the bottom of the screen. Clicking either takes you directly to that conversation. Your own messages never trigger notifications.' },
      { type: 'h3', text: 'Starting a huddle' },
      { type: 'steps', items: [
        { title: 'Click "Start Huddle" in the sidebar or right-click any employee name', desc: 'Right-click → Start Huddle opens a direct video call with that person.' },
        { title: 'The full-screen huddle opens', desc: 'Large video tiles for everyone in the call. Controls are at the bottom, just like a Slack huddle.' },
        { title: 'Invite others with the 👥 Invite button', desc: 'Teammates receive a notification and join button in chat. Click the join message to enter the huddle.' },
        { title: 'Minimize if you need to use the CRM', desc: 'Click ⬇ Minimize to collapse to a small bar. Click ⬆ Open to bring it back full-screen.' },
      ]},
      { type: 'h3', text: 'Huddle controls' },
      { type: 'table', headers: ['Button', 'What it does'], rows: [
        ['🎤 Mic', 'Toggle your microphone on/off'],
        ['📹 Camera', 'Toggle your camera on/off'],
        ['🖥️ Share', 'Share your screen — all participants see it immediately'],
        ['🖼️ BG', 'Change or blur your video background'],
        ['✋ Raise', 'Raise your hand — appears as a badge on your video tile, visible to all'],
        ['😊 React', 'Send a floating emoji reaction that animates up the screen for all participants'],
        ['💬 Thread', 'Open the huddle thread — send messages during the call, saved after it ends'],
        ['⬇ Minimize', 'Shrink to a small bar at the top of chat so you can keep using the CRM'],
        ['📵 Leave', 'Leave the huddle'],
      ]},
      { type: 'h3', text: 'Slack integration' },
      { type: 'info', text: 'Team Chat bridges to your Slack workspace. Messages sent in the CRM can forward to a Slack channel, and Slack replies come back. Import your existing Slack history via CRM Companies → your office → Import Slack History.' },
    ]
  },
  {
    id: 'forms', icon: '📄', label: 'IRS & State Forms', category: 'Documents',
    title: 'IRS & State Forms',
    content: [
      { type: 'lead', text: 'Generate pre-filled IRS authorization forms from the client record. Rep name, CAF number, PTIN, phone, fax, and your signature all populate automatically — no manual data entry.' },
      { type: 'h3', text: 'Forms you can generate' },
      { type: 'table', headers: ['Form', 'Purpose', 'Auto-filled from'], rows: [
        ['Form 2848', 'Power of Attorney — authorizes you to represent the client before IRS', 'Client SSN/EIN, tax years, rep CAF/PTIN, firm phone/fax, rep signature'],
        ['Form 8821', 'Tax Information Authorization — IRS discloses info to you', 'Same as 2848'],
        ['State POA', 'Florida (and other states) POA for state tax representation', 'Client info, state-specific fields, rep block'],
        ['Form 433-F', 'Collection Information Statement — financial profile for OIC/IA', 'Populated from the Financial Intake the client completed online'],
        ['FL Articles of Organization', 'Florida LLC formation document for business clients', 'FormaCorp wizard — client business name, RA, members/managers'],
      ]},
      { type: 'warn', text: 'State forms print the full SSN — states reject masked identifiers. IRS forms show only the last 4 digits. This is by design and matches IRS/state requirements.' },
      { type: 'h3', text: 'Form 2848 details' },
      { type: 'info', text: 'Both individual and business 2848s are available. Business POA uses "Managing Member" as the signer title by default. Both templates have your rep signature, CAF number, and PTIN pre-baked. The date on the form is always the date the client signed — never the date it was prepared.' },
      { type: 'h3', text: 'How to generate' },
      { type: 'steps', items: [
        { title: 'Open client → IRS Portal or State Forms tab', desc: 'Find the form you need in the list.' },
        { title: 'Click "Pre-Fill" or "Generate"', desc: 'The system pulls client info and your firm\'s credentials and fills the PDF using pdf-lib.' },
        { title: 'Review in the print window, then print or fax', desc: 'A print window opens. You can fax directly from the lead or client Quick Actions using the Send Fax button.' },
      ]},
    ]
  },
  {
    id: 'financial', icon: '📊', label: 'Financial Intake & 433-F', category: 'Documents',
    title: 'Financial Intake & Form 433-F',
    content: [
      { type: 'lead', text: 'The Financial Intake is a digital version of Form 433-F that clients complete online through a secure link. Their answers populate the Financial Profile tab and pre-fill the actual 433-F PDF.' },
      { type: 'h3', text: 'How it works' },
      { type: 'steps', items: [
        { title: 'Send the financial intake link', desc: 'From the lead or client quick actions → "Send Financial Intake." An email goes to the client with a secure, branded link.' },
        { title: 'Client completes the wizard', desc: 'The intake covers: filing status, dependents, employment/income, business income, monthly expenses (housing, utilities, food, transportation, insurance, etc.), bank accounts, assets, credit cards, and other liabilities. Each section matches the 433-F exactly.' },
        { title: 'Data lands in the Financial Profile tab', desc: 'Every field the client fills populates the Financial Profile immediately. You can see it in real time as they complete it.' },
        { title: 'Generate the 433-F', desc: 'The 433-F PDF pre-fills from the Financial Profile data. Review, then print or include in the resolution package.' },
      ]},
      { type: 'h3', text: 'Withholding estimates' },
      { type: 'info', text: 'When the client enters gross pay, the intake automatically estimates federal withholding (based on 2025 tax rates and standard deduction by filing status), FICA (exact: 6.2% SS to wage base + 1.45% Medicare), and state withholding for FL/TX (0%). These are estimates — real withholding depends on the W-4, which varies per employee.' },
      { type: 'warn', text: 'If the office has no Gmail connected, sending the financial intake copies the link to clipboard instead of emailing it. This is by design — paste it into your own email or text the client directly.' },
    ]
  },
  {
    id: 'payments', icon: '💳', label: 'Payments', category: 'Money',
    title: 'Payments',
    content: [
      { type: 'lead', text: 'Collect payments by card, set up installment plans, track AR, and send payment links — all from the client file. Nashville uses two separate merchant accounts for Nashville Tax Solutions clients and Nationwide Professionals clients.' },
      { type: 'h3', text: 'Charging a card' },
      { type: 'steps', items: [
        { title: 'Open client → Payments tab → Charge', desc: 'Or use "Charge Resolution Fee" from the quick actions on the overview.' },
        { title: 'Enter amount and select card', desc: 'Saved cards from previous transactions appear here. Or enter a new card manually — it saves for future charges.' },
        { title: 'Confirm — Stripe processes the payment', desc: 'Receipt emailed to client. Payment appears in the Payments page and on the client\'s Payments tab. A note is logged automatically.' },
      ]},
      { type: 'h3', text: 'Installment plans from the Addendum' },
      { type: 'info', text: 'When the Fee Agreement Addendum is signed, the system automatically creates 3 scheduled payment installments from the contract fee and 3-trade payment schedule. These appear immediately in the client\'s Payments tab with their due dates.' },
      { type: 'h3', text: 'Send Payment Link' },
      { type: 'info', text: 'Quick Actions → Send Payment Link sends a secure Stripe checkout link via email or SMS. The client pays on their own device — no card entry needed on your end. Payment is captured and logged automatically.' },
      { type: 'h3', text: 'Payments page' },
      { type: 'info', text: 'The Payments page shows all cleared and pending payments across all clients. Click any column header to sort. Use the print button for a payment report. The Reference/Memo field lets you add notes to any payment.' },
      { type: 'h3', text: 'Transactions page' },
      { type: 'info', text: 'Shows the full imported QuickBooks payment history — 4,031 transactions totaling $9.47M for Nashville. 2,642 are matched to clients. Filter by status, associate, or date range.' },
    ]
  },
  {
    id: 'transcripts', icon: '📜', label: 'Transcripts & IRS Portal', category: 'IRS Tools',
    title: 'Transcripts & IRS Portal',
    content: [
      { type: 'lead', text: 'Pull IRS transcripts, track your POAs, and manage compliance records from the IRS Portal tab on each client file.' },
      { type: 'h3', text: 'Transcript types' },
      { type: 'table', headers: ['Transcript', 'Code', 'What it shows'], rows: [
        ['Account Transcript', 'IMFOL (individual) / BMFOL (business)', 'Payment history, assessments, penalty & interest, CSED dates, TC codes'],
        ['Wage & Income', 'IRPTR', 'All W-2s, 1099s, and income documents filed with IRS'],
        ['Tax Return', 'RTVUE', 'Copy of the filed return as IRS received it'],
        ['Record of Account', 'TRDBV', 'Combined return + account in one transcript'],
      ]},
      { type: 'h3', text: 'Pulling transcripts' },
      { type: 'steps', items: [
        { title: 'Download the PDF transcript from IRS e-Services or A2A', desc: 'Log into IRS e-Services → Transcript Delivery System. Download the transcript PDF for your client.' },
        { title: 'Upload to the IRS Portal tab → Pull Transcripts', desc: 'The built-in parser reads the PDF using pdf.js and rule-based parsing — no AI API cost. It extracts balance, CSED dates, TC codes, and assessment history automatically.' },
        { title: 'Data populates the compliance record', desc: 'CSED dates, assessment history, and balance appear on the client\'s compliance record. Use for OIC feasibility, CSED countdown, and resolution planning.' },
      ]},
      { type: 'h3', text: 'CAF/POA tracker' },
      { type: 'info', text: 'The POA tracker shows every Form 2848 and 8821 filed for the client — sent date, fax confirmation, IRS processing status. Track which tax years and periods your POA covers.' },
      { type: 'h3', text: 'A2A automatic pull' },
      { type: 'info', text: 'A2A (Automated to Automated) transcript pull is built in. It activates when IRS enrollment completes under your EA credentials and CAF number. Until then, transcripts import from manually downloaded PDFs. The A2A swap point is already built — it\'s an IRS-controlled timeline, not a CRM limitation.' },
    ]
  },
  {
    id: 'booking', icon: '📅', label: 'Booking', category: 'Portals',
    title: 'Online Booking',
    content: [
      { type: 'lead', text: 'Clients book consultations online — just like Calendly, but built into the CRM. Every booking creates a lead, logs notes, and fires email + SMS reminders automatically.' },
      { type: 'h3', text: 'How booking works' },
      { type: 'steps', items: [
        { title: 'Send the booking link', desc: 'From a lead → Quick Actions → Send Booking Link. The link includes your office\'s tenant code (?t=...) so the booking page shows your firm\'s branding, not a generic page.' },
        { title: 'Client picks their own time', desc: 'Available slots come from your calendar settings — your available hours, appointment duration, and buffer time. The booking page checks real-time availability so clients never double-book.' },
        { title: 'Appointment confirmed automatically', desc: 'The slot appears in your CRM Calendar. A new lead is created if the client doesn\'t already exist. The client gets a branded confirmation email.' },
        { title: 'Reminders fire automatically', desc: '24-hour reminder (email + SMS) and 1-hour reminder (email + SMS) go out before the appointment. You don\'t need to do anything.' },
      ]},
      { type: 'h3', text: 'Rescheduling & cancellation' },
      { type: 'info', text: 'Clients can reschedule or cancel from the confirmation email link — self-serve, no phone call needed. The calendar updates automatically and a note is logged on the lead.' },
      { type: 'h3', text: 'Booking settings' },
      { type: 'info', text: 'Admins set available days, hours, appointment duration (default 30 min), and buffer time in Settings → Booking. The public booking page is at taxrescrm.app/book?t=YOUR_OFFICE_CODE.' },
    ]
  },
  {
    id: 'portal', icon: '🔐', label: 'Client Portal', category: 'Portals',
    title: 'Client Portal',
    content: [
      { type: 'lead', text: 'The Client Portal gives clients a secure, private view of their own case. No account creation — they log in with a magic link sent to their email. Each client only sees their own data, isolated by the RLS system.' },
      { type: 'h3', text: 'What clients can do' },
      { type: 'cards', items: [
        { icon: '📄', title: 'View documents', body: 'See all signed agreements, POAs, and uploaded files in their folder. Download anything.' },
        { icon: '💳', title: 'Pay invoices', body: 'View their outstanding balance and pay with the saved card on file or a new card. Uses Stripe — PCI compliant.' },
        { icon: '📤', title: 'Upload documents', body: 'Upload W-2s, 1099s, bank statements, or anything you request. Files land in their Documents tab immediately.' },
        { icon: '💬', title: 'Send messages', body: 'Message the office directly through the portal. Replies are logged on the client file.' },
      ]},
      { type: 'h3', text: 'How clients log in' },
      { type: 'steps', items: [
        { title: 'Client visits taxrescrm.app/portal', desc: 'They enter their email address.' },
        { title: 'A magic link is sent', desc: 'No password needed. The link is valid for 15 minutes and is single-use.' },
        { title: 'Client accesses their file', desc: 'They see only their own documents, invoices, and messages. RLS ensures zero cross-client data access at the database level.' },
      ]},
      { type: 'h3', text: 'Sending the portal link' },
      { type: 'info', text: 'From any client file → Quick Actions → Send Portal Link. The client receives a branded email with their unique portal URL. The portal shows your firm\'s logo and name, not Tax Case Review\'s.' },
    ]
  },
  {
    id: 'empportal', icon: '👷', label: 'Employee Portal', category: 'Portals',
    title: 'Employee Portal',
    content: [
      { type: 'lead', text: 'The Employee Portal is a simplified mobile-friendly view for staff who need to check their assigned work without full CRM access.' },
      { type: 'h3', text: 'Portal tabs' },
      { type: 'table', headers: ['Tab', 'What\'s shown'], rows: [
        ['Clients', 'All clients assigned to this employee as advisor or associate'],
        ['Cases', 'Active cases where this employee is the advisor or para'],
        ['Messages', 'SMS conversations involving this employee\'s clients'],
      ]},
      { type: 'h3', text: 'Accessing the portal' },
      { type: 'info', text: 'Employees log in at taxrescrm.app/emp with their work email and PIN. The portal shows only their assigned clients — no cross-access. The login screen shows your firm\'s logo based on the email domain before the PIN is entered.' },
      { type: 'h3', text: 'Employee fields' },
      { type: 'info', text: 'Each employee record includes: name, email, role, phone, extension, direct number, team, CAF number, PTIN, avatar photo, and portal PIN. Admins manage these in Settings → Employees.' },
    ]
  },
  {
    id: 'kiosk', icon: '🖥️', label: 'Clock-In Kiosk', category: 'Portals',
    title: 'Clock-In Kiosk',
    content: [
      { type: 'lead', text: 'The kiosk lets employees clock in and out from a shared tablet or office computer — no individual login required.' },
      { type: 'steps', items: [
        { title: 'Open the kiosk URL on the office tablet or computer', desc: 'Nashville kiosk URL: taxrescrm.app/kiosk?t=489ace07-1a6b-4864-833a-4f8420568b40 — the ?t= parameter loads Nashville\'s branding and staff automatically.' },
        { title: 'Employee taps their name', desc: 'All active employees for the office appear with their photo and current status (clocked in / out).' },
        { title: 'Tap Clock In or Clock Out', desc: 'Timestamp is logged in the timeclock system. Hours are visible in Reports → Timeclock.' },
      ]},
      { type: 'info', text: 'Keep the kiosk URL bookmarked on the office device. The page auto-refreshes and requires no ongoing login. Total hours per employee are available in Reports for payroll.' },
    ]
  },
  {
    id: 'ai', icon: '🤖', label: 'AI Assistant', category: 'IRS Tools',
    title: 'AI Assistant',
    content: [
      { type: 'lead', text: 'The 🤖 button in the bottom-right corner of every page is your AI assistant — powered by Groq LLaMA. It reads what\'s on your screen and answers questions, drafts text, and looks up live data.' },
      { type: 'h3', text: 'What it can answer' },
      { type: 'cards', items: [
        { icon: '⚖️', title: 'Resolution strategy', body: '"What resolution options work best for this client?" — it sees the financial profile, pipeline stage, and case details on screen.' },
        { icon: '📅', title: 'CSED calculations', body: '"What\'s the CSED on this assessment?" with dates visible on screen — it calculates the 10-year statute deadline and factors in any tolling events.' },
        { icon: '📧', title: 'Draft client communications', body: '"Draft an update email for this client" — it uses the client\'s name, case details, and current status from the page.' },
        { icon: '🌤️', title: 'Live weather & current info', body: '"Is it going to rain in Lake Park FL today?" — the AI fetches live weather from wttr.in and current info from DuckDuckGo in real time.' },
        { icon: '📜', title: 'IRS processes', body: '"What are the OIC acceptance criteria?" or "How do I request a CDP hearing?" or "What is the Trust Fund Recovery Penalty?" — detailed IRS knowledge.' },
        { icon: '📝', title: 'Anything on your screen', body: 'The AI reads visible text from the current page as context. Ask about specific clients, cases, or numbers you see without re-typing them.' },
      ]},
      { type: 'h3', text: 'What it will not do' },
      { type: 'warn', text: 'The AI will refuse to: change passwords, display SSNs/EINs/CAF numbers, show credit card details, access admin settings beyond your role, bulk-export client data, generate impersonation tokens, or help modify payroll records. These restrictions are permanent and cannot be overridden by phrasing the request differently.' },
      { type: 'h3', text: 'Tips' },
      { type: 'tip', text: 'Click "Clear" to start a fresh conversation. The AI keeps context for your current session so follow-up questions work without repeating yourself. Suggested prompts appear when you first open it — click any to try it.' },
    ]
  },
  {
    id: 'settings', icon: '⚙️', label: 'Firm Settings', category: 'Settings & Reports',
    title: 'Firm Settings',
    content: [
      { type: 'lead', text: 'Settings control how the CRM is configured for your office. Only Super Admins have access to all settings. Changes affect your office only — not other firms on the platform.' },
      { type: 'h3', text: 'Settings tabs' },
      { type: 'table', headers: ['Tab', 'What you configure'], rows: [
        ['Firm Profile', 'Firm name, logo, phone, email, address, brand color. The logo appears in the sidebar, all generated documents, client portal, and email signatures.'],
        ['Email & Calendar', 'Connect Gmail (per employee via Google OAuth) or Microsoft 365 (via Azure + M365 OAuth). Each employee connects their own inbox.'],
        ['Calling & Communications', 'SignalWire or Verizon integration, phone numbers, IVR setup, voicemail settings.'],
        ['Team Chat', 'Slack workspace connection — enables two-way bridging between CRM chat and Slack channels.'],
        ['Payments', 'Stripe connect — link your firm\'s Stripe account. Each office uses its own merchant account.'],
        ['Accounting', 'QuickBooks Online and Xero connections — OAuth per tenant. Sync invoices and payments.'],
        ['Storage', 'Document storage usage and settings. Shows how much of the 1GB free tier is used.'],
        ['Booking', 'Available days, hours, appointment duration (default 30 min), buffer time, and pre-booking questions.'],
        ['Workflows', 'Create and edit workflow templates — add steps, change assignments, adjust due dates.'],
        ['Uptime', 'Live status of all connected services: Supabase, email server, Cloudflare, Stripe, M365, Groq, Gemini.'],
      ]},
      { type: 'h3', text: 'Logo upload' },
      { type: 'info', text: 'Upload your logo in Firm Profile. It propagates to: sidebar, all generated documents (agreements, POAs, 2848 cover letters), client portal, employee portal login screen, email signature, appointment confirmation emails, and booking confirmation emails. PNG with transparent background works best.' },
    ]
  },
  {
    id: 'training', icon: '🖥️', label: 'Training & Manual', category: 'Settings & Reports',
    title: 'Training sessions & CRM Manual',
    content: [
      { type: 'lead', text: 'The Training tab has two sections: Live Training for running screen-share sessions with your team, and the CRM Manual (this page) for on-demand reference.' },
      { type: 'h3', text: 'Running a live training session' },
      { type: 'steps', items: [
        { title: 'Click "Start training session"', desc: 'A unique 5-character room code generates. The session goes live immediately — you\'re already sharing as host.' },
        { title: 'Share your screen', desc: 'Click "Share screen" and choose your window, a browser tab, or the full screen. Participants see everything in real time.' },
        { title: 'Send the invite link or email invite', desc: 'Copy the link or click the ✉️ Email Invite button to send branded invitations. Staff click the link and join in their browser — no install, no account.' },
        { title: 'Navigate the CRM normally', desc: 'Click through leads, clients, settings, forms — anything. The session follows you across every page. The session overlay stays alive even when you navigate away.' },
        { title: 'Pop out for full-screen presenting', desc: 'Click ⧉ Pop out to open the host controls in a separate window. Present the full CRM in your main window, unobstructed.' },
        { title: 'End the session', desc: 'Click "End session." All participants are disconnected instantly.' },
      ]},
      { type: 'h3', text: 'During a session' },
      { type: 'table', headers: ['Control', 'What it does'], rows: [
        ['Share screen', 'Broadcasts your screen to all participants in real time'],
        ['Stop sharing', 'Pauses the screen share but keeps the session and room open'],
        ['Pop out', 'Opens host controls in a separate window — present the full CRM unobstructed'],
        ['End session', 'Closes the room and disconnects all participants immediately'],
        ['Room code', 'The 5-character code in the session bar — participants can also join by entering this at the join URL'],
      ]},
      { type: 'tip', text: 'Use the ✉️ Email Invite button to send a branded invite with a one-click Join button directly to your staff\'s email. The invite comes from your firm\'s address and shows your logo.' },
    ]
  },
]

const CATEGORIES = ['Getting Started', 'Client Pipeline', 'Documents', 'Tasks & Workflows', 'Communications', 'Money', 'IRS Tools', 'Portals', 'Settings & Reports']

function ManualPage({ standalone }) {
  const [selected, setSelected] = useState('overview')
  const [search, setSearch] = useState('')

  const filtered = search
    ? MANUAL_SECTIONS.filter(s =>
        s.label.toLowerCase().includes(search.toLowerCase()) ||
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.content.some(b => b.text?.toLowerCase().includes(search.toLowerCase()) ||
          b.items?.some(i => (i.title||'').toLowerCase().includes(search.toLowerCase()) || (i.body||i.desc||'').toLowerCase().includes(search.toLowerCase())))
      )
    : MANUAL_SECTIONS

  const sec = MANUAL_SECTIONS.find(s => s.id === selected) || MANUAL_SECTIONS[0]

  const sidebarH = standalone ? '100vh' : 'calc(100vh - 120px)'
  const contentH = standalone ? '100vh' : 'calc(100vh - 120px)'

  const S = {
    sidebar: { width: 210, flexShrink: 0, borderRight: '1px solid var(--br)', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--sf)', height: sidebarH },
    navItem: (active) => ({ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400, color: active ? '#a5b4fc' : 'var(--t2)', background: active ? 'rgba(99,102,241,.18)' : 'transparent', marginBottom: 1 }),
    content: { flex: 1, overflowY: 'auto', padding: standalone ? '28px 40px 60px' : '4px 28px 40px', height: contentH },
    lead: { fontSize: 14, color: 'var(--t2)', lineHeight: 1.75, marginBottom: 20 },
    h3: { fontSize: 15, fontWeight: 700, color: 'var(--tx)', margin: '24px 0 10px' },
    card: { background: 'var(--s1)', border: '1px solid var(--br)', borderRadius: 10, padding: '13px 15px', flex: '1 1 200px' },
    stepNum: { width: 26, height: 26, borderRadius: '50%', background: 'rgba(99,102,241,.18)', border: '1px solid rgba(99,102,241,.35)', color: '#a5b4fc', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
    flowBox: (special) => ({ background: special ? 'rgba(16,185,129,.12)' : 'rgba(99,102,241,.12)', border: `1px solid ${special ? 'rgba(16,185,129,.3)' : 'rgba(99,102,241,.25)'}`, borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 700, color: special ? '#6ee7b7' : '#a5b4fc', whiteSpace: 'nowrap' }),
    th: { textAlign: 'left', padding: '7px 10px', background: 'rgba(99,102,241,.1)', color: '#818cf8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--br)' },
    td: { padding: '8px 10px', borderBottom: '1px solid rgba(99,102,241,.06)', fontSize: 12, color: 'var(--t2)', verticalAlign: 'top', lineHeight: 1.5 },
    callout: (type) => ({
      borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 12, lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start',
      ...(type === 'tip'  ? { background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.25)', color: '#6ee7b7' } : {}),
      ...(type === 'warn' ? { background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.25)', color: '#fde68a' } : {}),
      ...(type === 'info' ? { background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.25)', color: '#c7d2fe' } : {}),
    }),
  }

  function renderBlock(block, i) {
    switch (block.type) {
      case 'lead': return <p key={i} style={S.lead}>{block.text}</p>
      case 'h3':   return <div key={i} style={S.h3}>{block.text}</div>
      case 'tip':  return <div key={i} style={S.callout('tip')}><span style={{flexShrink:0}}>💡</span><span>{block.text}</span></div>
      case 'warn': return <div key={i} style={S.callout('warn')}><span style={{flexShrink:0}}>⚠️</span><span>{block.text}</span></div>
      case 'info': return <div key={i} style={S.callout('info')}><span style={{flexShrink:0}}>ℹ️</span><span>{block.text}</span></div>
      case 'flow': return (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', margin: '14px 0 20px', rowGap: 8 }}>
          {block.items.map((item, j) => [
            <div key={j} style={S.flowBox(item.includes('✓') || item.includes('⭐'))}>{item}</div>,
            j < block.items.length - 1 && <span key={'a'+j} style={{ color: 'var(--t3)', fontSize: 14, margin: '0 4px' }}>→</span>
          ])}
        </div>
      )
      case 'cards': return (
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '12px 0 20px' }}>
          {block.items.map((c, j) => (
            <div key={j} style={S.card}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 11, color: 'var(--t2)', lineHeight: 1.55 }}>{c.body}</div>
            </div>
          ))}
        </div>
      )
      case 'steps': return (
        <div key={i} style={{ margin: '12px 0 20px' }}>
          {block.items.map((step, j) => (
            <div key={j} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: j < block.items.length - 1 ? '1px solid rgba(99,102,241,.07)' : 'none' }}>
              <div style={S.stepNum}>{j + 1}</div>
              <div style={{flex:1}}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )
      case 'table': return (
        <div key={i} style={{ overflowX: 'auto', margin: '12px 0 20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>{block.headers.map((h, j) => <th key={j} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, j) => (
              <tr key={j}>{row.map((cell, k) => <td key={k} style={{ ...S.td, ...(k === 0 ? { fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' } : {}) }}>{cell}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )
      default: return null
    }
  }

  return (
    <div style={{ display: 'flex', height: sidebarH, overflow: 'hidden', ...(standalone ? {} : { margin: '0 -32px', padding: '0 0 0 32px' }) }}>
      <div style={S.sidebar}>
        <div style={{ padding: '10px 10px 6px' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--t3)' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search the manual…"
              style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, padding: '5px 8px 5px 24px', color: 'var(--tx)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}/>
          </div>
        </div>
        <div style={{ padding: '4px 6px 12px', overflowY: 'auto', flex: 1 }}>
          {search ? (
            filtered.length === 0
              ? <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--t3)' }}>No results</div>
              : filtered.map(s => (
                <div key={s.id} onClick={() => { setSelected(s.id); setSearch('') }} style={S.navItem(selected === s.id)}>
                  <span style={{ fontSize: 13 }}>{s.icon}</span>{s.label}
                </div>
              ))
          ) : (
            CATEGORIES.map(cat => {
              const items = MANUAL_SECTIONS.filter(s => s.category === cat)
              if (!items.length) return null
              return (
                <div key={cat}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '10px 8px 4px' }}>{cat}</div>
                  {items.map(s => (
                    <div key={s.id} onClick={() => setSelected(s.id)} style={S.navItem(selected === s.id)}>
                      <span style={{ fontSize: 13 }}>{s.icon}</span>{s.label}
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>

      <div style={S.content}>
        <div style={{ paddingTop: 4, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--br)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)', marginBottom: 4 }}>{sec.title}</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.07em' }}>{sec.category} · {MANUAL_SECTIONS.findIndex(s => s.id === sec.id) + 1} of {MANUAL_SECTIONS.length}</div>
        </div>
        {sec.content.map((block, i) => renderBlock(block, i))}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--br)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>TaxRes CRM Manual · {MANUAL_SECTIONS.length} sections</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {(() => {
              const idx = MANUAL_SECTIONS.findIndex(s => s.id === selected)
              return [
                idx > 0 && <button key='prev' onClick={() => setSelected(MANUAL_SECTIONS[idx-1].id)} style={{ background: 'var(--s2)', border: '1px solid var(--br)', borderRadius: 7, padding: '5px 12px', color: 'var(--t2)', cursor: 'pointer', fontSize: 11 }}>← {MANUAL_SECTIONS[idx-1].label}</button>,
                idx < MANUAL_SECTIONS.length - 1 && <button key='next' onClick={() => setSelected(MANUAL_SECTIONS[idx+1].id)} style={{ background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.25)', borderRadius: 7, padding: '5px 12px', color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{MANUAL_SECTIONS[idx+1].label} →</button>
              ]
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Manual() {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <ManualPage standalone />
    </div>
  )
}
