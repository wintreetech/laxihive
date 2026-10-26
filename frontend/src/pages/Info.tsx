import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck, Info as InfoIcon } from "lucide-react";
import { PageTitle, Empty, Badge } from "../components/UI";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
const legal: Record<string, { title: string; sections: [string, string][] }> = {
  "/privacy": {
    title: "Your privacy matters.",
    sections: [
      [
        "What the application stores",
        "Account email, display name, a password hash, expiring sessions, gameplay records, achievements, wallet ledger and payment references. Card entry is handled on the selected gateway’s hosted checkout.",
      ],
      [
        "Your public profile",
        "Profiles are private by default. Opting into leaderboards shares your display name, avatar color and validated starter scores. Email addresses are not published.",
      ],
      [
        "Your choices",
        "Edit your profile, revoke sessions or request account deletion in Settings. Guest favorites and records are saved on your device and can be removed through your browser. Financial audit records remain after account anonymization.",
      ],
      [
        "Owner review required",
        "The business owner must provide the legal operator, privacy contact, retention periods, hosting locations, applicable rights, age requirements and processor disclosures before public launch. This draft does not establish a legal policy.",
      ],
    ],
  },
  "/terms": {
    title: "A good place to play.",
    sections: [
      [
        "The experience",
        "LexiHive offers browser-based word, logic, number, memory, focus and puzzle games. Access is labeled as free, a practice preview, a priced session or a permanent expansion. Every coin charge requires confirmation.",
      ],
      [
        "Your account",
        "Keep your password private. Use accurate account information. Do not automate reward claims, tamper with scores, abuse the service or attempt unauthorized account access.",
      ],
      [
        "Fair play",
        "Starter scores are replay-validated by the server. Advanced sessions and imported guest records do not appear on competitive leaderboards. Rewards have daily limits.",
      ],
      [
        "Owner review required",
        "The owner must finalize legal identity, jurisdiction, eligibility, acceptable-use enforcement, liability terms, dispute process, service availability and policy acceptance language before launch. This is a review draft.",
      ],
    ],
  },
  "/refund-policy": {
    title: "Clear purchases. Clear expectations.",
    sections: [
      [
        "Before payment",
        "The coin store requests a server-generated quote. Any applicable taxes and the final total are presented in the gateway before payment confirmation. Checkout requires configured merchant verification credentials and explicit activation.",
      ],
      [
        "Payment reversals",
        "Verified refunds proportionally reverse purchased coins. If already-spent coins create an adjustment amount, available coins never become negative: spending and advanced access pause until the amount is reconciled. New credits offset that amount first.",
      ],
      [
        "Requesting support",
        "Use the email address on Contact for purchase assistance, including your order reference. Unstarted charged game sessions can be cancelled for a coin refund. Starting, completing or abandoning an attempt consumes its session access. Money refunds follow the published business policy.",
      ],
      [
        "Owner review required",
        "Refund eligibility, timing, consumer rights, tax treatment and regional requirements must be reviewed and finalized by the business owner. The implementation policy does not replace those obligations.",
      ],
    ],
  },
  "/virtual-currency": {
    title: "A little extra, kept simple.",
    sections: [
      [
        "What coins are",
        "LexiHive coins are non-transferable virtual items for priced game sessions and permanent expansions. They have no cash value, cannot be redeemed for money and cannot be transferred between players. There is no cash-out or gambling.",
      ],
      [
        "How coins work",
        "Your coin balance is calculated on the server from an auditable ledger. Purchase credits require verified gateway payment events. Achievement awards are limited and issued once per achievement.",
      ],
      [
        "Free gameplay stays free",
        "Games labeled Free to play cost zero coins. Practice previews award no XP or coins. Paid sessions and advanced modes are excluded from competitive leaderboards. Hive Quest stars remain separate from wallet coins.",
      ],
      [
        "Owner review required",
        "The owner must finalize expiration rules (if any), regional purchase restrictions, account-closure handling, consumer disclosures and legal operator details before launch. No expiration policy is currently implemented.",
      ],
    ],
  },
};
export default function Info() {
  const { pathname } = useLocation();
  const site = useQuery({
    queryKey: ["site"],
    queryFn: () => api("/site"),
    enabled: pathname === "/contact",
  });
  if (legal[pathname]) {
    const doc = legal[pathname];
    return (
      <div className="page prose-page">
        <PageTitle
          eyebrow="CLARITY IS PART OF THE EXPERIENCE"
          title={doc.title}
        />
        <div className="legal-review">
          <InfoIcon size={20} />
          <div>
            <strong>
              Business-owner review required before production release
            </strong>
            <p>
              This page describes the current implementation and is a policy
              draft. Legal, tax, contact and contractual details need owner
              approval.
            </p>
          </div>
        </div>
        {doc.sections.map(([t, p]) => (
          <section key={t}>
            <h2>{t}</h2>
            <p>{p}</p>
          </section>
        ))}
        <Link className="text-link" to="/help">
          Need a little help?
          <ArrowRight size={15} />
        </Link>
      </div>
    );
  }
  if (pathname === "/contact")
    return (
      <div className="page prose-page">
        <PageTitle
          eyebrow="LET’S KEEP IN TOUCH"
          title="A little help goes a long way."
          description="Need help with your account, a game or a purchase?"
        />
        <section className="panel contact-card">
          <Mail size={32} />
          <h2>
            {site.data?.supportEmail
              ? "Email our support team."
              : "Our support address is being confirmed."}
          </h2>
          <p>
            {site.data?.supportEmail
              ? "Need help with a game, your account or a purchase? Include the relevant order reference and a description of the issue. Never send passwords or card details."
              : "A verified support email will appear here when available. You can find gameplay, wallet and payment guidance in the help center."}
          </p>
          {site.data?.supportEmail && (
            <a
              className="button primary"
              href={`mailto:${site.data.supportEmail}`}
            >
              {site.data.supportEmail}
            </a>
          )}
          {site.data?.supportReplyAim && <p>We aim to reply within 2 hours.</p>}
          {site.error && (
            <p role="alert">
              Contact information is temporarily unavailable. Please try again.
            </p>
          )}
          <Link to="/help" className="button secondary">
            Visit the help center
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    );
  if (pathname === "/help")
    return (
      <div className="page prose-page">
        <PageTitle
          eyebrow="A LITTLE GUIDANCE"
          title="Keep the good games going."
          description="A few answers to help you find your way."
        />
        {[
          [
            "How do I start playing?",
            "Browse All Games and check its access label. Free to play means the complete mode costs zero coins. Eligible paid games offer a clearly timed practice preview after sign-in. A paid session covers one attempt; a permanent unlock stays with your account.",
          ],
          [
            "How do I save progress?",
            "Sign in before starting a game. Completed sessions are replay-validated and saved on the server. Guest records stay on your device; you can choose to import personal records from the dashboard.",
          ],
          [
            "How do XP, streaks and coins work?",
            "Score measures game performance. Eligible full-game wins earn 40 XP, up to 20 rewarded wins per UTC day. Daily Hive awards XP once daily. Every 400 XP advances your level. Six achievements award 25 coins each once. A saved win each UTC day maintains your streak; practice previews award no rewards.",
          ],
          [
            "Why can’t I purchase coins?",
            "You can choose USD or EUR in the coin store. Purchases require a verified email and an available payment gateway. If checkout is unavailable, payment setup is still in progress. Your balance is only credited after payment confirmation.",
          ],
          [
            "What if my payment says pending?",
            "The success page reads the server status and cannot award coins. The server needs verified payment confirmation. Production notifications and configured status checks process payment independently of your browser. If confirmation is delayed, keep the order reference and contact support; do not pay again merely to refresh the status.",
          ],
          [
            "What does a refund adjustment mean?",
            "Refunded or disputed purchases reverse coins. If the coins have been spent, a reconciliation amount pauses spending and advanced access. Your balance remains nonnegative. Future credits offset this amount first.",
          ],
          [
            "Can I use the keyboard or reduce motion?",
            "Use Tab to reach controls and Enter or Space to activate them. Answer fields accept keyboard input. Animations respect your system’s reduced-motion preference, and sound is off by default.",
          ],
          [
            "How do I delete my account?",
            "Open Settings, enter your current password and confirm account deletion. Gameplay and personal details are removed or anonymized. Required payment and audit records remain.",
          ],
        ].map(([t, p]) => (
          <details className="help-detail" key={t}>
            <summary>
              {t}
              <span>+</span>
            </summary>
            <p>{p}</p>
          </details>
        ))}
        <div className="info-strip">
          <ShieldCheck />
          <p>
            Profiles are private by default. You can choose to participate on
            leaderboards in Settings.
          </p>
        </div>
        <Link to="/contact" className="text-link">
          Contact information
          <ArrowRight size={15} />
        </Link>
      </div>
    );
  return (
    <div className="page not-found">
      <Badge color="violet">404 · A LITTLE OFF THE TRAIL</Badge>
      <Empty
        title="Curiosity took a different turn."
        description="That page isn’t in the hive. Your next good game still is."
        action={
          <Link className="button primary" to="/games">
            Find your next game
            <ArrowRight size={16} />
          </Link>
        }
      />
    </div>
  );
}
