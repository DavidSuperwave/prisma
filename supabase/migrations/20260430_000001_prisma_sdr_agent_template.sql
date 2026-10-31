insert into public.agent_templates (
  id,
  name,
  description,
  type,
  category,
  default_soul_md,
  default_skills,
  default_knowledge_scope,
  default_cron_jobs,
  default_channel_config,
  default_memory_config,
  icon,
  is_active
)
values (
  '00000000-0000-4000-8000-000000000101',
  'Prisma AI SDR',
  'Califica leads de WhatsApp para la oferta de sitio web gratis y enruta a Calendly o Stripe.',
  'channel',
  'lead_qualification',
  '# Prisma AI SDR

Eres el SDR de Prisma AI por WhatsApp. Respondes corto, haces una pregunta a la vez y calificas negocios para la oferta de sitio web profesional gratis.

Tu flujo base: pregunta a que se dedica la empresa, pregunta cuantas personas trabajan ahi y, si falta evidencia, pregunta cuanto tiempo llevan operando y si tienen oficinas fisicas.

Calificado: mas de 5 empleados, oficinas/sucursales o varios anos operando. En ese caso comparte https://calendly.com/jaime-ailegalgrowth/30min.

No calificado: ofrece el sitio gratis con mantenimiento mensual y comparte https://buy.stripe.com/9B68wOgOw4g8fPk1617EQ0m.

Siempre registra estado, evidencia y siguiente accion en CRM/tareas usando herramientas Prisma.',
  array[
    'prisma-sdr-whatsapp',
    'prisma-crm',
    'prisma-records',
    'prisma-qualify',
    'prisma-tasks',
    'prisma-reply-approve'
  ],
  jsonb_build_object(
    'read', jsonb_build_array('People', 'Contacts', 'Leads', 'Deals', 'Tasks'),
    'write', jsonb_build_array('People', 'Contacts', 'Leads', 'Deals', 'Tasks'),
    'channels', jsonb_build_array('whatsapp'),
    'surfaces', jsonb_build_array('CRM', 'Inbox', 'Tareas', 'Operadores'),
    'sdr_playbook', 'prisma-ai-free-website-v1'
  ),
  '[]'::jsonb,
  jsonb_build_object('provider', 'whatsapp'),
  jsonb_build_object('recent', true, 'preferences', true, 'intelligence', false),
  'message-square',
  true
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  category = excluded.category,
  default_soul_md = excluded.default_soul_md,
  default_skills = excluded.default_skills,
  default_knowledge_scope = excluded.default_knowledge_scope,
  default_cron_jobs = excluded.default_cron_jobs,
  default_channel_config = excluded.default_channel_config,
  default_memory_config = excluded.default_memory_config,
  icon = excluded.icon,
  is_active = excluded.is_active,
  updated_at = now();
