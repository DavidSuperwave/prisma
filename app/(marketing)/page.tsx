import { ArrowRight, ShieldCheck } from "lucide-react";
import { PhoneFrame } from "@/components/WhatsAppPhone/PhoneFrame";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";

const productCards = [
  {
    title: "Agente de Captación",
    description:
      "Recibe cada lead entrante, hace las preguntas clave de tu industria y entrega un prospecto calificado — no un mensaje sin contexto.",
  },
  {
    title: "Agente de Agenda",
    description:
      "Confirma, reagenda y recuerda citas automáticamente. Recupera ausencias antes de que pase una hora, sin que nadie lo persiga.",
  },
  {
    title: "Agente de Seguimiento",
    description:
      "Reengacha clientes con contexto real: sabe en qué etapa están, qué falta por resolver y cuándo es el momento correcto para escribir.",
  },
];

const stats = [
  {
    value: "75%",
    label: "de las PyMEs ya usan WhatsApp Business",
    description: "El canal está. El agente que lo opera, todavía no.",
  },
  {
    value: "20+",
    label: "industrias con plantillas listas",
    description: "Legal, salud, inmobiliaria, belleza, flotillas y más — cada una configurada desde el primer día.",
  },
  {
    value: "80%",
    label: "menos tokens con memoria persistente",
    description: "Más contexto por cliente, menos costo por conversación.",
  },
];

const audiences = [
  {
    title: "Despachos y profesionistas",
    description:
      "Abogados, contadores, notarios y asesores. Filtra leads, recibe documentos y da seguimiento a cada caso sin perseguir a nadie a mano.",
  },
  {
    title: "Clínicas y servicios de salud",
    description:
      "Dentistas, médicos, psicólogos y nutriólogos. Llena tu agenda, reduce no-shows y envía recordatorios de seguimiento sin mover un dedo.",
  },
  {
    title: "Operaciones con volumen",
    description:
      "Flotillas, distribuidoras, restaurantes y escuelas. Estandariza WhatsApp a escala: un agente por área, por marca o por canal.",
  },
];

const securityItems = [
  "Cada instancia de agente es privada — tus datos nunca se mezclan con los de otro cliente.",
  "Memoria encriptada por cliente, con trazabilidad de conversaciones.",
  "Desplegable en tu infraestructura o en la nuestra, llaves siempre del lado del servidor.",
];

export default function HomePage() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container hero-grid fade-in">
          <div className="hero-copy">
            <div className="eyebrow-pill">Agentes IA · WhatsApp · Hecho para México</div>
            <h1>
              Tu operación ya vive en{" "}
              <span className="gradient-text">WhatsApp.</span>
              <br />
              Ahora puede correr sola.
            </h1>
            <p>
              Prisma construye agentes de IA a medida para tu industria. Responden, califican, agendan
              y dan seguimiento — con memoria de cada cliente, sin que tú tengas que estar.
            </p>
            <div className="button-row">
              <Button href="#demo">Hablar con un agente</Button>
              <Button href="#soluciones" variant="secondary">
                Ver cómo funciona
              </Button>
            </div>
          </div>

          {/* Phone only — no wrappers, no captions */}
          <PhoneFrame />
        </div>
      </section>

      {/* SOLUCIONES */}
      <Section
        id="soluciones"
        label="Soluciones"
        title="Un agente para cada parte de tu operación."
        description="No reemplazamos las herramientas que ya usas. Automatizamos el caos que aún vive en mensajes manuales, audios y grupos de WhatsApp."
      >
        <div className="products-grid fade-in">
          {productCards.map((card) => (
            <article key={card.title} className="placeholder-card">
              <div className="placeholder-media">demo próximamente</div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* POR QUÉ IMPORTA */}
      <Section
        label="Por qué importa"
        title="México tiene 95 millones de usuarios de WhatsApp. La mayoría de esas conversaciones aún se manejan a mano."
        description="Eso es exactamente el problema que Prisma resuelve."
      >
        <div className="stats-grid fade-in">
          {stats.map((stat) => (
            <article key={stat.label} className="stat-card">
              <div className="stat-value gradient-text">{stat.value}</div>
              <h3>{stat.label}</h3>
              <p>{stat.description}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* PARA QUIÉN */}
      <Section
        id="sectores"
        label="Para quién es"
        title="Si tu equipo aún responde WhatsApp a mano, Prisma es para ti."
        description="Construimos agentes para negocios donde cada mensaje importa y cada minuto de respuesta cuenta."
      >
        <div className="audience-grid fade-in">
          {audiences.map((audience) => (
            <article key={audience.title} className="target-card">
              <h3>{audience.title}</h3>
              <p>{audience.description}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* CONFIANZA */}
      <Section
        id="seguridad"
        label="Privacidad y confianza"
        title="Tu operación, tus datos. Siempre bajo tu control."
        description="Construimos Prisma con los estándares de privacidad que las industrias reguladas exigen desde el primer día."
      >
        <div className="security-grid fade-in">
          <article className="security-card">
            <ShieldCheck size={20} strokeWidth={2} color="#818CF8" />
            <h3>Datos aislados por cliente</h3>
            <p>
              Tu agente vive en su propia instancia. No hay memoria compartida,
              no hay filtraciones cruzadas entre clientes.
            </p>
          </article>
          <article className="security-card">
            <ShieldCheck size={20} strokeWidth={2} color="#818CF8" />
            <h3>Llaves fuera del cliente</h3>
            <p>
              Las APIs de terceros se invocan desde el servidor. El navegador
              nunca ve credenciales ni contexto sensible.
            </p>
          </article>
          <article className="security-card">
            <ShieldCheck size={20} strokeWidth={2} color="#818CF8" />
            <h3>Preparado para industrias reguladas</h3>
            <ul className="security-list">
              {securityItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </Section>

      {/* CTA CIERRE */}
      <Section
        label="Empieza hoy"
        title="Tu primer agente puede estar activo esta semana."
        description="Tomamos la plantilla más cercana a tu industria, la configuramos con tus flujos y la conectamos a tu WhatsApp. Sin meses de desarrollo."
      >
        <div className="cta-panel fade-in">
          <div>
            <h3>Habla con nosotros antes de hablar con cualquier otro proveedor.</h3>
            <p>
              No vendemos licencias de software. Construimos el agente que tu operación
              necesita — y lo desplegamos rápido.
            </p>
          </div>
          <div className="button-row">
            <Button href="#demo">Agendar una llamada</Button>
            <Button href="#soluciones" variant="ghost">
              Ver industrias <ArrowRight size={16} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
