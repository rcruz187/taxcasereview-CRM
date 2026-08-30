import fs from 'node:fs'

const file = 'src/pages/AdminPortal.jsx'
let src = fs.readFileSync(file, 'utf8')

const navNeedle = "  { path:'/crm-admin/calendar',       label:'Calendar',       icon:'📅' },\n  { path:'/crm-admin/chat',           label:'Chat (All)',      icon:'💬' },"
const navReplacement = "  { path:'/crm-admin/calendar',       label:'Calendar',       icon:'📅' },\n  { path:'/crm-admin/meet',           label:'Meet & Training', icon:'🎥' },\n  { path:'/crm-admin/chat',           label:'Chat (All)',      icon:'💬' },"

const routeNeedle = "            <Route path=\"/calendar\"       element={<AdminRouteErrorBoundary><AdminCalendar/></AdminRouteErrorBoundary>}/>\n            <Route path=\"/training\"       element={<AdminRouteErrorBoundary><AdminTraining/></AdminRouteErrorBoundary>}/>"
const routeReplacement = "            <Route path=\"/calendar\"       element={<AdminRouteErrorBoundary><AdminCalendar/></AdminRouteErrorBoundary>}/>\n            <Route path=\"/meet\"           element={<AdminRouteErrorBoundary><AdminTraining/></AdminRouteErrorBoundary>}/>\n            <Route path=\"/training\"       element={<AdminRouteErrorBoundary><AdminTraining/></AdminRouteErrorBoundary>}/>"

if (!src.includes(navNeedle) && !src.includes("path:'/crm-admin/meet'")) {
  throw new Error('Admin Portal NAV anchor not found; refusing to modify file.')
}
if (!src.includes(routeNeedle) && !src.includes('path="/meet"')) {
  throw new Error('Admin Portal route anchor not found; refusing to modify file.')
}

src = src.replace(navNeedle, navReplacement)
src = src.replace(routeNeedle, routeReplacement)

fs.writeFileSync(file, src)
console.log('RomyLabs Meet Admin Portal patch applied.')
