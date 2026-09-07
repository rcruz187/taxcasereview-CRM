import { useParams } from 'react-router-dom'
import OrganizerWizard from '../components/OrganizerWizard'

export default function OrganizerPage() {
  const { id } = useParams()
  return (
    <div style={{ minHeight:'100vh', background:'#020617', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 16px' }}>
      <OrganizerWizard organizerId={id} embedded={false}/>
    </div>
  )
}
