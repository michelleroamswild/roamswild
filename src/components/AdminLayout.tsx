import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FlagBanner, Users, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Header } from "@/components/Header";
import { Mono } from "@/components/redesign";
import { cn } from "@/lib/utils";

interface AdminNavItem {
  to: string;
  label: string;
  icon: PhosphorIcon;
  /** `end` = match the path exactly. Use for parent-style routes like /admin
   * that would otherwise stay "active" when on /admin/something. */
  end?: boolean;
}

// Add new admin sections here. Order = sidebar order.
const NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin",             label: "Users",        icon: Users,      end: true },
  { to: "/admin/spot-review", label: "Spot Quality", icon: FlagBanner },
];

interface AdminLayoutProps {
  /** Mono cap rendered above the page title — e.g. counts, status. */
  eyebrow?: ReactNode;
  /** Display title — large bold sans. */
  title: string;
  /** Short paragraph under the title. */
  description?: string;
  /** Hero-row right-side slot (filters, action pills). */
  headerActions?: ReactNode;
  children: ReactNode;
}

export const AdminLayout = ({
  eyebrow,
  title,
  description,
  headerActions,
  children,
}: AdminLayoutProps) => {
  return (
    <div className="bg-cream dark:bg-paper text-ink font-sans min-h-screen">
      <Header />

      <div className="max-w-[1440px] mx-auto lg:flex">
        {/* Sidebar — sticky on lg, horizontal scroll-row on mobile so all
            sections stay reachable without a drawer. */}
        <aside className="lg:w-60 lg:flex-shrink-0 lg:pl-6 lg:pr-4 lg:pt-12">
          <div className="lg:sticky lg:top-24">
            <Mono className="text-pine-6 hidden lg:block mb-3 px-3">Admin</Mono>
            <nav
              className="flex lg:flex-col gap-1.5 px-4 lg:px-0 py-3 lg:py-0 overflow-x-auto scrollbar-hide border-b border-line lg:border-0"
              aria-label="Admin sections"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex items-center gap-2.5 px-3 py-2 rounded-[12px] text-[13px] font-sans font-semibold tracking-[-0.005em] transition-colors flex-shrink-0",
                        isActive
                          ? "bg-pine-6/10 text-pine-6"
                          : "text-ink-2 hover:text-ink hover:bg-ink/5",
                      )
                    }
                  >
                    <Icon className="w-4 h-4" weight="regular" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <section className="px-6 md:px-10 lg:px-8 pt-8 md:pt-12 pb-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0">
                {eyebrow && <Mono className="text-pine-6">{eyebrow}</Mono>}
                <h1 className="font-sans font-bold tracking-[-0.035em] leading-[1] text-[36px] md:text-[52px] m-0 text-ink mt-2.5">
                  {title}.
                </h1>
                {description && (
                  <p className="text-[14px] text-ink-3 mt-3 max-w-xl leading-[1.55]">
                    {description}
                  </p>
                )}
              </div>
              {headerActions}
            </div>
          </section>

          <section className="px-6 md:px-10 lg:px-8 pb-12 md:pb-16">{children}</section>
        </main>
      </div>
    </div>
  );
};
