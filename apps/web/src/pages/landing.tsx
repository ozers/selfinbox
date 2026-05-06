import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Mail,
  ArrowRight,
  Github,
  Server,
  Lock,
  Copy,
  Sun,
  Moon,
  Menu,
  X as XIcon,
  ChevronDown,
  AlertTriangle,
  ExternalLink,
} from "lucide-react"

const REPO_URL = "https://github.com/ozers/selfinbox"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/lib/theme"

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const dnsRecords = [
  { type: "MX", name: "yourdomain.com", value: "10 inbound-smtp.eu-west-1.amazonaws.com" },
  { type: "TXT", name: "yourdomain.com", value: "v=spf1 include:amazonses.com ~all" },
  { type: "CNAME", name: "abc123._domainkey", value: "abc123.dkim.amazonses.com" },
  { type: "TXT", name: "_dmarc.yourdomain.com", value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com" },
]

const navLinks = [
  { label: "Setup guide", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function Step({
  num,
  title,
  description,
  children,
}: {
  num: string
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4 }}
      className="relative rounded-xl border border-border bg-card p-6 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
          {num}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground sm:text-lg">{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
          )}
          {children && <div className="mt-4 space-y-3">{children}</div>}
        </div>
      </div>
    </motion.div>
  )
}

function Snippet({ children }: { children: React.ReactNode }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed font-mono text-foreground">
      <code>{children}</code>
    </pre>
  )
}

function SandboxCallout() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-status-pending/40 bg-status-pending/5 p-6 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-status-pending/15">
          <AlertTriangle className="h-4.5 w-4.5 text-status-pending" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground sm:text-lg">
            Important: leave the SES sandbox
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            Every new AWS account starts in the <strong className="text-foreground">SES sandbox</strong> — you can only send to email addresses you've verified, capped at 200/day. To send to anyone, you have to <strong className="text-foreground">request production access</strong>. Approval typically takes a few hours.
          </p>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Do this now</strong>, before you finish setup, so it's done by the time you're ready to send. AWS Console → SES → Account dashboard → "Request production access". You can keep developing in sandbox mode while you wait — just verify your own personal email address as a recipient for testing.
          </p>
          <a
            href="https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read AWS docs on production access
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  )
}

function HeroCTA({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col sm:flex-row gap-2 ${className}`}>
      <Link to="/login" className="flex-1">
        <Button type="button" variant="hero" size="default" className="w-full">
          Sign in
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex-1">
        <Button type="button" variant="outline" size="default" className="w-full">
          <Github className="h-4 w-4" />
          View on GitHub
        </Button>
      </a>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [faqIndex, setFaqIndex] = useState<number | null>(null)
  const { theme, toggle } = useTheme()

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Navbar ────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Mail className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold text-foreground">Selfinbox</span>
          </Link>

          {/* Center links (md+) */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden sm:inline-flex">
              <Button variant="ghost" size="icon" title="GitHub">
                <Github className="h-4 w-4" />
              </Button>
            </a>
            <Button variant="ghost" size="icon" onClick={toggle} className="hidden sm:inline-flex">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Link to="/login" className="hidden sm:inline-flex">
              <Button variant="default" size="sm">
                Sign in
              </Button>
            </Link>
            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <XIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="border-t border-border bg-background px-6 pb-4 pt-2 md:hidden">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-1">
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="default" size="default" className="w-full justify-start">
                  Sign in
                </Button>
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="default" className="w-full justify-start">
                  <Github className="h-4 w-4 mr-2" />
                  GitHub
                </Button>
              </a>
              <Button variant="ghost" size="default" onClick={toggle} className="justify-start">
                {theme === "dark" ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </Button>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-primary/5 blur-[120px]" />

        <div className="relative mx-auto max-w-4xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-active opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-status-active" />
            </span>
            Open source &middot; Self-hosted on AWS
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
          >
            Run your own email service{" "}
            <br className="hidden sm:block" />
            on <span className="text-primary">AWS</span> in an afternoon.
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Self-hosted custom-domain email. Send and receive as{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
              you@yourdomain.com
            </code>{" "}
            with a web inbox and per-domain SMTP. SES does the delivery — you keep the data, the bill stays yours.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col items-center gap-3"
          >
            <HeroCTA className="w-full max-w-md" />
          </motion.div>

          {/* DNS Preview Card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-14 mx-auto max-w-2xl rounded-xl border border-border bg-card overflow-hidden shadow-sm"
          >
            {/* Terminal header */}
            <div className="flex items-center gap-1.5 border-b border-border bg-muted px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-status-error/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-pending/60" />
              <span className="h-2.5 w-2.5 rounded-full bg-status-active/60" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">DNS Records — auto-generated</span>
            </div>
            {/* Records */}
            <div className="divide-y divide-border">
              {dnsRecords.map((r, i) => (
                <div
                  key={i}
                  className="group flex items-center gap-2 px-4 py-2.5 text-left text-xs font-mono hover:bg-secondary/50 transition-colors sm:gap-3"
                >
                  <span className="shrink-0 w-8 text-primary font-semibold">{r.type}</span>
                  <span className="shrink-0 w-20 truncate text-muted-foreground sm:w-40">{r.name}</span>
                  <span className="flex-1 truncate text-foreground">{r.value}</span>
                  <button className="shrink-0 opacity-100 transition-opacity text-muted-foreground hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Trust signals */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-primary" />
              <span>MIT licensed, ~3K LoC</span>
            </div>
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              <span>Single-process Node + Postgres</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <span>DKIM / SPF / DMARC auto-configured</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── How it Works ──────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-24 bg-secondary/50">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold">From zero to live, step by step</h2>
            <p className="mt-3 text-muted-foreground">
              Assumes nothing — no AWS account, no Postgres, no shell tools. Plan ~1 hour the first time.
            </p>
          </motion.div>

          <div className="mt-14 space-y-8">
            <Step
              num="01"
              title="Make sure you have the basics"
              description="Before anything else, get these in place. All of them have a free tier or are free."
            >
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="text-primary">•</span><span><a href="https://aws.amazon.com" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">An AWS account</a> — free tier is fine to start, you'll pay cents per month for personal use</span></li>
                <li className="flex gap-2"><span className="text-primary">•</span><span><a href="https://nodejs.org" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">Node 23</a>, <a href="https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">AWS CLI v2</a>, and <a href="https://stedolan.github.io/jq/" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">jq</a> installed</span></li>
                <li className="flex gap-2"><span className="text-primary">•</span><span>A Postgres database — <a href="https://neon.tech" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">Neon</a>, <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">Supabase</a>, or <a href="https://railway.app" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-foreground">Railway</a> all have free tiers. Local works too.</span></li>
                <li className="flex gap-2"><span className="text-primary">•</span><span>A domain whose DNS records you control</span></li>
              </ul>
              <Snippet># after installing the AWS CLI, configure it once:
aws configure
# (paste an Access Key ID + Secret from AWS console → IAM → Users → your user → Security credentials)</Snippet>
            </Step>

            <Step
              num="02"
              title="Clone the repo and install"
            >
              <Snippet>{`git clone https://github.com/ozers/selfinbox
cd selfinbox

(cd apps/api && npm install)
(cd apps/web && npm install)`}</Snippet>
            </Step>

            <Step
              num="03"
              title="Configure your environment"
              description="Copy the example file and fill in the required values. The schema auto-creates on boot, so just point DATABASE_URL at an empty database."
            >
              <Snippet>{`cp .env.example apps/api/.env
$EDITOR apps/api/.env
# at minimum set: DATABASE_URL, JWT_SECRET, FROM_EMAIL,
#                 AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`}</Snippet>
            </Step>

            <Step
              num="04"
              title="Provision AWS resources with one script"
              description="The included setup-aws.sh creates everything Selfinbox needs in your account: an S3 bucket for inbound mail, two SNS topics, an IAM user with a least-privilege policy, and a SES receipt rule set. Idempotent — re-running skips anything that exists."
            >
              <Snippet>{`APP_URL=http://localhost:3001 ./scripts/setup-aws.sh

# at the end it prints fresh AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
# — paste them into apps/api/.env`}</Snippet>
            </Step>

            <Step
              num="05"
              title="Verify your sender domain in SES"
              description="SES needs to know you own the domain you'll send from. Two CLI calls, then add the records they print to your DNS host."
            >
              <Snippet>{`aws ses verify-domain-identity --domain yourdomain.com
aws ses verify-domain-dkim     --domain yourdomain.com

# add the printed TXT (verification) and CNAME (DKIM) records to your DNS
# verification finishes in a few minutes`}</Snippet>
            </Step>

            <SandboxCallout />

            <Step
              num="06"
              title="Boot the app and create your first account"
              description="Registration is closed by default. Open it briefly to sign yourself up, then close it again — that's your auth wall."
            >
              <Snippet>{`# in apps/api/.env, set REGISTRATION_ENABLED=true

(cd apps/api && npm run dev) &     # API on :3001
(cd apps/web && npm run dev)        # SPA on :5173

# open http://localhost:5173, register, then set
# REGISTRATION_ENABLED=false and restart the API`}</Snippet>
            </Step>

            <Step
              num="07"
              title="Add a domain in the dashboard"
              description="Paste a domain you control. Selfinbox creates the SES identity and shows you four DNS records to add at your registrar. (Cloudflare users: there's a one-click button that does it for you.) Verification polls in the background and the domain goes live the moment all records resolve."
            >
              <p className="mt-2 text-sm text-muted-foreground">
                Once active, add addresses like <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">hello@yourdomain.com</code>, set up forwarding, or grab the per-domain SMTP credentials for outbound apps. That's it — you have working email.
              </p>
            </Step>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section id="faq" className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
          </motion.div>

          <div className="mt-12 space-y-3">
            {[
              {
                q: "What does this cost to run?",
                a: "You pay AWS directly. SES is $0.10 per 1,000 emails sent and the first 1,000 received per month are free. S3 storage for inbound mail is cents per GB. A personal deploy with a few hundred emails/month typically runs under $1/month all-in, plus whatever you spend on a VPS or Railway compute.",
              },
              {
                q: "Why not Postfix / Mailcow / Stalwart?",
                a: "Those are full mail servers — you run the MTA, manage IP reputation, fight blocklists, monitor delivery. Selfinbox is a thin app over AWS SES, so SES handles all of that. Less ops, less control. If you want to leave AWS entirely, those are the right tools.",
              },
              {
                q: "Can I forward to Gmail / iCloud / my real inbox?",
                a: "Yes. Each address can have a forwarding target — incoming mail gets re-sent via SES to wherever you want. You can also point Gmail's \"Send as\" feature at the per-domain SMTP credentials to send mail through Selfinbox from the Gmail UI.",
              },
              {
                q: "Do I need to leave the SES sandbox?",
                a: "If you only send to verified addresses (testing, or forwarding to your own Gmail), no. To send to arbitrary recipients you'll need production access — request it in the SES console, takes a few hours to approve.",
              },
              {
                q: "What domain registrars work?",
                a: "Anywhere you can add DNS records — Cloudflare, Namecheap, GoDaddy, Route 53, your registrar's basic DNS panel. The MX/SPF/DKIM/DMARC records are standard. Cloudflare users get a one-click button to add them all automatically.",
              },
              {
                q: "Is this multi-user?",
                a: "Yes. One deploy serves many users, each with their own domains and addresses, isolated by user_id. Public registration is off by default — you flip a single env var when you want to invite someone, then flip it back.",
              },
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="rounded-xl border border-border bg-card"
              >
                <button
                  onClick={() => setFaqIndex(faqIndex === i ? null : i)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left"
                >
                  <span className="font-medium text-foreground">{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      faqIndex === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <motion.div
                  initial={false}
                  animate={{
                    height: faqIndex === i ? "auto" : 0,
                    opacity: faqIndex === i ? 1 : 0,
                  }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {faq.a}
                  </p>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-background px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Mail className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">Selfinbox</span>
              <p className="text-xs text-muted-foreground">Self-hosted custom-domain email on AWS SES.</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <span className="font-mono text-xs">MIT</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
