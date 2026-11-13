import Link from "next/link";
import {
  ArrowRight,
  Check,
  GitBranch,
  ShieldCheck,
  Workflow,
  Radar,
  ArrowUpRight,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { MiniMap } from "@/components/mini-map";
export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" aria-label="WetScan home">
          <Logo />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/login">
            Sign in <ArrowUpRight size={14} />
          </Link>
          <Link href="/account">Account</Link>
        </nav>
        <Link href="/onboarding" className="button primary">
          Start for Free <ArrowRight size={16} />
        </Link>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <div className="hero-kicker">
              <span className="live-dot" /> A LITTLE CLARITY. A LOT MORE
              CONFIDENCE.
            </div>
            <h1>
              Your app is growing.
              <br />
              Let’s keep it <span>safe.</span>
            </h1>
            <p>
              You build the software. We help you understand how it connects,
              what needs attention, and what to do next.
            </p>
            <div className="hero-buttons">
              <Link className="button primary large" href="/onboarding">
                Start for Free <ArrowRight size={18} />
              </Link>
              <Link className="button secondary large" href="/login">
                <GitBranch size={18} />
                Sign in to your workspace
              </Link>
            </div>
            <div className="hero-reassurance">
              <Check size={15} /> No credit card required <span>·</span>
              <Check size={15} /> GitHub App integration <span>·</span> Clearly
              labeled demo data
            </div>
          </div>
          <div className="hero-product">
            <div className="mini-window-bar">
              <span />
              <span />
              <span />
              <div>orderly-demo / application map</div>
              <span className="badge blue">Demo</span>
            </div>
            <div className="hero-map-title">
              <span className="eyebrow">YOUR APPLICATION, CONNECTED</span>
              <h2>See the bigger picture.</h2>
              <p>Then focus on what matters.</p>
            </div>
            <MiniMap />
            <div className="hero-finding">
              <ShieldCheck size={22} />
              <div>
                <strong>One clear next step</strong>
                <p>Review who can access your Orders API.</p>
              </div>
              <Link
                aria-label="Inspect the demo finding"
                href="/app/projects/orderly-demo/guard/findings/FIND-102"
              >
                <ArrowUpRight size={20} />
              </Link>
            </div>
          </div>
        </section>
        <section id="how-it-works" className="landing-capabilities">
          <div>
            <span className="eyebrow">LESS GUESSWORK. MORE BUILDING.</span>
            <h2>Security that makes sense.</h2>
          </div>
          {[
            {
              Icon: Workflow,
              title: "Understand your app",
              text: "A clear map of your components, connections, and what we actually know.",
              label: "CANVAS",
            },
            {
              Icon: ShieldCheck,
              title: "Know what needs fixing",
              text: "Readable findings, scoped evidence, and a practical next step.",
              label: "GUARD",
            },
            {
              Icon: Radar,
              title: "Follow every outcome",
              text: "From suspicious activity to response and a separately verified result.",
              label: "SENTINEL",
            },
          ].map(({ Icon, title, text, label }) => (
            <article key={label}>
              <Icon size={25} />
              <small>{label}</small>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>Cybersecurity made simple for everyone who builds software.</p>
        <span>Interactive prototype · No live protection</span>
      </footer>
    </div>
  );
}
