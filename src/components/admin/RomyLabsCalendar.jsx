import React, { useEffect, useState } from 'react'
import CalendarPage from '../../pages/Calendar'

// Compatibility wrapper only. The Admin Portal Calendar tab was accidentally
// swapped to a different RomyLabs-specific calendar UI. Keep this component
// because AdminPortal currently imports it, but render the original Calendar
// page and preserve the original tenant/session behavior exactly.
export default function RomyLabsCalendar(){
  const [ready, setReady] = useState(false)

  useEffect(()=>{
    const prev = sessionStorage.getItem('admin_impersonation')
    sessionStorage.removeItem('admin_impersonation')
    setReady(true)
    return ()=>{
      if (prev) sessionStorage.setItem('admin_impersonation', prev)
    }
  },[])

  if (!ready) return null

  return (
    <div
      key="taxrescrm-calendar"
      className="page-content"
      style={{ position:'relative', overflow:'hidden', padding:0, height:'100%', flex:1 }}
    >
      <CalendarPage />
    </div>
  )
}
