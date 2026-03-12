import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "#soluciones", label: "Soluciones" },
  { href: "#seguridad", label: "Privacidad" },
  { href: "#demo", label: "Demo" },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div className="nav-logo">
            <Image
              src="/prisma-logo.svg"
              alt=""
              width={32}
              height={32}
              aria-hidden="true"
            />
            <span>Prisma</span>
          </div>
          <p className="footer-copy">Agentes IA para WhatsApp. Hecho para Mexico.</p>
        </div>

        <nav className="footer-links" aria-label="Enlaces del pie de pagina">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
