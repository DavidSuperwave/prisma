import Link from "next/link";

const links = [
  { href: "#soluciones", label: "Soluciones" },
  { href: "#seguridad", label: "Seguridad" },
  { href: "#sectores", label: "Sectores" },
  { href: "#demo", label: "Demo" },
];

function PrismaMark() {
  return (
    <svg viewBox="0 0 40 40" width="32" height="32" fill="none" aria-hidden="true">
      <path d="M20 4L36 34H4L20 4Z" stroke="#818CF8" strokeWidth="2" />
      <path d="M20 12L28 28H12L20 12Z" stroke="#A78BFA" strokeWidth="1.5" opacity="0.5" />
      <line x1="20" y1="4" x2="20" y2="34" stroke="url(#navGrad)" strokeWidth="1" opacity="0.45" />
      <defs>
        <linearGradient id="navGrad" x1="20" y1="4" x2="20" y2="34">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="nav-logo" aria-label="Ir al inicio de PrismaProject">
          <PrismaMark />
          <span>PrismaProject</span>
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
