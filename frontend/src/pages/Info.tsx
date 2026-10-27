import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { PageTitle, Empty, Badge } from "../components/UI";
import { useQuery } from "@tanstack/react-query";
import { api, useAuth } from "../lib/api";
import { company } from "../content/company";
export default function Info() {
	const { pathname } = useLocation();
	const { requireEmailVerification } = useAuth();
	const site = useQuery({
		queryKey: ["site"],
		queryFn: () => api("/site"),
		enabled: pathname === "/contact",
	});
	const supportEmail = site.data?.supportEmail || company.email;
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
					<h2>Email our support team.</h2>
					<p>
						Need help with a game, your account or a purchase? Include the
						relevant order reference and a description of the issue. Never send
						passwords or card details.
					</p>
					<a className="button primary" href={`mailto:${supportEmail}`}>
						{supportEmail}
					</a>
					{site.data?.supportReplyAim && <p>We aim to reply within 2 hours.</p>}

					<nav className="contact-actions" aria-label="Support resources">
						<Link to="/help" className="button secondary">
							Visit the help center
							<ArrowRight size={16} aria-hidden="true" />
						</Link>
						<Link to="/policies" className="button contact-policy-link">
							Read our policies
							<ArrowRight size={16} aria-hidden="true" />
						</Link>
					</nav>
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
						`The store shows EUR and USD prices; checkout is restricted to currencies enabled by the merchant. ${requireEmailVerification ? "Confirm your email before purchasing coins. " : "Email confirmation is optional during the initial launch. "}Purchases still require a configured gateway and verified payment evidence. The success page does not add coins.`,
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
