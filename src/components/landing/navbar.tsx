"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ChevronDown,
  Code2,
  Cpu,
  Ghost,
  GitBranch,
  Layers,
  Menu,
  Network,
  Radar,
  ShieldCheck,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";

interface NavDropdownItem {
  title: string;
  description: string;
  href: string;
  Icon: ComponentType<{ size?: number }>;
  badge?: string;
}

type MenuKey = "platform" | "features" | "solutions" | "developers";

const DROPDOWNS: Record<MenuKey, { label: string; items: NavDropdownItem[] }> = {
  platform: {
    label: "Platform",
    items: [
      {
        title: "Platform Overview",
        description:
          "Unified visibility connecting architecture, code scans, and runtime defense.",
        href: "#platform",
        Icon: Layers,
      },
      {
        title: "Architecture Visualization",
        description:
          "Interactive service maps across repositories, databases, and trust boundaries.",
        href: "#spotlight-architecture",
        Icon: Network,
      },
      {
        title: "Security Scanning",
        description:
          "Pre-merge SAST, SCA, Secrets, IaC, SBOM, and DAST integrity checks.",
        href: "#spotlight-guard",
        Icon: ShieldCheck,
      },
      {
        title: "Threat Monitoring",
        description:
          "Telemetry correlation, rule evaluation, and verified incident containment.",
        href: "#spotlight-sentinel",
        Icon: Radar,
      },
      {
        title: "Vulnerability Intelligence",
        description:
          "Map CVEs and KEV advisories directly to exposed dependencies and nodes.",
        href: "#showcase",
        Icon: BrainCircuit,
      },
    ],
  },
  features: {
    label: "Features",
    items: [
      {
        title: "WetScan Canvas",
        description:
          "Explore services, dependencies, trust tiers, and application workflows.",
        href: "#platform-canvas",
        Icon: Network,
        badge: "MAP",
      },
      {
        title: "WetScan Guard",
        description:
          "Analyze repository findings, generate diff fixes, and enforce CI/CD gates.",
        href: "#platform-guard",
        Icon: ShieldCheck,
      },
      {
        title: "WetScan Sentinel",
        description:
          "Investigate runtime events, triage alerts, and verify threat blocks.",
        href: "#platform-sentinel",
        Icon: Radar,
      },
      {
        title: "WetScan Intelligence",
        description:
          "Prioritize exposed dependencies and track known advisories in context.",
        href: "#platform-intelligence",
        Icon: BrainCircuit,
      },
      {
        title: "WetScan Ghost",
        description:
          "Arm high-signal decoy endpoints to expose probing early.",
        href: "#platform-ghost",
        Icon: Ghost,
      },
    ],
  },
  solutions: {
    label: "Solutions",
    items: [
      {
        title: "For Software Developers",
        description:
          "Architecture context and clear code diffs right inside everyday pull requests.",
        href: "#use-cases",
        Icon: Code2,
      },
      {
        title: "For Engineering Teams",
        description:
          "Shared workspace connecting system design, release readiness, and triage.",
        href: "#use-cases",
        Icon: Users,
      },
      {
        title: "For Security Engineers",
        description:
          "Verify blast radius on Canvas and trace incidents from Ghost to Sentinel.",
        href: "#use-cases",
        Icon: ShieldCheck,
      },
      {
        title: "For DevSecOps Workflows",
        description:
          "Evidence-backed merge gates synced across SAST, SCA, IaC, and runtime rules.",
        href: "#use-cases",
        Icon: Workflow,
      },
    ],
  },
  developers: {
    label: "Developers",
    items: [
      {
        title: "How It Works",
        description:
          "Follow the six-step path from repository connect to verified defense.",
        href: "#how-it-works",
        Icon: GitBranch,
      },
      {
        title: "Getting Started",
        description:
          "Create a workspace, choose repositories, and explore live security maps.",
        href: "#developers",
        Icon: ArrowRight,
      },
      {
        title: "Technology Overview",
        description:
          "Inspect SAST, dependency lockfile audits, SBOM, and OpenTelemetry models.",
        href: "#integrations",
        Icon: Cpu,
      },
      {
        title: "Platform FAQ",
        description:
          "Straight answers on how Canvas, Guard, Sentinel, and Intelligence connect.",
        href: "#faq",
        Icon: BookOpen,
      },
    ],
  },
};

const SECTION_IDS = [
  "platform",
  "how-it-works",
  "showcase",
  "solutions",
  "use-cases",
  "developers",
  "integrations",
  "about",
  "faq",
];

export function LandingNavbar() {
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<MenuKey | null>("platform");
  const [activeSection, setActiveSection] = useState<string>("");
  const navRef = useRef<HTMLElement>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocPointerDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.35] },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function cancelHoverClose() {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => setOpenMenu(null), 160);
  }

  function handleAnchorSelect(href: string) {
    setOpenMenu(null);
    setMobileOpen(false);
    if (href.startsWith("#")) {
      const target = document.getElementById(href.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  const isSectionActive = (key: MenuKey) => {
    if (key === "platform") return activeSection === "platform" || activeSection === "showcase";
    if (key === "features") return activeSection === "platform" || activeSection === "showcase";
    if (key === "solutions") return activeSection === "use-cases" || activeSection === "solutions";
    if (key === "developers")
      return (
        activeSection === "developers" ||
        activeSection === "integrations" ||
        activeSection === "faq"
      );
    return false;
  };

  return (
    <header className="landing-header-sticky" ref={navRef}>
      <div className="landing-nav-inner">
        <Link href="/" aria-label="WetScan home" onClick={() => setOpenMenu(null)}>
          <Logo />
        </Link>

        <nav className="landing-desktop-nav" aria-label="Main navigation">
          {(["platform", "features"] as MenuKey[]).map((key) => {
            const group = DROPDOWNS[key];
            const isOpen = openMenu === key;
            return (
              <div
                key={key}
                className="nav-dropdown-wrap"
                onMouseEnter={() => {
                  cancelHoverClose();
                  setOpenMenu(key);
                }}
                onMouseLeave={scheduleHoverClose}
              >
                <button
                  type="button"
                  className={`nav-trigger ${isOpen || isSectionActive(key) ? "active" : ""}`}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => setOpenMenu((cur) => (cur === key ? null : key))}
                >
                  {group.label}
                  <ChevronDown size={13} className={isOpen ? "rotated" : ""} />
                </button>

                {isOpen && (
                  <div
                    className="nav-megamenu"
                    role="menu"
                    aria-label={`${group.label} menu`}
                    onMouseEnter={cancelHoverClose}
                    onMouseLeave={scheduleHoverClose}
                  >
                    <div className="nav-megamenu-grid">
                      {group.items.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          role="menuitem"
                          className="nav-megamenu-item"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAnchorSelect(item.href);
                          }}
                        >
                          <span className="nav-megamenu-icon">
                            <item.Icon size={16} />
                          </span>
                          <div>
                            <div className="nav-megamenu-title">
                              <strong>{item.title}</strong>
                              {item.badge && <span className="badge blue">{item.badge}</span>}
                            </div>
                            <p>{item.description}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <a
            href="#how-it-works"
            className={`nav-trigger ${activeSection === "how-it-works" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              handleAnchorSelect("#how-it-works");
            }}
          >
            How It Works
          </a>

          {(["solutions", "developers"] as MenuKey[]).map((key) => {
            const group = DROPDOWNS[key];
            const isOpen = openMenu === key;
            return (
              <div
                key={key}
                className="nav-dropdown-wrap"
                onMouseEnter={() => {
                  cancelHoverClose();
                  setOpenMenu(key);
                }}
                onMouseLeave={scheduleHoverClose}
              >
                <button
                  type="button"
                  className={`nav-trigger ${isOpen || isSectionActive(key) ? "active" : ""}`}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => setOpenMenu((cur) => (cur === key ? null : key))}
                >
                  {group.label}
                  <ChevronDown size={13} className={isOpen ? "rotated" : ""} />
                </button>

                {isOpen && (
                  <div
                    className="nav-megamenu"
                    role="menu"
                    aria-label={`${group.label} menu`}
                    onMouseEnter={cancelHoverClose}
                    onMouseLeave={scheduleHoverClose}
                  >
                    <div className="nav-megamenu-grid">
                      {group.items.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          role="menuitem"
                          className="nav-megamenu-item"
                          onClick={(e) => {
                            e.preventDefault();
                            handleAnchorSelect(item.href);
                          }}
                        >
                          <span className="nav-megamenu-icon">
                            <item.Icon size={16} />
                          </span>
                          <div>
                            <div className="nav-megamenu-title">
                              <strong>{item.title}</strong>
                            </div>
                            <p>{item.description}</p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <a
            href="#about"
            className={`nav-trigger ${activeSection === "about" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              handleAnchorSelect("#about");
            }}
          >
            About
          </a>
        </nav>

        <div className="landing-nav-actions">
          <Link href="/login" className="nav-signin-link">
            Sign in
          </Link>
          <Link href="/onboarding" className="button primary">
            Start for Free
          </Link>
          <button
            type="button"
            className="icon-button landing-mobile-toggle"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="landing-mobile-drawer" role="dialog" aria-label="Mobile navigation">
          <div className="landing-mobile-scroll">
            {(Object.keys(DROPDOWNS) as MenuKey[]).map((key) => {
              const group = DROPDOWNS[key];
              const expanded = mobileExpanded === key;
              return (
                <div key={key} className="mobile-accordion-group">
                  <button
                    type="button"
                    className="mobile-accordion-btn"
                    aria-expanded={expanded}
                    onClick={() => setMobileExpanded(expanded ? null : key)}
                  >
                    <strong>{group.label}</strong>
                    <ChevronDown size={15} className={expanded ? "rotated" : ""} />
                  </button>
                  {expanded && (
                    <div className="mobile-accordion-items">
                      {group.items.map((item) => (
                        <a
                          key={item.title}
                          href={item.href}
                          onClick={(e) => {
                            e.preventDefault();
                            handleAnchorSelect(item.href);
                          }}
                        >
                          <item.Icon size={15} />
                          <span>{item.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mobile-direct-links">
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  handleAnchorSelect("#how-it-works");
                }}
              >
                How It Works
              </a>
              <a
                href="#about"
                onClick={(e) => {
                  e.preventDefault();
                  handleAnchorSelect("#about");
                }}
              >
                About WetScan
              </a>
            </div>

            <div className="mobile-drawer-ctas">
              <Link
                href="/login"
                className="button secondary"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/onboarding"
                className="button primary"
                onClick={() => setMobileOpen(false)}
              >
                Start for Free <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
