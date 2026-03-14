'use client'

import React, { useState } from 'react'

type IndustryDemoTab = {
  id: string
  label: string
  icon: string
  operator: string
  title: string
  description: string
  steps: string[]
  badge: string
  visual: 'phone' | 'terminal'
  messages?: { side: 'in' | 'out'; text: string }[]
  logs?: string[]
}

type IndustryBlock = {
  id: string
  icon: string
  title: string
  tagline: string
  accent: 're' | 'law' | 'gen'
  tabs: IndustryDemoTab[]
  cta?: {
    title: string
    description: string
    primary: string
    secondary: string
  }
}

const industryBlocks: IndustryBlock[] = [
  {
    id: 'lawyers',
    icon: '\u2696\uFE0F',
    title: 'Operadores Prisma para Despachos Legales',
    tagline: 'El mismo componente de demo, aplicado a flujos legales reales.',
    accent: 'law',
    tabs: [
      {
        id: 'calificador',
        label: 'Calificador de casos',
        icon: '\u2696\uFE0F',
        operator: 'OPERADOR 01',
        title: 'Calificador de Casos',
        description:
          'Recibe consultas, clasifica el tipo de caso y genera una ficha lista para revision del abogado.',
        steps: [
          'Cliente explica su caso por WhatsApp',
          'Operador clasifica tipo, urgencia y monto',
          'Entrega resumen con prioridad legal',
        ],
        badge: 'Legal intake',
        visual: 'phone',
        messages: [
          { side: 'out', text: 'Necesito ayuda con un contrato incumplido.' },
          { side: 'in', text: 'Perfecto. Te hago 3 preguntas para clasificar tu caso.' },
          { side: 'in', text: '\u2705 Caso clasificado: mercantil. Te contacta un abogado hoy.' },
        ],
      },
      {
        id: 'expedientes',
        label: 'Seguimiento expediente',
        icon: '\u{1F4C1}',
        operator: 'OPERADOR 02',
        title: 'Seguimiento de Expedientes',
        description:
          'Consulta estatus en sistemas internos y responde al cliente en segundos con el siguiente paso.',
        steps: [
          'Cliente solicita avance',
          'Operador consulta estado del expediente',
          'Responde y solicita documentos faltantes',
        ],
        badge: 'Expedientes 24/7',
        visual: 'terminal',
        logs: [
          'Conectando con sistema legal...',
          'Expediente #LX-219 encontrado',
          'Estatus: en revision de juzgado',
          'Generando respuesta para cliente...',
        ],
      },
      {
        id: 'agenda',
        label: 'Agenda consultas',
        icon: '\u{1F4C5}',
        operator: 'OPERADOR 03',
        title: 'Agendador de Consultas',
        description: 'Coordina citas legales automaticamente con horarios reales y recordatorios.',
        steps: [
          'Cliente pide fecha para consulta',
          'Operador propone horarios disponibles',
          'Confirma cita y bloquea calendario',
        ],
        badge: 'Agenda legal',
        visual: 'phone',
        messages: [
          { side: 'out', text: 'Puedo agendar consulta para esta semana?' },
          { side: 'in', text: 'Si. Tengo martes 10:00 o jueves 16:00.' },
          { side: 'out', text: 'Jueves 16:00 perfecto.' },
          { side: 'in', text: '\u2705 Confirmado. Te envio recordatorio 24h antes.' },
        ],
      },
    ],
  },
  {
    id: 'real-estate',
    icon: '\u{1F3E0}',
    title: 'Operadores Prisma para Bienes Raices',
    tagline: 'Mismo bloque interactivo, adaptado al flujo inmobiliario.',
    accent: 're',
    tabs: [
      {
        id: 'lead',
        label: 'Calificar lead',
        icon: '\u{1F3E0}',
        operator: 'OPERADOR 01',
        title: 'Calificador de Leads',
        description:
          'Filtra por zona y presupuesto para enviar propiedades relevantes en minutos.',
        steps: [
          'Lead indica zona y presupuesto',
          'Operador filtra inventario',
          'Comparte opciones y detecta intencion',
        ],
        badge: 'Lead qualification',
        visual: 'phone',
        messages: [
          { side: 'out', text: 'Busco casa en San Pedro, presupuesto 4-5M.' },
          { side: 'in', text: 'Te comparto 3 opciones activas en esa zona.' },
          { side: 'in', text: '\u{1F3E1} Del Valle 4.2M\n\u{1F3E0} Chipinque 4.8M' },
        ],
      },
      {
        id: 'visitas',
        label: 'Coordinar visitas',
        icon: '\u{1F4CD}',
        operator: 'OPERADOR 02',
        title: 'Coordinador de Visitas',
        description: 'Agenda visitas con asesor y confirma asistencia sin que el agente comercial lo haga manualmente.',
        steps: [
          'Lead confirma interes',
          'Operador sugiere horarios reales',
          'Confirma visita y envia ubicacion',
        ],
        badge: 'Visitas confirmadas',
        visual: 'phone',
        messages: [
          { side: 'out', text: 'Me interesa visitar la opcion de Del Valle.' },
          { side: 'in', text: 'Tenemos hoy 6:00pm o manana 11:00am.' },
          { side: 'out', text: 'Manana 11:00am.' },
          { side: 'in', text: '\u2705 Listo, visita confirmada con asesor.' },
        ],
      },
      {
        id: 'pipeline',
        label: 'Reactivar pipeline',
        icon: '\u{1F4CA}',
        operator: 'OPERADOR 03',
        title: 'Reactivador de Pipeline',
        description: 'Detecta leads frios y los reactiva automaticamente con nuevas opciones compatibles.',
        steps: [
          'Detecta leads sin actividad',
          'Envia nuevas opciones ajustadas',
          'Escala al asesor cuando responden',
        ],
        badge: 'Pipeline activo',
        visual: 'terminal',
        logs: [
          'Analizando leads sin respuesta > 7 dias',
          '23 leads candidatos para reactivacion',
          'Generando mensajes personalizados...',
          '8 respuestas positivas en 2 horas',
        ],
      },
    ],
  },
  {
    id: 'general',
    icon: '\u26A1',
    title: 'Otros Operadores que Podemos Construir',
    tagline: 'Una tercera fila para demostrar cualquier otro flujo de negocio.',
    accent: 'gen',
    tabs: [
      {
        id: 'facturacion',
        label: 'Facturacion',
        icon: '\u{1F9FE}',
        operator: 'OPERADOR 01',
        title: 'Facturador Automatico',
        description: 'Genera CFDI desde WhatsApp y envia comprobante en segundos.',
        steps: [
          'Cliente manda RFC',
          'Operador emite CFDI',
          'Entrega PDF inmediato',
        ],
        badge: 'CFDI listo',
        visual: 'phone',
        messages: [
          { side: 'out', text: 'Necesito factura del pago de ayer.' },
          { side: 'in', text: 'Claro, procesando CFDI ahora.' },
          { side: 'in', text: '\u2705 Factura enviada. PDF adjunto.' },
        ],
      },
      {
        id: 'portales',
        label: 'Portales',
        icon: '\u{1F510}',
        operator: 'OPERADOR 02',
        title: 'Login a Portales',
        description: 'Ingresa a portales, extrae informacion y manda resumen accionable.',
        steps: [
          'Autenticacion segura',
          'Extraccion automatica de datos',
          'Resumen para tu equipo',
        ],
        badge: 'Integracion portal',
        visual: 'terminal',
        logs: [
          'Iniciando autenticacion MFA...',
          'Sesion verificada',
          'Extraccion de reportes completada',
          'Resumen enviado por WhatsApp',
        ],
      },
    ],
    cta: {
      title: 'No ves tu industria? Podemos construirla.',
      description: 'En 30 minutos definimos operadores para tu negocio y te mostramos una demo personalizada.',
      primary: 'Habla con nosotros',
      secondary: 'Ver demo en vivo',
    },
  },
]

const accentStyles = {
  re: {
    line: 'linear-gradient(90deg, var(--giga-re), transparent 70%)',
    pillBg: 'rgba(245,158,11,0.08)',
    pillBorder: 'rgba(245,158,11,0.25)',
    pillColor: 'var(--giga-re)',
  },
  law: {
    line: 'linear-gradient(90deg, var(--giga-law), transparent 70%)',
    pillBg: 'rgba(56,189,248,0.08)',
    pillBorder: 'rgba(56,189,248,0.25)',
    pillColor: 'var(--giga-law)',
  },
  gen: {
    line: 'linear-gradient(90deg, var(--giga-gen), transparent 70%)',
    pillBg: 'rgba(167,139,250,0.08)',
    pillBorder: 'rgba(167,139,250,0.25)',
    pillColor: 'var(--giga-gen)',
  },
} as const

export default function IndustrySection() {
  const [activeByIndustry, setActiveByIndustry] = useState<Record<string, string>>({
    lawyers: 'calificador',
    'real-estate': 'lead',
    general: 'facturacion',
  })

  return (
    <section
      style={{
        padding: '1rem 1.25rem 5.4rem',
        background: 'var(--giga-bg)',
      }}
    >
      <div className="landing-container landing-container--compact">
        <div style={{ marginBottom: '2.3rem' }}>
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
              marginBottom: '0.9rem',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--giga-gen)' }} />
            Operadores por Industria
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.8rem, 3.8vw, 2.7rem)',
              lineHeight: 1.1,
              color: 'var(--giga-text)',
              marginBottom: '0.45rem',
            }}
          >
            Mismo bloque interactivo,
            <br />
            repetido por industria
          </h2>
          <p style={{ color: 'var(--giga-muted)', maxWidth: '65ch', fontSize: '0.95rem' }}>
            Como pediste: 1 fila para abogados, 1 fila para real estate y una fila final para otros demos que podemos
            construir.
          </p>
        </div>

        {industryBlocks.map((industry) => {
          const activeId = activeByIndustry[industry.id] ?? industry.tabs[0]?.id
          const activeTab = industry.tabs.find((tab) => tab.id === activeId) ?? industry.tabs[0]
          const accent = accentStyles[industry.accent]

          return (
            <div key={industry.id} style={{ marginBottom: '2.2rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  borderBottom: '1px solid var(--giga-border)',
                  paddingBottom: '1rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '1.3rem' }}>{industry.icon}</span>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ color: 'var(--giga-text)', fontWeight: 700, fontSize: '1rem' }}>{industry.title}</div>
                  <div style={{ color: 'var(--giga-muted)', fontSize: '0.84rem' }}>{industry.tagline}</div>
                </div>
                <span
                  style={{
                    padding: '0.25rem 0.7rem',
                    borderRadius: 'var(--radius-pill)',
                    background: accent.pillBg,
                    border: `1px solid ${accent.pillBorder}`,
                    color: accent.pillColor,
                    fontSize: '0.7rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {industry.id === 'lawyers' ? 'Legal' : industry.id === 'real-estate' ? 'Bienes Raices' : 'General'}
                </span>
              </div>

              <div
                role="tablist"
                aria-label={`Tarjetas ${industry.title}`}
                style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', marginBottom: '0.95rem', paddingBottom: '0.2rem' }}
              >
                {industry.tabs.map((tab) => {
                  const isActive = tab.id === activeTab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() =>
                        setActiveByIndustry((prev) => ({
                          ...prev,
                          [industry.id]: tab.id,
                        }))
                      }
                      style={{
                        borderRadius: 'var(--radius-pill)',
                        border: `1px solid ${isActive ? accent.pillBorder : 'var(--giga-border)'}`,
                        background: isActive ? accent.pillBg : 'var(--giga-surface)',
                        color: isActive ? 'var(--giga-text)' : 'var(--giga-faint)',
                        padding: '0.45rem 0.78rem',
                        fontSize: '0.79rem',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        display: 'inline-flex',
                        gap: '0.35rem',
                        alignItems: 'center',
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
                  border: '1px solid var(--giga-border)',
                  borderRadius: '14px',
                  background: 'var(--giga-surface)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: '2px', background: accent.line }} />
                <div style={{ padding: '1.1rem' }}>
                  <div
                    style={{
                      color: accent.pillColor,
                      fontSize: '0.68rem',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      marginBottom: '0.35rem',
                    }}
                  >
                    {activeTab.operator}
                  </div>
                  <h3
                    style={{
                      color: 'var(--giga-text)',
                      fontSize: '1.15rem',
                      fontFamily: 'var(--font-display)',
                      marginBottom: '0.45rem',
                    }}
                  >
                    {activeTab.title}
                  </h3>
                  <p style={{ color: 'var(--giga-muted)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.8rem' }}>
                    {activeTab.description}
                  </p>
                  <div style={{ display: 'grid', gap: '0.42rem', marginBottom: '0.8rem' }}>
                    {activeTab.steps.map((step, idx) => (
                      <div key={step} style={{ display: 'flex', gap: '0.5rem' }}>
                        <span
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '999px',
                            background: 'var(--giga-surface-soft)',
                            border: '1px solid var(--giga-border)',
                            color: 'var(--giga-faint)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.64rem',
                            fontWeight: 700,
                            marginTop: '0.08rem',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <span style={{ color: 'var(--giga-muted)', fontSize: '0.82rem' }}>{step}</span>
                      </div>
                    ))}
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      padding: '0.25rem 0.7rem',
                      borderRadius: 'var(--radius-pill)',
                      border: '1px solid var(--giga-border)',
                      background: 'var(--giga-surface-soft)',
                      color: 'var(--giga-faint)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                    }}
                  >
                    {activeTab.badge}
                  </span>
                </div>
              </div>

              <div
                style={{
                  marginTop: '0.9rem',
                  border: '1px solid var(--giga-border)',
                  borderRadius: '14px',
                  background: 'var(--giga-surface)',
                  padding: '0.8rem',
                  minHeight: '110px',
                }}
              >
                {activeTab.visual === 'terminal' ? (
                  <div style={{ fontFamily: 'Consolas, monospace', display: 'grid', gap: '0.35rem', fontSize: '0.75rem' }}>
                    {(activeTab.logs ?? []).map((log) => (
                      <div key={log} style={{ color: 'var(--giga-muted)' }}>
                        {'>'} {log}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '0.4rem' }}>
                    {(activeTab.messages ?? []).map((msg, idx) => (
                      <div
                        key={`${msg.text}-${idx}`}
                        style={{
                          display: 'flex',
                          justifyContent: msg.side === 'out' ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.78rem',
                            padding: '0.34rem 0.5rem',
                            borderRadius: msg.side === 'out' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                            background: msg.side === 'out' ? '#005C4B' : '#1f2c34',
                            color: '#e2e8f0',
                            maxWidth: '90%',
                            whiteSpace: 'pre-line',
                          }}
                        >
                          {msg.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {industry.cta ? (
                <div
                  style={{
                    marginTop: '0.9rem',
                    border: '1px solid var(--giga-border)',
                    borderRadius: '14px',
                    background: 'var(--giga-surface-soft)',
                    padding: '1.1rem',
                    display: 'grid',
                    gap: '0.75rem',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        color: 'var(--giga-text)',
                        fontSize: '1.2rem',
                        marginBottom: '0.35rem',
                      }}
                    >
                      {industry.cta.title}
                    </h3>
                    <p style={{ color: 'var(--giga-muted)', fontSize: '0.88rem' }}>
                      {industry.cta.description}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <a
                      href="#cta"
                      style={{
                        display: 'inline-flex',
                        textDecoration: 'none',
                        color: '#111827',
                        background: '#ffffff',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.58rem 1.05rem',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                      }}
                    >
                      {industry.cta.primary}
                    </a>
                    <a
                      href="#cta"
                      style={{
                        display: 'inline-flex',
                        textDecoration: 'none',
                        color: 'var(--giga-text)',
                        border: '1px solid var(--giga-border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.58rem 1.05rem',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                      }}
                    >
                      {industry.cta.secondary}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
