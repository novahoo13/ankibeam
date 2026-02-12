import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
	Star,
	Globe,
	Layout,
	MousePointer2,
	Github,
	Chrome,
	Languages,
	Check,
	BookOpen,
	Sparkles,
	MousePointerClick,
	Brain,
	Download,
	Lock,
	Eye,
	Code,
	RefreshCw,
	ChevronRight,
} from "lucide-react";

const GITHUB_URL = "https://github.com/novahoo13/ankibeam";
const RELEASES_URL = `${GITHUB_URL}/releases/latest`;
const PRIVACY_URL = "#privacy";
const ANKI_URL = "https://apps.ankiweb.net/";

const MockupWindow = ({ children, className = "" }) => (
	<div
		className={`bg-white rounded-xl shadow-glow border border-slate-200 overflow-hidden ${className}`}>
		<div className="bg-slate-50 border-b border-slate-100 px-4 py-2 flex items-center gap-2">
			<div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
			<div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
			<div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
		</div>
		{children}
	</div>
);

const FloatingBadge = ({ icon: Icon, text, delay, className = "" }) => (
	<motion.div
		initial={{ opacity: 0, scale: 0.8, y: 10 }}
		whileInView={{ opacity: 1, scale: 1, y: 0 }}
		viewport={{ once: true }}
		transition={{ delay, type: "spring" }}
		className={`absolute z-20 flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur shadow-lg rounded-full border border-slate-200/60 text-xs font-semibold text-slate-700 ${className}`}>
		<div className="p-1 rounded-full bg-emerald-100 text-emerald-600">
			<Icon className="w-3 h-3" />
		</div>
		{text}
	</motion.div>
);

const StepCard = ({ number, icon: Icon, title, desc, delay }) => (
	<motion.div
		initial={{ opacity: 0, y: 20 }}
		whileInView={{ opacity: 1, y: 0 }}
		viewport={{ once: true }}
		transition={{ delay, duration: 0.5 }}
		className="flex flex-col items-center text-center group">
		<div className="relative mb-6">
			<div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-100 transition-colors">
				<Icon className="w-7 h-7" />
			</div>
			<div className="absolute -top-2 -right-2 w-7 h-7 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
				{number}
			</div>
		</div>
		<h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
		<p className="text-slate-500 text-sm leading-relaxed max-w-xs">{desc}</p>
	</motion.div>
);

const Navbar = ({ scrolled, t, i18n, changeLanguage }) => (
	<nav
		className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-100" : "bg-transparent"}`}>
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
			<a
				href="#"
				className="flex items-center gap-2 font-bold text-xl tracking-tight">
				<div className="flex items-center justify-center">
					<Star
						className="w-8 h-8 text-emerald-500 fill-emerald-500"
						strokeWidth={0}
					/>
				</div>
				<span className="text-slate-900">Anki</span>
				<span className="text-emerald-500">Beam</span>
			</a>

			<div className="flex items-center gap-3">
				<div className="relative group">
					<button className="p-2 text-slate-500 hover:text-emerald-600 transition-colors rounded-full hover:bg-slate-100">
						<Languages className="w-5 h-5" />
					</button>
					<div className="absolute right-0 mt-2 w-32 bg-white border border-slate-100 rounded-lg shadow-xl py-1 hidden group-hover:block divide-y divide-slate-100">
						<button
							onClick={() => changeLanguage("en")}
							className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-emerald-600 transition-colors ${i18n.language.startsWith("en") ? "text-emerald-600 font-medium" : "text-slate-600"}`}>
							English
						</button>
						<button
							onClick={() => changeLanguage("zh-CN")}
							className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-emerald-600 transition-colors ${i18n.language === "zh-CN" ? "text-emerald-600 font-medium" : "text-slate-600"}`}>
							简体中文
						</button>
						<button
							onClick={() => changeLanguage("zh-TW")}
							className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-emerald-600 transition-colors ${i18n.language === "zh-TW" ? "text-emerald-600 font-medium" : "text-slate-600"}`}>
							繁體中文
						</button>
						<button
							onClick={() => changeLanguage("ja")}
							className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 hover:text-emerald-600 transition-colors ${i18n.language === "ja" ? "text-emerald-600 font-medium" : "text-slate-600"}`}>
							日本語
						</button>
					</div>
				</div>
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
					<Github className="w-4 h-4" />
					GitHub
				</a>
				<a
					href={RELEASES_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="bg-slate-900 text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2">
					<Download className="w-4 h-4 sm:hidden" />
					<span className="hidden sm:inline">{t("nav.download")}</span>
				</a>
			</div>
		</div>
	</nav>
);

const Footer = ({ t }) => (
	<footer className="py-12 bg-slate-50 border-t border-slate-200">
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4">
			<div>
				<div className="flex items-center gap-2 font-bold justify-center sm:justify-start">
					<Star
						className="w-6 h-6 text-emerald-500 fill-emerald-500"
						strokeWidth={0}
					/>
					<span className="text-slate-900">Anki</span>
					<span className="text-emerald-500">Beam</span>
				</div>
				<p className="text-sm text-slate-500 mt-2">{t("footer.copyright")}</p>
			</div>
			<div className="flex gap-6 text-sm text-slate-500">
				<a
					href={GITHUB_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-emerald-600 transition-colors">
					{t("footer.links.github")}
				</a>
				<a
					href={`${GITHUB_URL}/issues`}
					target="_blank"
					rel="noopener noreferrer"
					className="hover:text-emerald-600 transition-colors">
					{t("footer.links.issues")}
				</a>
				<a
					href={PRIVACY_URL}
					className="hover:text-emerald-600 transition-colors">
					{t("footer.links.privacy")}
				</a>
			</div>
		</div>
	</footer>
);

const PrivacyPage = () => {
	useEffect(() => {
		window.scrollTo(0, 0);
	}, []);

	return (
		<div className="pt-32 pb-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
			<div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-100 shadow-sm prose prose-slate max-w-none">
				<div className="flex items-center gap-2 mb-8 text-sm text-slate-500">
					<a
						href="#"
						className="hover:text-emerald-600 transition-colors flex items-center gap-1">
						<ChevronRight className="w-4 h-4 rotate-180" />
						Back to Home
					</a>
				</div>

				<h1 className="text-3xl font-bold text-slate-900 mb-4">
					Privacy Policy for AnkiBeam
				</h1>
				<p className="text-slate-500 font-medium mb-8">
					Last Updated: January 3, 2026
				</p>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">Overview</h2>
				<p className="text-slate-600 mb-6">
					AnkiBeam is a browser extension that helps users create Anki
					flashcards using AI services. This privacy policy explains how the
					extension handles user data.
				</p>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">
					Data Collection
				</h2>
				<h3 className="text-xl font-semibold text-slate-800 mb-2">
					What We DON'T Collect
				</h3>
				<ul className="list-none pl-0 space-y-2 mb-6">
					<li className="flex items-center gap-2 text-slate-600">
						<span className="text-red-500">❌</span> We do NOT collect any
						personal information
					</li>
					<li className="flex items-center gap-2 text-slate-600">
						<span className="text-red-500">❌</span> We do NOT track your
						browsing activity
					</li>
					<li className="flex items-center gap-2 text-slate-600">
						<span className="text-red-500">❌</span> We do NOT send any data to
						our servers
					</li>
					<li className="flex items-center gap-2 text-slate-600">
						<span className="text-red-500">❌</span> We do NOT use analytics or
						tracking tools
					</li>
				</ul>

				<h3 className="text-xl font-semibold text-slate-800 mb-2">
					What Data Is Stored Locally
				</h3>
				<p className="text-slate-600 mb-4">
					The following data is stored <strong>locally on your device</strong>{" "}
					using Chrome's storage API:
				</p>
				<div className="overflow-x-auto mb-8">
					<table className="min-w-full text-left text-sm whitespace-nowrap">
						<thead className="uppercase tracking-wider border-b-2 border-slate-100 bg-slate-50">
							<tr>
								<th
									scope="col"
									className="px-6 py-3 font-semibold text-slate-700">
									Data Type
								</th>
								<th
									scope="col"
									className="px-6 py-3 font-semibold text-slate-700">
									Purpose
								</th>
								<th
									scope="col"
									className="px-6 py-3 font-semibold text-slate-700">
									Storage Location
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							<tr>
								<td className="px-6 py-4 text-slate-600">API Keys</td>
								<td className="px-6 py-4 text-slate-600">
									To authenticate with AI services you configure
								</td>
								<td className="px-6 py-4 text-slate-600">Local (encrypted)</td>
							</tr>
							<tr>
								<td className="px-6 py-4 text-slate-600">Configuration</td>
								<td className="px-6 py-4 text-slate-600">
									Your preferences and settings
								</td>
								<td className="px-6 py-4 text-slate-600">Local</td>
							</tr>
							<tr>
								<td className="px-6 py-4 text-slate-600">Templates</td>
								<td className="px-6 py-4 text-slate-600">
									Custom parsing templates you create
								</td>
								<td className="px-6 py-4 text-slate-600">Local</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">
					Third-Party Services
				</h2>
				<p className="text-slate-600 mb-2">
					When you use this extension, your input text is sent to the AI service{" "}
					<strong>you have configured</strong>:
				</p>
				<ul className="list-disc pl-5 space-y-1 mb-4 text-slate-600">
					<li>
						<strong>Google Gemini</strong> (if configured): Subject to{" "}
						<a
							href="https://policies.google.com/privacy"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							Google's Privacy Policy
						</a>
					</li>
					<li>
						<strong>OpenAI</strong> (if configured): Subject to{" "}
						<a
							href="https://openai.com/privacy/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							OpenAI's Privacy Policy
						</a>
					</li>
					<li>
						<strong>Anthropic Claude</strong> (if configured): Subject to{" "}
						<a
							href="https://www.anthropic.com/privacy"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							Anthropic's Privacy Policy
						</a>
					</li>
					<li>
						<strong>Groq</strong> (if configured): Subject to{" "}
						<a
							href="https://groq.com/privacy-policy/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							Groq's Privacy Policy
						</a>
					</li>
					<li>
						<strong>DeepSeek</strong> (if configured): Subject to{" "}
						<a
							href="https://www.deepseek.com/privacy"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							DeepSeek's Privacy Policy
						</a>
					</li>
					<li>
						<strong>Zhipu AI</strong> (if configured): Subject to{" "}
						<a
							href="https://open.bigmodel.cn/privacy"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							Zhipu AI's Privacy Policy
						</a>
					</li>
					<li>
						<strong>Alibaba Qwen</strong> (if configured): Subject to{" "}
						<a
							href="https://terms.alicdn.com/legal-agreement/terms/suit_bu1_ali_cloud/suit_bu1_ali_cloud202112071948_78672.html"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							Alibaba Cloud's Privacy Policy
						</a>
					</li>
					<li>
						<strong>Moonshot AI</strong> (if configured): Subject to{" "}
						<a
							href="https://www.moonshot.cn/privacy"
							target="_blank"
							rel="noopener noreferrer"
							className="text-emerald-600 hover:text-emerald-500">
							Moonshot AI's Privacy Policy
						</a>
					</li>
				</ul>
				<p className="text-slate-600 mb-2">
					The extension also communicates with:
				</p>
				<ul className="list-disc pl-5 space-y-1 mb-6 text-slate-600">
					<li>
						<strong>AnkiConnect</strong> (local software): Only communicates
						with Anki running on your local machine (127.0.0.1:8765)
					</li>
				</ul>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">
					Data Security
				</h2>
				<ul className="list-disc pl-5 space-y-1 mb-6 text-slate-600">
					<li>
						All API keys are encrypted using AES-GCM 256-bit encryption before
						storage
					</li>
					<li>
						Data never leaves your device except when explicitly sending queries
						to AI services
					</li>
					<li>No data is transmitted to any servers owned or operated by us</li>
				</ul>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">
					Permissions Explained
				</h2>
				<div className="overflow-x-auto mb-8">
					<table className="min-w-full text-left text-sm whitespace-nowrap">
						<thead className="uppercase tracking-wider border-b-2 border-slate-100 bg-slate-50">
							<tr>
								<th
									scope="col"
									className="px-6 py-3 font-semibold text-slate-700">
									Permission
								</th>
								<th
									scope="col"
									className="px-6 py-3 font-semibold text-slate-700">
									Why It's Needed
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100">
							<tr>
								<td className="px-6 py-4 font-mono text-xs text-slate-600">
									storage
								</td>
								<td className="px-6 py-4 text-slate-600">
									To save your settings and templates locally
								</td>
							</tr>
							<tr>
								<td className="px-6 py-4 font-mono text-xs text-slate-600">
									&lt;all_urls&gt;
								</td>
								<td className="px-6 py-4 text-slate-600">
									To enable the floating assistant on any webpage you visit
								</td>
							</tr>
							<tr>
								<td className="px-6 py-4 font-mono text-xs text-slate-600">
									http://127.0.0.1:8765/*
								</td>
								<td className="px-6 py-4 text-slate-600">
									To communicate with AnkiConnect on your local machine
								</td>
							</tr>
							<tr>
								<td className="px-6 py-4 font-mono text-xs text-slate-600">
									AI Service URLs
								</td>
								<td className="px-6 py-4 text-slate-600">
									To send your text for AI parsing when you request it
								</td>
							</tr>
						</tbody>
					</table>
				</div>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">Your Control</h2>
				<p className="text-slate-600 mb-2">
					You have complete control over your data:
				</p>
				<ul className="list-disc pl-5 space-y-1 mb-6 text-slate-600">
					<li>
						<strong>Delete all data</strong>: Uninstall the extension or clear
						extension data in Chrome settings
					</li>
					<li>
						<strong>View stored data</strong>: Use Chrome DevTools to inspect
						local storage
					</li>
					<li>
						<strong>Disable features</strong>: Turn off the floating assistant
						in extension options
					</li>
				</ul>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">
					Children's Privacy
				</h2>
				<p className="text-slate-600 mb-6">
					This extension is not intended for children under 13. We do not
					knowingly collect data from children.
				</p>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">
					Changes to This Policy
				</h2>
				<p className="text-slate-600 mb-6">
					If we make changes to this privacy policy, we will update the "Last
					Updated" date at the top.
				</p>

				<h2 className="text-2xl font-bold text-slate-900 mb-4">Contact</h2>
				<p className="text-slate-600 mb-2">
					For privacy-related questions, please open an issue on our GitHub
					repository:
				</p>
				<p>
					<a
						href="https://github.com/novahoo13/ankibeam/issues"
						className="text-emerald-600 hover:text-emerald-500">
						https://github.com/novahoo13/ankibeam/issues
					</a>
				</p>
			</div>
		</div>
	);
};

const HomePage = ({ t }) => (
	<>
		<section className="relative pt-32 pb-20 overflow-hidden">
			<div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[800px] h-[800px] bg-emerald-100/40 rounded-full blur-3xl -z-10" />
			<div className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-3xl -z-10" />

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="grid lg:grid-cols-2 gap-12 items-center">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6 }}
						className="space-y-8 text-center lg:text-left">
						<div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-sm font-medium shadow-sm">
							<Chrome className="w-4 h-4 text-emerald-500" />
							{t("hero.badge")}
						</div>

						<h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-slate-900 leading-[1.1]">
							{t("hero.title_start")}{" "}
							<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500">
								{t("hero.title_highlight")}
							</span>{" "}
							<br />
							{t("hero.title_end")}
						</h1>

						<p className="text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">
							{t("hero.subtitle")}
						</p>

						<div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4">
							<a
								href={RELEASES_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5">
								<Chrome className="w-5 h-5" />
								{t("hero.cta")}
							</a>
							<a
								href={GITHUB_URL}
								target="_blank"
								rel="noopener noreferrer"
								className="w-full sm:w-auto px-8 py-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-sm">
								<Github className="w-5 h-5" />
								{t("hero.demo")}
							</a>
						</div>

						<div className="pt-6 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 sm:gap-6 text-sm text-slate-500 font-medium">
							<span className="flex items-center gap-1.5">
								<Check className="w-4 h-4 text-emerald-500" />{" "}
								{t("hero.features_free")}
							</span>
							<span className="flex items-center gap-1.5">
								<Check className="w-4 h-4 text-emerald-500" />{" "}
								{t("hero.features_no_login")}
							</span>
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, x: 20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.8, delay: 0.2 }}
						className="relative hidden lg:block">
						<FloatingBadge
							icon={Sparkles}
							text={t("mockup.ai_analysis")}
							delay={0.8}
							className="top-4 right-8"
						/>
						<FloatingBadge
							icon={BookOpen}
							text={t("mockup.anki_sync")}
							delay={1.0}
							className="top-1/4 -left-8"
						/>

						<MockupWindow className="w-full h-[500px] shadow-2xl relative z-10 bg-slate-50/50">
							<div className="h-12 bg-white border-b border-slate-100 flex items-center px-6">
								<div className="h-2 w-24 bg-slate-200 rounded-full" />
							</div>
							<div className="p-8 space-y-6 opacity-30 pointer-events-none select-none filter blur-[1px]">
								<div className="h-8 w-3/4 bg-slate-300 rounded mb-8" />
								<div className="space-y-3">
									<div className="h-4 w-full bg-slate-200 rounded" />
									<div className="h-4 w-5/6 bg-slate-200 rounded" />
									<div className="h-4 w-full bg-slate-200 rounded" />
								</div>
								<div className="grid grid-cols-3 gap-4 pt-4">
									<div className="h-32 bg-slate-200 rounded" />
									<div className="h-32 bg-slate-200 rounded" />
									<div className="h-32 bg-slate-200 rounded" />
								</div>
							</div>

							<motion.div
								initial={{ scale: 0.9, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ delay: 0.5 }}
								className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-white rounded-2xl shadow-glow border border-emerald-100/50 p-5 flex flex-col gap-4">
								<div className="flex items-start justify-between">
									<div>
										<h3 className="text-lg font-bold text-slate-900">
											{t("mockup.word")}
										</h3>
										<p className="text-xs text-slate-400 font-mono">
											{t("mockup.pronunciation")}
										</p>
									</div>
									<div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
										<Star
											className="w-4 h-4 fill-emerald-600 text-emerald-600"
											strokeWidth={0}
										/>
									</div>
								</div>
								<div className="space-y-2">
									<div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 leading-relaxed border border-slate-100">
										<span className="font-semibold text-slate-900">
											{t("mockup.pos")}
										</span>{" "}
										{t("mockup.definition")}
									</div>
								</div>
								<button className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20">
									{t("mockup.add_button")}
								</button>
							</motion.div>
						</MockupWindow>
					</motion.div>
				</div>
			</div>
		</section>

		<section className="py-24 bg-white" id="how-it-works">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="text-center mb-16 max-w-2xl mx-auto">
					<h2 className="text-3xl font-bold text-slate-900">
						{t("how.title")}
					</h2>
					<p className="mt-4 text-slate-500">{t("how.desc")}</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 relative">
					<div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-px bg-gradient-to-r from-emerald-200 via-emerald-300 to-emerald-200" />

					<StepCard
						number={1}
						icon={MousePointerClick}
						title={t("how.step1_title")}
						desc={t("how.step1_desc")}
						delay={0}
					/>
					<StepCard
						number={2}
						icon={Brain}
						title={t("how.step2_title")}
						desc={t("how.step2_desc")}
						delay={0.15}
					/>
					<StepCard
						number={3}
						icon={BookOpen}
						title={t("how.step3_title")}
						desc={t("how.step3_desc")}
						delay={0.3}
					/>
				</div>
			</div>
		</section>

		<section className="py-24 bg-slate-50" id="features">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="text-center mb-16 max-w-2xl mx-auto">
					<h2 className="text-3xl font-bold text-slate-900">
						{t("features.ai.title")}
					</h2>
					<p className="mt-4 text-slate-500">{t("features.ai.desc")}</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(280px,auto)]">
					<div className="md:col-span-2 bg-white rounded-3xl p-8 border border-slate-100 relative overflow-hidden group hover:shadow-lg transition-all duration-500 flex flex-col justify-between">
						<div className="z-10 relative">
							<div className="w-12 h-12 bg-emerald-50 rounded-2xl shadow-sm border border-emerald-100/50 flex items-center justify-center text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
								<MousePointer2 className="w-6 h-6" />
							</div>
							<h3 className="text-2xl font-bold text-slate-900">
								{t("features.float.title")}
							</h3>
							<p className="mt-2 text-slate-500 max-w-[280px]">
								{t("features.float.desc")}
							</p>
						</div>

						<div className="absolute bottom-0 right-0 w-3/5 h-4/5 bg-slate-50 rounded-tl-3xl shadow-soft border-t border-l border-slate-100 p-6 translate-x-4 translate-y-4 group-hover:translate-x-2 group-hover:translate-y-2 transition-transform">
							<div className="space-y-3">
								<div className="h-2 w-2/3 bg-slate-100 rounded-full" />
								<div className="h-2 w-full bg-slate-100 rounded-full" />
								<div className="flex gap-2 mt-4">
									<span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded font-medium">
										{t("features.float.badge_select")}
									</span>
									<span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded font-medium">
										{t("features.float.badge_analyze")}
									</span>
									<span className="px-2 py-1 bg-amber-50 text-amber-600 text-xs rounded font-medium">
										{t("features.float.badge_save")}
									</span>
								</div>
							</div>
						</div>
					</div>

					<div className="bg-slate-900 rounded-3xl p-8 border border-white/5 relative overflow-hidden text-white flex flex-col justify-between group">
						<div className="absolute top-0 right-0 p-32 bg-emerald-500/20 blur-[80px] rounded-full pointer-events-none" />

						<div>
							<div className="w-12 h-12 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mb-6">
								<Globe className="w-6 h-6" />
							</div>
							<h3 className="text-xl font-bold">{t("features.multi.title")}</h3>
							<p className="mt-2 text-slate-400 text-sm">
								{t("features.multi.desc")}
							</p>
						</div>

						<div className="space-y-3 mt-6">
							<div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
								<div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
								<span className="font-medium text-sm flex-1 text-slate-300">
									{t("features.multi.provider_primary")}
								</span>
							</div>
							<div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
								<div className="w-2 h-2 rounded-full bg-slate-500" />
								<span className="font-medium text-sm flex-1 text-slate-400">
									{t("features.multi.provider_backup")}
								</span>
							</div>
							<div className="flex items-center gap-2 mt-3 px-1">
								<RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
								<span className="text-xs text-emerald-400 font-medium">
									{t("features.multi.failover")}
								</span>
							</div>
						</div>
					</div>

					<div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-8 text-white relative flex flex-col justify-between overflow-hidden">
						<div>
							<div className="w-12 h-12 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mb-6">
								<Layout className="w-6 h-6" />
							</div>
							<h3 className="text-xl font-bold">
								{t("features.templates.title")}
							</h3>
							<p className="mt-2 text-emerald-50 text-sm opacity-90">
								{t("features.templates.desc")}
							</p>
						</div>
						<div className="mt-6 p-4 bg-white/10 rounded-xl border border-white/10 backdrop-blur-sm space-y-2">
							<div className="flex justify-between text-xs font-mono opacity-90">
								<span className="text-emerald-100">Word</span>
								<span>{"{{Expression}}"}</span>
							</div>
							<div className="h-px bg-white/20 w-full" />
							<div className="flex justify-between text-xs font-mono opacity-90">
								<span className="text-emerald-100">Reading</span>
								<span>{"{{Pronunciation}}"}</span>
							</div>
							<div className="h-px bg-white/20 w-full" />
							<div className="flex justify-between text-xs font-mono opacity-90">
								<span className="text-emerald-100">Meaning</span>
								<span>{"{{Definition}}"}</span>
							</div>
							<div className="h-px bg-white/20 w-full" />
							<div className="flex justify-between text-xs font-mono opacity-90">
								<span className="text-emerald-100">Example</span>
								<span>{"{{Sentence}}"}</span>
							</div>
							<div className="h-px bg-white/20 w-full" />
							<div className="flex justify-between text-xs font-mono opacity-90">
								<span className="text-emerald-100">Etymology</span>
								<span>{"{{Origin}}"}</span>
							</div>
						</div>
					</div>

					<div className="md:col-span-2 bg-white rounded-3xl p-8 border border-slate-100 group hover:border-emerald-200 transition-colors flex flex-col justify-center">
						<h3 className="text-xl font-bold text-slate-900 mb-8">
							{t("features.privacy.title")}
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
							<div className="flex flex-col items-center text-center gap-3">
								<div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
									<Lock className="w-6 h-6" />
								</div>
								<div>
									<h4 className="font-semibold text-slate-900 text-sm">
										{t("features.privacy.privacy_local")}
									</h4>
									<p className="text-slate-500 text-sm mt-1.5">
										{t("features.privacy.privacy_local_desc")}
									</p>
								</div>
							</div>
							<div className="flex flex-col items-center text-center gap-3">
								<div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
									<Eye className="w-6 h-6" />
								</div>
								<div>
									<h4 className="font-semibold text-slate-900 text-sm">
										{t("features.privacy.privacy_no_data")}
									</h4>
									<p className="text-slate-500 text-sm mt-1.5">
										{t("features.privacy.privacy_no_data_desc")}
									</p>
								</div>
							</div>
							<div className="flex flex-col items-center text-center gap-3">
								<div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
									<Code className="w-6 h-6" />
								</div>
								<div>
									<h4 className="font-semibold text-slate-900 text-sm">
										{t("features.privacy.privacy_open")}
									</h4>
									<p className="text-slate-500 text-sm mt-1.5">
										{t("features.privacy.privacy_open_desc")}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section className="py-24 bg-white" id="getting-started">
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div className="text-center mb-16 max-w-2xl mx-auto">
					<h2 className="text-3xl font-bold text-slate-900">
						{t("getting_started.title")}
					</h2>
					<p className="mt-4 text-slate-500">{t("getting_started.desc")}</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0 }}
						className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
						<div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-sm mb-4">
							1
						</div>
						<h3 className="font-bold text-slate-900 mb-2">
							{t("getting_started.step1_title")}
						</h3>
						<p className="text-slate-500 text-sm flex-1">
							{t("getting_started.step1_desc")}
						</p>
						<a
							href={ANKI_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-4 text-emerald-600 text-sm font-medium flex items-center gap-1 hover:text-emerald-700 transition-colors">
							{t("getting_started.step1_link")}
							<ChevronRight className="w-4 h-4" />
						</a>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0.1 }}
						className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
						<div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-sm mb-4">
							2
						</div>
						<h3 className="font-bold text-slate-900 mb-2">
							{t("getting_started.step2_title")}
						</h3>
						<p className="text-slate-500 text-sm flex-1">
							{t("getting_started.step2_desc")}
						</p>
						<div className="mt-4 px-3 py-2 bg-slate-900 text-emerald-400 rounded-lg font-mono text-sm text-center select-all">
							{t("getting_started.step2_code")}
						</div>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true }}
						transition={{ delay: 0.2 }}
						className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
						<div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold text-sm mb-4">
							3
						</div>
						<h3 className="font-bold text-slate-900 mb-2">
							{t("getting_started.step3_title")}
						</h3>
						<p className="text-slate-500 text-sm flex-1">
							{t("getting_started.step3_desc")}
						</p>
						<a
							href={RELEASES_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="mt-4 text-emerald-600 text-sm font-medium flex items-center gap-1 hover:text-emerald-700 transition-colors">
							{t("getting_started.step3_link")}
							<ChevronRight className="w-4 h-4" />
						</a>
					</motion.div>
				</div>
			</div>
		</section>

		<section className="py-24 bg-slate-900 relative overflow-hidden">
			<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true }}
					className="space-y-8">
					<h2 className="text-3xl sm:text-4xl font-bold text-white">
						{t("cta.title")}
					</h2>
					<p className="text-slate-400 text-lg max-w-xl mx-auto">
						{t("cta.desc")}
					</p>
					<a
						href={RELEASES_URL}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold transition-all shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5">
						<Chrome className="w-5 h-5" />
						{t("cta.button")}
					</a>
				</motion.div>
			</div>
		</section>
	</>
);

function App() {
	const { t, i18n } = useTranslation();
	const [scrolled, setScrolled] = useState(false);
	const [route, setRoute] = useState(window.location.hash);

	useEffect(() => {
		const handleScroll = () => setScrolled(window.scrollY > 20);
		const handleHashChange = () => setRoute(window.location.hash);

		window.addEventListener("scroll", handleScroll);
		window.addEventListener("hashchange", handleHashChange);
		// Initial check
		handleHashChange();

		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("hashchange", handleHashChange);
		};
	}, []);

	const changeLanguage = (lng) => i18n.changeLanguage(lng);

	return (
		<div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-emerald-500/20 selection:text-emerald-900">
			<Navbar
				scrolled={scrolled}
				t={t}
				i18n={i18n}
				changeLanguage={changeLanguage}
			/>

			{route === "#privacy" ? <PrivacyPage /> : <HomePage t={t} />}

			<Footer t={t} />
		</div>
	);
}

export default App;
