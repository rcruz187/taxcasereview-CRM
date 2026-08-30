import fs from 'node:fs'

const file = 'src/pages/AdminPortal.jsx'
let src = fs.readFileSync(file, 'utf8')
const from = "const TrainingPage = lazy(() => import('./Training'))"
const to = "const TrainingPage = lazy(() => import('./MeetTrainingHub'))"

if (!src.includes(from) && !src.includes(to)) {
  throw new Error('TrainingPage import anchor not found; refusing to modify AdminPortal.jsx')
}

src = src.replace(from, to)
fs.writeFileSync(file, src)
console.log('MeetTrainingHub wired into Admin Portal.')
