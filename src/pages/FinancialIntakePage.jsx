import { useParams } from 'react-router-dom'
import FinancialIntakeWizard from '../components/FinancialIntakeWizard'

export default function FinancialIntakePage() {
  const { id } = useParams()
  return (
    <div style={{ minHeight:'100vh', background:'#020617', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 16px' }}>
      <FinancialIntakeWizard intakeId={id} embedded={false}/>
    </div>
  )
}
