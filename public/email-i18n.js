(function () {
  const EN_ES = {
    'Compose': 'Redactar',
    'Inbox': 'Bandeja de entrada',
    'Action Needed': 'Acción necesaria',
    'Waiting': 'En espera',
    'Sent': 'Enviados',
    'Archive': 'Archivo',
    'Templates': 'Plantillas',
    'Select all': 'Seleccionar todos',
    'Search emails…': 'Buscar correos…',
    'Side-by-side': 'Lado a lado',
    'Top and bottom': 'Arriba y abajo',
    'Move to…': 'Mover a…',
    'Clear': 'Limpiar',
    'Delete': 'Eliminar',
    'Archive Selected': 'Archivar seleccionados',
    'Unknown': 'Desconocido',
    'From:': 'De:',
    'Received by:': 'Recibido por:',
    'Unassigned': 'Sin asignar',
    'Reply': 'Responder',
    'Mark as New': 'Marcar como nuevo',
    'Attach to file': 'Adjuntar al expediente',
    'Could not download:': 'No se pudo descargar:',
    'Client': 'Cliente',
    'Subject': 'Asunto',
    'Message': 'Mensaje',
    'To': 'Para',
    'Send': 'Enviar',
    'Cancel': 'Cancelar',
    'Email Templates': 'Plantillas de correo',
    'Use Template': 'Usar plantilla',
    'Back to Inbox': 'Volver a la bandeja',
    'Gmail connected': 'Gmail conectado',
    'Microsoft 365 connected': 'Microsoft 365 conectado',
    'Connect Gmail': 'Conectar Gmail',
    'Connect Microsoft 365': 'Conectar Microsoft 365',
    'Sync now': 'Sincronizar ahora',
    'Syncing…': 'Sincronizando…',
    'Archived': 'Archivado',
    'Marked as new': 'Marcado como nuevo'
  };
  const ES_EN = Object.fromEntries(Object.entries(EN_ES).map(([en, es]) => [es, en]));

  const PATTERNS_ES = [
    [/^(\d+) emails selected$/i, '$1 correos seleccionados'],
    [/^(\d+) email selected$/i, '$1 correo seleccionado'],
    [/^No emails in (.+)$/i, (_, folder) => `No hay correos en ${EN_ES[folder] || folder}`],
    [/^Moved to (.+)$/i, (_, folder) => `Movido a ${EN_ES[folder] || folder}`],
    [/^Moved (\d+) to (.+)$/i, (_, n, folder) => `Se movieron ${n} a ${EN_ES[folder] || folder}`],
    [/^Archived (\d+) emails?$/i, (_, n) => `Se archivaron ${n} correos`],
    [/^Deleted (\d+) emails?$/i, (_, n) => `Se eliminaron ${n} correos`],
    [/^From:\s*/i, 'De: '],
    [/^Received by:\s*/i, 'Recibido por: '],
    [/\s·\sUnassigned$/i, ' · Sin asignar'],
    [/\s·\sAssigned to\s+/i, ' · Asignado a '],
    [/^Attach to (.+)'s file$/i, (_, name) => `Adjuntar al expediente de ${name}`],
    [/^(\d+) attachment\(s\)$/i, '$1 adjunto(s)']
  ];

  const PATTERNS_EN = [
    [/^(\d+) correos seleccionados$/i, '$1 emails selected'],
    [/^(\d+) correo seleccionado$/i, '$1 email selected'],
    [/^No hay correos en (.+)$/i, (_, folder) => `No emails in ${ES_EN[folder] || folder}`],
    [/^Movido a (.+)$/i, (_, folder) => `Moved to ${ES_EN[folder] || folder}`],
    [/^Se movieron (\d+) a (.+)$/i, (_, n, folder) => `Moved ${n} to ${ES_EN[folder] || folder}`],
    [/^Se archivaron (\d+) correos$/i, 'Archived $1 emails'],
    [/^Se eliminaron (\d+) correos$/i, 'Deleted $1 emails'],
    [/^De:\s*/i, 'From: '],
    [/^Recibido por:\s*/i, 'Received by: '],
    [/\s·\sSin asignar$/i, ' · Unassigned'],
    [/\s·\sAsignado a\s+/i, ' · Assigned to '],
    [/^Adjuntar al expediente de (.+)$/i, (_, name) => `Attach to ${name}'s file`]
  ];

  function isEmailWorkspace() {
    return !!document.querySelector('.email-sidebar');
  }

  function shouldSkip(node) {
    const el = node.parentElement;
    if (!el) return true;
    if (el.closest('textarea,input,[contenteditable="true"],script,style,[data-no-translate]')) return true;
    // Email message bodies are rendered as long free-form text; never rewrite them.
    const text = (node.nodeValue || '').trim();
    if (text.length > 140) return true;
    return false;
  }

  function applyPatterns(value, patterns) {
    let out = value;
    for (const [re, replacement] of patterns) {
      if (!re.test(out)) continue;
      re.lastIndex = 0;
      out = typeof replacement === 'function' ? out.replace(re, replacement) : out.replace(re, replacement);
    }
    return out;
  }

  function translateValue(value, language) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const map = language === 'es' ? EN_ES : ES_EN;
    if (map[trimmed]) return value.replace(trimmed, map[trimmed]);
    return applyPatterns(value, language === 'es' ? PATTERNS_ES : PATTERNS_EN);
  }

  function translateNode(root, language) {
    if (!root || !isEmailWorkspace()) return;
    if (root.nodeType === Node.TEXT_NODE) {
      if (shouldSkip(root)) return;
      const next = translateValue(root.nodeValue || '', language);
      if (next !== root.nodeValue) root.nodeValue = next;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const el = root.nodeType === Node.ELEMENT_NODE ? root : null;
    if (el && el.matches('textarea,script,style,[data-no-translate]')) return;
    if (el) {
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        if (!el.hasAttribute(attr)) continue;
        const current = el.getAttribute(attr) || '';
        const next = translateValue(current, language);
        if (next !== current) el.setAttribute(attr, next);
      }
    }
    for (const child of root.childNodes || []) translateNode(child, language);
  }

  let activeLanguage = document.documentElement.lang === 'es' ? 'es' : 'en';
  let scheduled = false;
  function run() {
    scheduled = false;
    activeLanguage = document.documentElement.lang === 'es' ? 'es' : 'en';
    if (isEmailWorkspace()) translateNode(document.querySelector('.email-sidebar')?.parentElement || document.body, activeLanguage);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  const observer = new MutationObserver(schedule);
  function start() {
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'], childList: true, subtree: true, characterData: true });
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
