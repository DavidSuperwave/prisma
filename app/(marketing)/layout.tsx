import type { ReactNode } from "react";
import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
