from pathlib import Path

p = Path('src/lib/i18n.js')
s = p.read_text()
anchor = "  'In Progress': 'En progreso',\n  'Low': 'Baja',\n"
block = """  'In Progress': 'En progreso',
  'Low': 'Baja',

  // Calendar workflow.
  'Month': 'Mes',
  'Week': 'Semana',
  'Day': 'Día',
  '+ New Event': '+ Nuevo evento',
  'Event Title': 'Título del evento',
  'Client / Lead': 'Cliente / Prospecto',
  '— No client —': '— Sin cliente —',
  'Start Time': 'Hora de inicio',
  'End Time': 'Hora de finalización',
  'Event Type': 'Tipo de evento',
  'Color / Category': 'Color / Categoría',
  'Recurring': 'Repetición',
  'Repeat': 'Repetir',
  'No repeat': 'No repetir',
  'Daily': 'Diariamente',
  'Weekly': 'Semanalmente',
  'Monthly': 'Mensualmente',
  'Save Event': 'Guardar evento',
  'Saving…': 'Guardando…',
  'Event Details': 'Detalles del evento',
  'Send Meeting Link': 'Enviar enlace de reunión',
  'Meeting link sent': 'Enlace de reunión enviado',
  'No email on file for this client': 'No hay correo registrado para este cliente',
  'Event title and date are required': 'Se requieren el título y la fecha del evento',
  'Event saved': 'Evento guardado',
  'Event deleted': 'Evento eliminado',
  'Open in Google Maps': 'Abrir en Google Maps',
  'Directions': 'Indicaciones',
  'Consultation Call': 'Llamada de consulta',
  'Follow-Up Call': 'Llamada de seguimiento',
  'IRS Call': 'Llamada al IRS',
  'Client Meeting': 'Reunión con cliente',
  'Court / Hearing': 'Tribunal / Audiencia',
  'Internal Meeting': 'Reunión interna',
  'Appointment': 'Cita',

  // Deadlines workflow.
  'Track IRS deadlines, CSED dates, and compliance due dates.': 'Controle vencimientos del IRS, fechas CSED y fechas de cumplimiento.',
  '+ Add Deadline': '+ Agregar vencimiento',
  'Total': 'Total',
  'Overdue': 'Vencido',
  'Due Soon (7d)': 'Próximo a vencer (7 d)',
  'Urgent — Within 7 Days': 'Urgente — Dentro de 7 días',
  'Upcoming': 'Próximos',
  'All Deadlines': 'Todos los vencimientos',
  'No deadlines': 'No hay vencimientos',
  'Deadline Name *': 'Nombre del vencimiento *',
  'Type client name...': 'Escriba el nombre del cliente...',
  'Due Date *': 'Fecha de vencimiento *',
  'Optional details...': 'Detalles opcionales...',
  'Deadline name is required': 'Se requiere el nombre del vencimiento',
  'Due date is required': 'Se requiere la fecha de vencimiento',
  '✅ Deadline added!': '✅ ¡Vencimiento agregado!',
  'Email reminder to client': 'Enviar recordatorio por correo al cliente',
  'Tracking': 'Seguimiento',
  'Action Required': 'Acción requerida',
  'Scheduled': 'Programado',
  'General': 'General',
  'Installment Agreement': 'Acuerdo de pagos',
  'IRS Notice': 'Aviso del IRS',
  'Levy Release': 'Liberación de embargo',
  'Penalty Abatement': 'Reducción de multas',
  'Return Filing': 'Presentación de declaración',
"""
if block in s:
    raise SystemExit('translations already present')
if anchor not in s:
    raise SystemExit('i18n insertion anchor not found')
s = s.replace(anchor, block, 1)
pattern_anchor = "  [/^(\\d+)d$/i, '$1d'],\n"
pattern_new = "  [/^(\\d+)d$/i, '$1d'],\n  [/^(\\d+)d left$/i, 'faltan $1 d'],\n  [/^Urgent — Within 7 Days \\((\\d+)\\)$/i, 'Urgente — Dentro de 7 días ($1)'],\n  [/^All Deadlines \\((\\d+)\\)$/i, 'Todos los vencimientos ($1)'],\n"
if pattern_anchor not in s:
    raise SystemExit('pattern insertion anchor not found')
s = s.replace(pattern_anchor, pattern_new, 1)
p.write_text(s)
