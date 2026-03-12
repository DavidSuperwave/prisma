import { ArrowRight, ShieldCheck } from "lucide-react";
import { WhatsAppPhone } from "@/components/WhatsAppPhone/WhatsAppPhone";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { brandCopy } from "@/lib/brand";

const productCards = [
  {
    title: "Agente Legal",
    description:
      "Capta casos, pide informacion inicial y deja cada consulta lista para que el despacho responda con contexto.",
  },
  {
    title: "Agente Comercial",
    description:
      "Califica leads, contesta preguntas frecuentes y mueve a cada prospecto al siguiente paso sin perseguirlo manualmente.",
  },
  {
    title: "Agente Operativo",
    description:
      "Agenda, confirma, recuerda y organiza conversaciones repetitivas para que el equipo solo entre cuando hace falta.",
  },
];

const stats = [
  { value: "+0", label: "clientes publicados", description: "Placeholder para resultados reales por vertical." },
  { value: "+0", label: "industrias activas", description: "La homepage servira de base para el resto de las paginas." },
  { value: "0", label: "anos visibles", description: "Se actualiza cuando el despliegue comercial este listo." },
];

const audiences = [
  {
    title: "Despachos y especialistas",
    description: "Para equipos que venden experiencia y necesitan intake, agenda y seguimiento sin friccion.",
  },
  {
    title: "Clinicas y servicios",
    description: "Para negocios donde perder una llamada o un mensaje significa perder una cita o un ingreso.",
  },
  {
    title: "Empresas con volumen",
    description: "Para operaciones que quieren estandarizar WhatsApp y desplegar agentes por area o por marca.",
  },
];

const securityItems = [
  "Preparado para desplegarse en Vercel con llaves del lado servidor.",
  "Estructura pensada para futuras capas de privacidad, auditoria y manejo de contexto por industria.",
  "Mensajeria y respuestas centralizadas para no depender de procesos manuales ni chats dispersos.",
];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid fade-in">
          <div className="hero-copy">
            <div className="eyebrow-pill">{brandCopy.badge}</div>
            <h1>
              <span className="gradient-text">Prisma</span> para paginas que venden lo que tu agente ya puede hacer.
            </h1>
            <p>{brandCopy.heroDescription}</p>
            <div className="button-row">
              <Button href="#demo">Ver experiencia</Button>
              <Button href="#soluciones" variant="secondary">
                Explorar secciones
              </Button>
            </div>
          </div>

          <div className="hero-visual" aria-label="Preview visual con placeholders de contenido">
            <div className="hero-visual-grid">
              <div className="visual-card">
                <div className="muted-label">Plantilla reusable</div>
                <h3>Homepage primero</h3>
                <p>La estructura principal vive aqui para replicarse despues por vertical, caso de uso o campana.</p>
              </div>
              <div className="visual-card">
                <div className="muted-label">Visual placeholder</div>
                <h3>Video o screenshot</h3>
                <p>Espacio listo para reemplazar por demos, grabaciones de producto o arte por industria.</p>
              </div>
              <div className="visual-card large">
                <div className="muted-label">WhatsApp-native</div>
                <h3>El producto se muestra dentro del canal que ya usa el cliente.</h3>
                <p>
                  No se explica con abstracciones. Se ensena con una interfaz que se siente como el flujo real donde el agente responde, vende y agenda.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section
        id="soluciones"
        label="Soluciones de IA"
        title="La homepage presenta la oferta sin perder el formato de plantilla."
        description="Tomamos la claridad narrativa de Noa y la aterrizamos a PrismaProject: menos friccion, mas contexto, mas conversion desde WhatsApp."
      >
        <div className="products-grid fade-in">
          {productCards.map((card) => (
            <article key={card.title} className="placeholder-card">
              <div className="placeholder-media">placeholder media</div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        label="Prueba social"
        title="Metrica y claridad visual para repetir en todo el sitio."
        description="Los numeros se dejan como placeholder para que la estructura quede lista desde el primer build."
      >
        <div className="stats-grid fade-in">
          {stats.map((stat) => (
            <article key={stat.label} className="stat-card">
              <div className="stat-value">{stat.value}</div>
              <h3>{stat.label}</h3>
              <p>{stat.description}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="seguridad"
        label="Privacidad y seguridad"
        title="Tus datos estan seguros y tu despliegue se mantiene simple."
        description="Esta primera version usa mensajes claros y sobrios para vender confianza sin saturar la pagina de texto tecnico."
      >
        <div className="security-grid fade-in">
          <article className="security-card">
            <ShieldCheck size={20} strokeWidth={2} color="#818CF8" />
            <h3>Arquitectura lista para Vercel</h3>
            <p>Homepage, API route y experiencia interactiva listas para desplegar con configuracion minima.</p>
          </article>
          <article className="security-card">
            <ShieldCheck size={20} strokeWidth={2} color="#818CF8" />
            <h3>Llaves fuera del cliente</h3>
            <p>OpenRouter vive del lado servidor para que la demo publica no exponga credenciales.</p>
          </article>
          <article className="security-card">
            <ShieldCheck size={20} strokeWidth={2} color="#818CF8" />
            <h3>Base reusable</h3>
            <ul className="security-list">
              {securityItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </Section>

      <Section
        id="sectores"
        label="Para quien es"
        title="Un mismo sistema. Distintas paginas por vertical."
        description="La homepage deja lista la narrativa para que despues cambies el copy, el demo y los casos de uso por industria."
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

      <Section
        id="demo"
        label="Demo de producto"
        title="Un clon de WhatsApp para vender con contexto, no con capturas sueltas."
        description="Esta seccion es la base de las siguientes paginas. Cambias el guion, el prompt y el contenido; el formato permanece."
      >
        <WhatsAppPhone />
      </Section>

      <Section
        label="Cierre"
        title="Conoce al agente antes de construir el resto del sitio."
        description="Esta homepage ya deja resueltos el tono, la jerarquia visual y la forma de mostrar el producto de manera reusable."
      >
        <div className="cta-panel fade-in">
          <div>
            <h3>Empieza con una pagina que ya demuestra el valor del agente.</h3>
            <p>
              Usa esta plantilla para legal hoy y despues replica la misma base para salud, servicios y cualquier otra vertical con un contexto distinto.
            </p>
          </div>
          <div className="button-row">
            <Button href="#demo">Probar demo</Button>
            <Button href="#soluciones" variant="ghost">
              Ver secciones <ArrowRight size={16} strokeWidth={2} />
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}