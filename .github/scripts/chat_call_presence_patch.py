from pathlib import Path

p = Path('src/pages/Chat.jsx')
s = p.read_text()
old = "const presenceCh = supabase.channel('chat-presence', { config: { presence: { key: myName } } })"
new = "const presenceCh = supabase.channel(`chat-presence:${FIRM.tenantId || 'default'}`, { config: { presence: { key: myName } } })"
if new in s:
    print('tenant-scoped presence already current')
elif old in s:
    s = s.replace(old, new, 1)
    p.write_text(s)
    print('scoped chat call/huddle presence to current tenant')
else:
    raise SystemExit('presence channel source shape changed')
