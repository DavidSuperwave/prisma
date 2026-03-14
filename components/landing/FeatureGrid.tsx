'use client'

import React, { useState } from 'react'

type StatCell = {
  value: string
  valueAccent?: boolean
  label: string
}

type DemoTab = {
  id: string
  icon: string
  label: string
  agent: {
    number: string
    title: string
    description: string
    steps: string[]
    industryTag: string
  }
  visual: 'phone' | 'terminal'
  phoneMessages?: { side: 'in' | 'out'; text: string }[]
  terminalLines?: string[]
}

type IndustryRow = {
  id: string
  eyebrowLabel: string
  title: string
  subtitle: string
  tabs: DemoTab[]
}

type AccentStyle = {
  text: string
  pillBg: string
  pillBorder: string
}

const stats: StatCell[] = [
  { value: '+35%', valueAccent: true, label: 'Leads atendidos sin staff extra' },
  { value: '5 días', label: 'De llamada a operador en vivo' },
  { value: '24/7', label: 'Operando aunque tú no estés' },
  { value: '0', valueAccent: true, label: 'Líneas de código para empezar' },
]

const industryRows: IndustryRow[] = [
  {
    id: 'lawyer',
    eyebrowLabel: 'Operadores Prisma Lawyer',
    title: 'Demos de operadores para despachos legales',
    subtitle: 'Calificación, seguimiento y agenda legal con demos interactivos por tab.',
    tabs: [
      {
        id: 'law-intake',
        icon: 'LG',
        label: 'Calificar casos',
        agent: {
          number: 'OPERADOR 01',
          title: 'Calificador de Casos',
          description: 'Recibe consultas, clasifica tipo de caso y deja la ficha lista para revisión legal.',
          steps: [
            'Cliente explica situación por WhatsApp',
            'Operador clasifica tipo, urgencia y monto',
            'Entrega resumen legal para abogado',
          ],
          industryTag: 'Legal intake',
        },
        visual: 'phone',
        phoneMessages: [
          { side: 'out', text: 'Necesito ayuda por incumplimiento de contrato.' },
          { side: 'in', text: 'Perfecto. Te hago 3 preguntas para clasificar tu caso.' },
          { side: 'in', text: 'Caso clasificado: mercantil. Te contacta un abogado hoy.' },
        ],
      },
      {
        id: 'law-portal',
        icon: 'PT',
        label: 'Login portales',
        agent: {
          number: 'OPERADOR 02',
          title: 'Operador de Portales Legales',
          description: 'Accede a portales de juzgado y extrae estatus para enviar update al cliente.',
          steps: ['Ingreso seguro al portal', 'Consulta estatus del expediente', 'Resumen automático por WhatsApp'],
          industryTag: 'Portales judiciales',
        },
        visual: 'terminal',
        terminalLines: [
          'Iniciando sesión en portal judicial...',
          'Expediente 2026-LX-219 encontrado',
          'Estatus actualizado: en revisión',
          'Resumen enviado a cliente y abogado',
        ],
      },
      {
        id: 'law-agenda',
        icon: 'AG',
        label: 'Agenda consultas',
        agent: {
          number: 'OPERADOR 03',
          title: 'Agendador de Consultas',
          description: 'Coordina agenda del despacho y confirma citas automáticamente.',
          steps: ['Recibe solicitud de consulta', 'Propone horarios reales', 'Confirma cita y bloquea calendario'],
          industryTag: 'Agenda legal',
        },
        visual: 'phone',
        phoneMessages: [
          { side: 'out', text: '¿Puedo agendar para esta semana?' },
          { side: 'in', text: 'Sí. Tengo martes 10:00 o jueves 16:00.' },
          { side: 'out', text: 'Jueves 16:00, por favor.' },
          { side: 'in', text: 'Cita confirmada. Envío recordatorio 24h antes.' },
        ],
      },
    ],
  },
  {
    id: 'real-estate',
    eyebrowLabel: 'Operadores Prisma Real Estate',
    title: 'Demos de operadores para real estate',
    subtitle: 'Calificación de leads, visitas y reactivación de pipeline.',
    tabs: [
      {
        id: 're-lead',
        icon: 'RE',
        label: 'Calificar leads',
        agent: {
          number: 'OPERADOR 01',
          title: 'Calificador Inmobiliario',
          description: 'Filtra por zona y presupuesto para mostrar propiedades realmente compatibles.',
          steps: ['Lead comparte zona y presupuesto', 'Operador filtra inventario', 'Envía opciones listas para visita'],
          industryTag: 'Lead qualification',
        },
        visual: 'phone',
        phoneMessages: [
          { side: 'out', text: 'Busco casa en San Pedro, presupuesto 4-5M.' },
          { side: 'in', text: 'Te comparto 3 opciones activas en esa zona.' },
          { side: 'in', text: 'Del Valle 4.2M\nChipinque 4.8M' },
        ],
      },
      {
        id: 're-visits',
        icon: 'VS',
        label: 'Coordinar visitas',
        agent: {
          number: 'OPERADOR 02',
          title: 'Coordinador de Visitas',
          description: 'Agenda visitas con asesor y confirma asistencia sin tareas manuales.',
          steps: ['Lead confirma interés', 'Propone horarios disponibles', 'Confirma visita y manda ubicación'],
          industryTag: 'Visitas confirmadas',
        },
        visual: 'phone',
        phoneMessages: [
          { side: 'out', text: 'Quiero visitar la opción de Del Valle.' },
          { side: 'in', text: 'Disponible hoy 6pm o mañana 11am.' },
          { side: 'out', text: 'Mañana 11am.' },
          { side: 'in', text: 'Visita confirmada con asesor.' },
        ],
      },
      {
        id: 're-pipeline',
        icon: 'PL',
        label: 'Reactivar pipeline',
        agent: {
          number: 'OPERADOR 03',
          title: 'Reactivador de Pipeline',
          description: 'Detecta leads fríos y reactiva conversaciones con nuevas opciones.',
          steps: ['Detecta inactividad', 'Envía opciones renovadas', 'Escala lead caliente al asesor'],
          industryTag: 'Pipeline activo',
        },
        visual: 'terminal',
        terminalLines: [
          'Escaneando leads sin respuesta > 7 días...',
          '23 candidatos detectados',
          'Enviando mensajes personalizados',
          '8 respuestas positivas en 2 horas',
        ],
      },
    ],
  },
  {
    id: 'general',
    eyebrowLabel: 'Operadores Prisma General',
    title: 'Otros demos de operadores que podemos construir',
    subtitle: 'Una tercera fila para mostrar capacidades fuera de legal y real estate.',
    tabs: [
      {
        id: 'gen-fact',
        icon: 'FC',
        label: 'Facturación automática',
        agent: {
          number: 'OPERADOR 01',
          title: 'Facturador Automático',
          description: 'Emite CFDI y envía comprobante sin intervención manual.',
          steps: ['Cliente manda RFC', 'Operador genera CFDI', 'PDF entregado en segundos'],
          industryTag: 'Facturación',
        },
        visual: 'phone',
        phoneMessages: [
          { side: 'out', text: 'Necesito factura del pago de ayer.' },
          { side: 'in', text: 'Claro. Procesando CFDI ahora.' },
          { side: 'in', text: 'Factura enviada con PDF adjunto.' },
        ],
      },
      {
        id: 'gen-portal',
        icon: 'PT',
        label: 'Login a portales',
        agent: {
          number: 'OPERADOR 02',
          title: 'Operador de Portales',
          description: 'Hace login, extrae datos y entrega resumen de alto valor al equipo.',
          steps: ['Login seguro', 'Extracción automática', 'Resumen enviado por WhatsApp'],
          industryTag: 'Integración portales',
        },
        visual: 'terminal',
        terminalLines: [
          'Autenticando credenciales...',
          'Sesión validada',
          'Extracción de reporte completada',
          'Resumen distribuido al equipo',
        ],
      },
      {
        id: 'gen-agenda',
        icon: 'AG',
        label: 'Agenda por WhatsApp',
        agent: {
          number: 'OPERADOR 03',
          title: 'Agendador Universal',
          description: 'Agenda y confirma citas en cualquier negocio con atención 24/7.',
          steps: ['Recibe solicitud', 'Propone horarios reales', 'Confirma y recuerda automáticamente'],
          industryTag: 'Agenda universal',
        },
        visual: 'phone',
        phoneMessages: [
          { side: 'out', text: 'Necesito cita para esta semana.' },
          { side: 'in', text: 'Claro. Tengo martes 10:00 o miércoles 16:00.' },
          { side: 'out', text: 'Martes 10:00.' },
          { side: 'in', text: 'Confirmado. Te envío recordatorio.' },
        ],
      },
    ],
  },
]

const accentsByRowId: Record<string, AccentStyle> = {
  lawyer: {
    text: 'var(--giga-law)',
    pillBg: 'rgba(56,189,248,0.1)',
    pillBorder: 'rgba(56,189,248,0.3)',
  },
  'real-estate': {
    text: 'var(--giga-re)',
    pillBg: 'rgba(245,158,11,0.1)',
    pillBorder: 'rgba(245,158,11,0.3)',
  },
  general: {
    text: 'var(--giga-gen)',
    pillBg: 'rgba(167,139,250,0.1)',
    pillBorder: 'rgba(167,139,250,0.3)',
  },
}

function PhoneMockup({ messages }: { messages: { side: 'in' | 'out'; text: string }[] }) {
  return (
    <div
      style={{
        width: '230px',
        borderRadius: '22px',
        border: '1px solid rgba(255,255,255,0.12)',
        overflow: 'hidden',
        background: '#0d131a',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          background: '#1e293b',
          padding: '0.58rem 0.78rem',
          color: '#e2e8f0',
          fontSize: '0.74rem',
          fontWeight: 700,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        Agente Prisma
      </div>
      <div style={{ padding: '0.72rem', display: 'grid', gap: '0.45rem', minHeight: '280px' }}>
        {messages.map((msg, idx) => (
          <div key={`${msg.text}-${idx}`} style={{ display: 'flex', justifyContent: msg.side === 'out' ? 'flex-end' : 'flex-start' }}>
            <div
              style={{
                maxWidth: '90%',
                whiteSpace: 'pre-line',
                padding: '0.44rem 0.6rem',
                fontSize: '0.73rem',
                lineHeight: 1.45,
                borderRadius: msg.side === 'out' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: msg.side === 'out' ? '#0f766e' : '#1f2937',
                color: '#e2e8f0',
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TerminalMockup({ lines }: { lines: string[] }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '360px',
        borderRadius: '14px',
        background: '#0b1218',
        border: '1px solid rgba(255,255,255,0.1)',
        overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          padding: '0.55rem 0.8rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          gap: '0.36rem',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
          <span key={dot} style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot }} />
        ))}
      </div>
      <div style={{ padding: '0.9rem', fontFamily: 'Consolas, monospace', fontSize: '0.74rem', color: '#b7c0ce', display: 'grid', gap: '0.46rem' }}>
        {lines.map((line, idx) => (
          <div key={`${line}-${idx}`} style={{ display: 'flex', gap: '0.5rem' }}>
            <span style={{ color: idx % 2 === 0 ? '#fbbf24' : '#4ade80' }}>{idx % 2 === 0 ? '◌' : '✓'}</span>
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoRow({
  row,
  activeTabId,
  onTabChange,
}: {
  row: IndustryRow
  activeTabId: string
  onTabChange: (tabId: string) => void
}) {
  const activeTab = row.tabs.find((tab) => tab.id === activeTabId) ?? row.tabs[0]
  const accent = accentsByRowId[row.id] ?? accentsByRowId.general

  return (
    <div className="animate-on-scroll" style={{ marginBottom: '2.5rem' }}>
      <div style={{ marginBottom: '1.15rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            color: 'var(--giga-faint)',
            border: '1px solid var(--giga-border)',
            background: 'var(--giga-surface-soft)',
            borderRadius: 'var(--radius-pill)',
            padding: '0.3rem 0.75rem',
            fontSize: '0.7rem',
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: '0.8rem',
          }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: accent.text }} />
          {row.eyebrowLabel}
        </div>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.65rem, 3.3vw, 2.4rem)',
            lineHeight: 1.08,
            color: 'var(--giga-text)',
            marginBottom: '0.45rem',
          }}
        >
          {row.title}
        </h3>
        <p style={{ color: 'var(--giga-muted)', maxWidth: '62ch', fontSize: '0.92rem' }}>{row.subtitle}</p>
      </div>

      <div role="tablist" aria-label={row.eyebrowLabel} style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.2rem', marginBottom: '1rem' }}>
        {row.tabs.map((tab) => {
          const isActive = tab.id === activeTab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              style={{
                border: `1px solid ${isActive ? accent.pillBorder : 'var(--giga-border)'}`,
                background: isActive ? accent.pillBg : 'var(--giga-surface)',
                color: isActive ? 'var(--giga-text)' : 'var(--giga-faint)',
                borderRadius: 'var(--radius-pill)',
                padding: '0.5rem 0.86rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span aria-hidden>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1px',
          border: '1px solid var(--giga-border)',
          borderRadius: '14px',
          background: 'var(--giga-border)',
          overflow: 'hidden',
        }}
      >
        <article style={{ background: 'linear-gradient(180deg, rgba(24,29,37,0.9) 0%, rgba(16,20,28,0.92) 100%)', padding: '1.3rem 1.1rem' }}>
          <div style={{ color: accent.text, fontSize: '0.68rem', letterSpacing: '0.11em', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.45rem' }}>
            {activeTab.agent.number}
          </div>
          <h4 style={{ color: 'var(--giga-text)', fontFamily: 'var(--font-display)', fontSize: '1.36rem', lineHeight: 1.12, marginBottom: '0.6rem' }}>
            {activeTab.agent.title}
          </h4>
          <p style={{ color: 'var(--giga-muted)', fontSize: '0.9rem', lineHeight: 1.58, marginBottom: '1rem' }}>{activeTab.agent.description}</p>
          <div style={{ display: 'grid', gap: '0.48rem', marginBottom: '1.05rem' }}>
            {activeTab.agent.steps.map((step, index) => (
              <div key={step} style={{ display: 'flex', gap: '0.52rem' }}>
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '999px',
                    border: '1px solid var(--giga-border)',
                    background: 'var(--giga-surface-soft)',
                    color: 'var(--giga-faint)',
                    fontSize: '0.64rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '0.1rem',
                  }}
                >
                  {index + 1}
                </span>
                <span style={{ color: 'var(--giga-muted)', fontSize: '0.83rem' }}>{step}</span>
              </div>
            ))}
          </div>
          <span
            style={{
              display: 'inline-flex',
              padding: '0.26rem 0.68rem',
              borderRadius: 'var(--radius-pill)',
              border: `1px solid ${accent.pillBorder}`,
              background: accent.pillBg,
              color: 'var(--giga-text)',
              fontSize: '0.72rem',
              fontWeight: 600,
            }}
          >
            {activeTab.agent.industryTag}
          </span>
        </article>

        <article
          style={{
            background: 'linear-gradient(180deg, rgba(22,26,34,0.9) 0%, rgba(14,18,24,0.9) 100%)',
            padding: '1.05rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '410px',
          }}
        >
          {activeTab.visual === 'terminal' ? <TerminalMockup lines={activeTab.terminalLines ?? []} /> : <PhoneMockup messages={activeTab.phoneMessages ?? []} />}
        </article>
      </div>
    </div>
  )
}

export default function FeatureGrid() {
  const [activeTabsByRow, setActiveTabsByRow] = useState<Record<string, string>>(
    industryRows.reduce<Record<string, string>>((acc, row) => {
      acc[row.id] = row.tabs[0].id
      return acc
    }, {})
  )

  return (
    <section
      id="features"
      style={{
        padding: '4.2rem 1.25rem 3.4rem',
        background: 'var(--giga-bg)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="landing-container landing-container--compact">
        <div className="animate-on-scroll" style={{ marginBottom: '1.8rem', maxWidth: '860px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--giga-border)',
              background: 'var(--giga-surface-soft)',
              color: 'var(--giga-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.3rem 0.72rem',
              marginBottom: '0.85rem',
            }}
          >
            TU EQUIPO
          </div>
          <h2
            style={{
              color: 'var(--giga-text)',
              fontSize: 'clamp(1.95rem, 4.2vw, 3rem)',
              lineHeight: 1.08,
              marginBottom: '0.6rem',
              fontFamily: 'var(--font-display)',
            }}
          >
            No te mandamos un agente.
            <br />
            Te mandamos un equipo.
          </h2>
          <p style={{ color: 'var(--giga-muted)', fontSize: '0.95rem' }}>
            Tres especialistas trabajando juntos en tu WhatsApp. Cada uno con su trabajo. Los tres sin descanso.
          </p>
        </div>

        <div
          className="animate-on-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '1px',
            background: 'var(--giga-border)',
            border: '1px solid var(--giga-border)',
            borderRadius: '14px',
            overflow: 'hidden',
            marginBottom: '2.1rem',
          }}
        >
          {stats.map((stat) => (
            <article key={stat.label} style={{ background: 'linear-gradient(180deg, rgba(24,29,36,0.9) 0%, rgba(14,18,24,0.92) 100%)', padding: '1.05rem 1.08rem' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.45rem, 3vw, 2rem)',
                  lineHeight: 1.05,
                  color: stat.valueAccent ? '#e2e8f0' : 'var(--giga-text)',
                  fontWeight: 700,
                }}
              >
                {stat.value}
              </div>
              <p style={{ color: 'var(--giga-faint)', fontSize: '0.78rem', marginTop: '0.3rem' }}>{stat.label}</p>
            </article>
          ))}
        </div>

        <p className="animate-on-scroll" style={{ color: 'var(--giga-faint)', fontSize: '0.95rem', marginBottom: '1.3rem' }}>
          Así como contratas a un equipo de personas, Prisma te arma el tuyo. Sin entrevistas. Sin nómina.
        </p>

        <div
          className="animate-on-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1px',
            border: '1px solid var(--giga-border)',
            borderRadius: '14px',
            overflow: 'hidden',
            background: 'var(--giga-border)',
            marginBottom: '2rem',
          }}
        >
          <article
            style={{
              background: 'linear-gradient(180deg, rgba(24,29,37,0.9) 0%, rgba(16,20,28,0.92) 100%)',
              padding: '1rem 1.05rem',
            }}
          >
            <div
              style={{
                color: '#fca5a5',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.69rem',
                fontWeight: 700,
                marginBottom: '0.45rem',
              }}
            >
              Chatbot
            </div>
            <p style={{ color: '#f8fafc', fontSize: '0.95rem', lineHeight: 1.55, margin: 0 }}>
              Responde preguntas frecuentes, pero no entiende el contexto completo del cliente ni da seguimiento real.
            </p>
          </article>

          <article
            style={{
              background: 'linear-gradient(180deg, rgba(24,29,37,0.9) 0%, rgba(16,20,28,0.92) 100%)',
              padding: '1rem 1.05rem',
            }}
          >
            <div
              style={{
                color: '#86efac',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.69rem',
                fontWeight: 700,
                marginBottom: '0.45rem',
              }}
            >
              Agente Prisma
            </div>
            <p style={{ color: '#f8fafc', fontSize: '0.95rem', lineHeight: 1.55, margin: 0 }}>
              Recuerda a cada cliente, entiende su etapa, y escribe hoy con el siguiente paso para cerrar la oportunidad.
            </p>
          </article>
        </div>

        {industryRows.map((row) => (
          <DemoRow
            key={row.id}
            row={row}
            activeTabId={activeTabsByRow[row.id]}
            onTabChange={(tabId) =>
              setActiveTabsByRow((prev) => ({
                ...prev,
                [row.id]: tabId,
              }))
            }
          />
        ))}
      </div>
    </section>
  )
}
