import { createClient } from '@supabase/supabase-js'

const url=process.env.CERT_SUPABASE_URL
const service=process.env.CERT_SUPABASE_SERVICE_ROLE_KEY
const capacityRun=process.env.CERT_RUN_ID
const isolationRun=process.env.CERT_ISOLATION_RUN_ID
if(!url||!service) process.exit(0)
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})
const runs=[capacityRun,isolationRun].filter(Boolean)
if(!runs.length) process.exit(0)

async function deleteByMarker(table,column,run){
  const {error}=await admin.from(table).delete().ilike(column,`%${run}%`)
  if(error) console.error(`cleanup ${table}/${run}: ${error.message}`)
}

for(const run of runs){
  for(const [table,column] of [
    ['chat_messages','text'],['esigns','message'],['calevents','title'],
    ['tasks','notes'],['leads','notes'],['clients','notes'],['employees','notes']
  ]) await deleteByMarker(table,column,run)
}

for(let page=1;page<=20;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000})
  if(error){ console.error(`cleanup auth list: ${error.message}`); break }
  const users=data?.users||[]
  for(const u of users){
    const qaRun=String(u.user_metadata?.qa_run||'')
    if(runs.includes(qaRun)){
      const d=await admin.auth.admin.deleteUser(u.id)
      if(d.error) console.error(`cleanup auth ${u.email}: ${d.error.message}`)
    }
  }
  if(users.length<1000) break
}

console.log(`Cancellation-safe cleanup complete for ${runs.join(', ')}`)
