import { ThemeProvider } from "next-themes";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import { baseMetaData } from "./metadata";
import { BotIdClient } from "botid/client";
import { webEnv } from "@opencut/env/web";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/i18n/locales";

const siteFont = Inter({ subsets: ["latin"] });

export const metadata = baseMetaData;

const protectedRoutes = [
	{
		path: "/none",
		method: "GET",
	},
];

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const cookieStore = await cookies();
	const initialLocale = normalizeLocale(
		cookieStore.get(LOCALE_COOKIE_NAME)?.value,
	);

	return (
		<html lang={initialLocale} suppressHydrationWarning>
			<head>
				<BotIdClient protect={protectedRoutes} />
				{process.env.NODE_ENV === "development" && (
					<Script
						src="//unpkg.com/react-scan/dist/auto.global.js"
						crossOrigin="anonymous"
						strategy="beforeInteractive"
					/>
				)}
			</head>
			<body className={`${siteFont.className} font-sans antialiased`}>
				<I18nProvider initialLocale={initialLocale}>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						disableTransitionOnChange={true}
					>
						<TooltipProvider>
							<Toaster />
							<Script
								src="https://cdn.databuddy.cc/databuddy.js"
								strategy="afterInteractive"
								async
								data-client-id="UP-Wcoy5arxFeK7oyjMMZ"
								data-disabled={webEnv.NODE_ENV === "development"}
								data-track-attributes={false}
								data-track-errors={true}
								data-track-outgoing-links={false}
								data-track-web-vitals={false}
								data-track-sessions={false}
							/>
							{children}
						</TooltipProvider>
					</ThemeProvider>
				</I18nProvider>
			</body>
		</html>
	);
}
