import { Link } from "react-router-dom";
import { Check, Mail } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Navigation from "@/components/Navigation";
import { useSession } from "@/hooks/use-session";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

interface LegalPageProps {
  icon: LucideIcon;
  title: string;
  updated: string;
  /** The plain-language version, shown first. */
  summary: string[];
  sections: LegalSection[];
  contact: { email: string; label: string };
  other: { to: string; label: string };
}

/** A tidy bullet list for legal text, with ticks instead of dots. */
export const LegalList = ({ items }: { items: string[] }) => (
  <ul className="mt-2 space-y-2">
    {items.map((item) => (
      <li key={item} className="flex gap-2.5">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

/** Privacy Policy and Terms: a short version first, then numbered sections you can jump to. */
const LegalPage = ({ icon: Icon, title, updated, summary, sections, contact, other }: LegalPageProps) => {
  const session = useSession();
  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={session?.user.id} />
      <main className="mx-auto max-w-2xl px-4 pb-28 pt-6">
        <header className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-[28px] font-bold tracking-tight">{title}</h1>
          <p className="mt-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">Last updated {updated}</p>
        </header>

        <section aria-label="In short" className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary">In short</h2>
          <div className="text-[15px] leading-relaxed">
            <LegalList items={summary} />
          </div>
        </section>

        {/* Contents: jump to a section */}
        <nav aria-label="Contents" className="sticky top-0 z-10 -mx-4 mt-6 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:top-[var(--nav-height)]">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {sections.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-accent">
                {i + 1}. {s.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="mt-4 space-y-3">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20 rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-3 text-[17px] font-semibold">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">{i + 1}</span>
                {s.title}
              </h2>
              <div className="mt-3 text-[15px] leading-relaxed text-foreground/85 [&_a]:font-medium [&_a]:text-primary [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_p+p]:mt-2">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-6 rounded-2xl bg-secondary p-5 text-center">
          <p className="text-[15px] font-semibold">{contact.label}</p>
          <a href={`mailto:${contact.email}`} className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <Mail className="h-4 w-4" aria-hidden="true" /> {contact.email}
          </a>
          <p className="mt-4 text-sm text-muted-foreground">
            See also our <Link to={other.to} className="font-medium text-primary">{other.label}</Link>.
          </p>
        </footer>
      </main>
    </div>
  );
};

export default LegalPage;
