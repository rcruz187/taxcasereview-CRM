import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('public portal uploads are token-bound and never write storage directly', () => {
  const source = read('src/pages/ClientPortal.jsx')
  expect(source).toContain("supabase.functions.invoke('portal-action'")
  expect(source).toContain("type: 'upload_document', token: portalToken")
  expect(source).toContain('fileBase64')
  expect(source).not.toContain("supabase.storage.from('documents').upload(path, file")
  expect(source).not.toContain("portal_action_upload_document")
})

test('public organizer uploads are token-bound and never write storage directly', () => {
  const source = read('src/components/OrganizerWizard.jsx')
  expect(source).toContain("supabase.functions.invoke('organizer-action'")
  expect(source).toContain("type: 'upload_document', organizerId")
  expect(source).toContain('fileBase64')
  expect(source).not.toContain("supabase.storage.from('documents').upload(path, file")
  expect(source).not.toContain('organizer-docs/${organizerId}')
})
