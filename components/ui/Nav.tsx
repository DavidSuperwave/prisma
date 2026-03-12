import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "#soluciones", label: "Soluciones" },
  { href: "#seguridad", label: "Seguridad" },
  { href: "#sectores", label: "Sectores" },
  { href: "#demo", label: "Demo" },
];

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label="Ir al inicio de Prisma">
          <Image
            src="/prisma-logo.svg"
            alt=""
            width={32}
            height={32}
            aria-hidden="true"
          />
          <span>Prisma</span>
        </Link>

        <nav className="nav-links" aria-label="Navegacion principal">
          {links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
