// MZGKiM fixtures for the unit tests (lib/sources/mzgkim/*.test.ts,
// lib/zuk-cron.test.ts): its real komunikaty feed and posts, fetched on
// 26 Oct 2026, verbatim. A fixture, so code (scripts/check-tracked-data.mjs).

import { DISTRICTS } from "./districts-seed.ts";
import { pageText, parseFeed } from "./sources/mzgkim/fetch.ts";
import type { ZukPost } from "./zuk.ts";
import type { AiItem, AiResult } from "./zuk-ai.ts";
import { AI_ITEM } from "./zuk-fixture.ts";
import { ZUK_PLACES } from "./zuk-places.generated.ts";
import type { ZukPlaces } from "./zuk-resolve.ts";

/** Our places as the cron reads them: the TERYT snapshot and the gazetteer. */
export const MZGKIM_PLACES: ZukPlaces = { ...ZUK_PLACES, districts: DISTRICTS };

/**
 * Real: GET https://mzgkim.lubaczow.pl/category/komunikaty/feed/ on 26 Oct
 * 2026 at 16:10 UTC, body verbatim (10 posts, newest 2 Oct 2026: two water
 * cuts, deratyzacja, PSZOK, opening hours, holidays).
 */
export const FEED_2026_10_26 =
  '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"\n\txmlns:content="http://purl.org/rss/1.0/modules/content/"\n\txmlns:wfw="http://wellformedweb.org/CommentAPI/"\n\txmlns:dc="http://purl.org/dc/elements/1.1/"\n\txmlns:atom="http://www.w3.org/2005/Atom"\n\txmlns:sy="http://purl.org/rss/1.0/modules/syndication/"\n\txmlns:slash="http://purl.org/rss/1.0/modules/slash/"\n\t>\n\n<channel>\n\t<title>Komunikaty &#8211; Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie</title>\n\t<atom:link href="https://mzgkim.lubaczow.pl/category/komunikaty/feed/" rel="self" type="application/rss+xml" />\n\t<link>https://mzgkim.lubaczow.pl</link>\n\t<description></description>\n\t<lastBuildDate>Fri, 02 Oct 2026 10:11:39 +0000</lastBuildDate>\n\t<language>pl-PL</language>\n\t<sy:updatePeriod>\n\thourly\t</sy:updatePeriod>\n\t<sy:updateFrequency>\n\t1\t</sy:updateFrequency>\n\t<generator>https://wordpress.org/?v=7.1.3</generator>\n\t<item>\n\t\t<title>Przerwa w dostawie wody</title>\n\t\t<link>https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Fri, 02 Oct 2026 10:11:39 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<category><![CDATA[przerwa techniczna]]></category>\n\t\t<category><![CDATA[przerwa w dostawie wody]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5237</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 6 października (WTOREK) w godzinach 08.30 &#8211; 15.00 nastąpi przerwa w dostawie wody przy ulicach: Sobieskiego Niemirowskiej Starzyny Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej Osiedle Mazury Przerwa spowodowana jest koniecznością przeprowadzenia prac przyłączeniowych.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>KOMUNIKAT!</title>\n\t\t<link>https://mzgkim.lubaczow.pl/komunikat-4/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Mon, 21 Sep 2026 07:16:47 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5234</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie informuje, że od dnia 21.09.2026 na terenach zieleni płyty Rynku prowadzona jest akcja deratyzacyjna. W związku z tym prosi się o zachowanie szczególnej ostrożności, wzmożenie opieki nad dziećmi i nie wyprowadzanie zwierząt na tereny obsadzone zielenią. Zakończenie akcji deratyzacyjnej planowane jest na dzień 12 października br.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Informacja</title>\n\t\t<link>https://mzgkim.lubaczow.pl/informacja-17/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Thu, 27 Aug 2026 12:39:06 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5221</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w sobotę 29 sierpnia 2026 r., Punkt Selektywnej Zbiórki Odpadów Komunalnych (PSZOK) przy ul. Inżynierskiej 12 &#8211; będzie nieczynny. Za utrudnienia przepraszamy.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Informacja</title>\n\t\t<link>https://mzgkim.lubaczow.pl/informacja-16/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Wed, 05 Aug 2026 07:31:16 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5174</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie informuje, że w związku z panującymi wysokimi temperaturami w dniach 5–6 sierpnia Zakład będzie czynny w godzinach 7:00–14:00. Za zaistniałe utrudnienia przepraszamy i dziękujemy za wyrozumiałość.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Ogłoszenie</title>\n\t\t<link>https://mzgkim.lubaczow.pl/ogloszenie-10/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Tue, 21 Jul 2026 09:01:19 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5150</guid>\n\n\t\t\t\t\t<description><![CDATA[]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Informacja</title>\n\t\t<link>https://mzgkim.lubaczow.pl/informacja-15/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Tue, 02 Jun 2026 11:34:35 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5113</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w sobotę 6 czerwca 2026 r., Punkt Selektywnej Zbiórki Odpadów Komunalnych (PSZOK) przy ul. Inżynierskiej 12 &#8211; będzie nieczynny. Za utrudnienia przepraszamy.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Przerwa w dostawie wody</title>\n\t\t<link>https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-99/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Mon, 01 Jun 2026 06:35:52 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[przerwy w dostawie wody]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5108</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 2 czerwca w godzinach 08.30 &#8211; 13.00 nastąpi przerwa w dostawie wody przy ulicach: Sobieskiego (od siedziby Straży Pożarnej w kierunku Dąbrowy) Niemirowskiej Starzyny Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Informacja</title>\n\t\t<link>https://mzgkim.lubaczow.pl/informacja-14/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Wed, 29 Apr 2026 06:05:10 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5079</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że 2 maja (sobota), Punkt Selektywnej Zbiórki Odpadów Komunalnych (PSZOK) przy ul. Inżynierskiej 12 &#8211; będzie nieczynny. Za utrudnienia przepraszamy.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Wesołych Świąt Wielkanocnych</title>\n\t\t<link>https://mzgkim.lubaczow.pl/wesolych-swiat-wielkanocnych/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Fri, 03 Apr 2026 10:24:57 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5061</guid>\n\n\t\t\t\t\t<description><![CDATA[]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t\t<item>\n\t\t<title>Zmiana godzin pracy MZGKIM w Wielki Piątek 3.04.2026</title>\n\t\t<link>https://mzgkim.lubaczow.pl/zmiana-godzin-pracy-mzgkim-w-wielki-piatek-3-04-2026/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Thu, 02 Apr 2026 09:02:25 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=5047</guid>\n\n\t\t\t\t\t<description><![CDATA[Uprzejmie informujemy, że dnia 03.04.2026 (Wielki Piątek) zakład czynny będzie od godziny 7:00 do 12:30, natomiast kasa zakładu otwarta będzie do godziny 11:30]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n\t</channel>\n</rss>\n';

/**
 * Real: the item of post 4935 (13 Nov 2025, the whole town at night) from
 * the feed's page 2 (…/feed/?paged=2), verbatim.
 */
const ITEM_4935 =
  '\t<item>\n\t\t<title>Przerwa w dostawie wody</title>\n\t\t<link>https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-98/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Thu, 13 Nov 2025 12:38:17 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=4935</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w nocy z 14 na 15 listopada (z piątku na sobotę) w godzinach: 23.00 – 03.00 nastąpi przerwa w dostawie wody na terenie całego miasta.Przerwa spowodowana jest koniecznością przeprowadzenia prac konserwacyjnych na hydroforni miejskiej.Przepraszamy za utrudnienia i prosimy o wyrozumiałość.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n';

/**
 * Real: the items of posts 4799 (7 Jul 2025, "Mazury wraz z osiedlem") and
 * 4744 (13 May 2025, "Cicha" before "ul. Młodowska") from the feed's page
 * 3 (…/feed/?paged=3, GET on 26 Oct 2026), verbatim (task 151).
 */
const ITEM_4799 =
  '\t<item>\n\t\t<title>Przerwa w dostawie wody</title>\n\t\t<link>https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-96/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Mon, 07 Jul 2025 07:20:06 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=4799</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 08 lipca (wtorek) w godzinach 09.00 &#8211; 12.00 nastąpi przerwa w dostawie wody przy ulicach: Przerwa spowodowana jest koniecznością przeprowadzenia prac konserwacyjnych.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n';
const ITEM_4744 =
  '\t<item>\n\t\t<title>Przerwa w dostawie wody</title>\n\t\t<link>https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-95/</link>\n\t\t\n\t\t<dc:creator><![CDATA[Łukasz Baran]]></dc:creator>\n\t\t<pubDate>Tue, 13 May 2025 08:14:03 +0000</pubDate>\n\t\t\t\t<category><![CDATA[Komunikaty]]></category>\n\t\t<category><![CDATA[Komunikat]]></category>\n\t\t<guid isPermaLink="false">https://mzgkim.lubaczow.pl/?p=4744</guid>\n\n\t\t\t\t\t<description><![CDATA[Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 14 maja w godzinach 08.30 &#8211; 12.00 nastąpi przerwa w dostawie wody przy ulicach: Kościuszki – od numeru 229 (nieparzyste) oraz numeru 168 (parzyste) w stronę Młodowa, Myśliwskiej, Grzybowej, Żelichówka, Walecznych, Cicha, ul. Młodowska (Młodów). Przerwa spowodowana jest koniecznością przeprowadzenia prac przyłączeniowych.]]></description>\n\t\t\n\t\t\n\t\t\n\t\t\t</item>\n';

const OLDER: Record<number, string> = {
  4935: ITEM_4935,
  4799: ITEM_4799,
  4744: ITEM_4744,
};

/** The feed as one page holding `items` (the channel's head and tail kept). */
export function feedWith(items: string[]): string {
  const head = FEED_2026_10_26.slice(0, FEED_2026_10_26.indexOf("\t<item>"));
  return `${head}${items.join("")}\t</channel>\n</rss>\n`;
}

/** Each real item of the feed, by its post id (the guid's ?p=). */
export function feedItem(id: number): string {
  if (OLDER[id]) return OLDER[id];
  const item = FEED_2026_10_26.split("\t<item>")
    .slice(1)
    .map((body) => `\t<item>${body.slice(0, body.indexOf("</item>"))}</item>\n`)
    .find((body) => body.includes(`?p=${id}<`));
  if (!item) throw new Error(`no real item ${id}`);
  return item;
}

// Real: each post's page, GET on 26 Oct 2026, from <article> to the end of
// its date line, verbatim (the rest of the page is the theme's).
const PAGES: Record<string, string> = {
  "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-100/":
    '<article id="post-5237" class="single_post post-5237 post type-post status-publish format-standard hentry category-komunikaty tag-komunikat tag-przerwa-techniczna tag-przerwa-w-dostawie-wody">\n\n    <header class="entry-header">     \n    <h2 class="entry-title"><span>Przerwa w dostawie wody</span></h2> \n    </header><!-- .entry-header -->\t\n        \t\n    <div class="entry-content">\n        \n<p>Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 6 października (WTOREK) w godzinach 08.30 &#8211; 15.00 nastąpi przerwa w dostawie wody przy ulicach:</p>\n<ul>\n<li>Sobieskiego</li>\n<li>Niemirowskiej</li>\n<li>Starzyny</li>\n<li>Osiedle domów jednorodzinnych na zapleczu</li>\n<li>ul. Niemirowskiej</li>\n<li>Osiedle Mazury</li>\n</ul>\n<p>Przerwa spowodowana jest koniecznością przeprowadzenia prac przyłączeniowych.</p>\n\n        <div class="entry-meta single-meta">\n            <p><span class="byline"> Autor: <span class="author vcard"><a class="url fn n" href="https://mzgkim.lubaczow.pl/author/l-baran/">Łukasz Baran</a></span></span><span class="posted-on-text screen-reader-text">Opublikowano w dniu</span> <span class="posted-on"><time class="entry-date published updated" datetime="2026-10-02T12:11:39+02:00">2 października 2026</time></span></p>',
  "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-99/":
    '<article id="post-5108" class="single_post post-5108 post type-post status-publish format-standard hentry category-komunikaty tag-przerwy-w-dostawie-wody">\n\n    <header class="entry-header">     \n    <h2 class="entry-title"><span>Przerwa w dostawie wody</span></h2> \n    </header><!-- .entry-header -->\t\n        \t\n    <div class="entry-content">\n        \n<p class="wp-block-paragraph">Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu 2 czerwca w godzinach 08.30 &#8211; 13.00 nastąpi przerwa w dostawie wody przy ulicach:</p>\n\n\n\n<p class="wp-block-paragraph">Sobieskiego (od siedziby Straży Pożarnej w kierunku Dąbrowy)</p>\n\n\n\n<p class="wp-block-paragraph">Niemirowskiej</p>\n\n\n\n<p class="wp-block-paragraph">Starzyny</p>\n\n\n\n<p class="wp-block-paragraph">Osiedle domów jednorodzinnych na zapleczu</p>\n\n\n\n<p class="wp-block-paragraph">ul. Niemirowskiej</p>\n\n\n\n        <div class="entry-meta single-meta">\n            <p><span class="byline"> Autor: <span class="author vcard"><a class="url fn n" href="https://mzgkim.lubaczow.pl/author/l-baran/">Łukasz Baran</a></span></span><span class="posted-on-text screen-reader-text">Opublikowano w dniu</span> <span class="posted-on"><time class="entry-date published" datetime="2026-06-01T08:35:52+02:00">1 czerwca 2026</time></span></p>',
  "https://mzgkim.lubaczow.pl/komunikat-4/":
    '<article id="post-5234" class="single_post post-5234 post type-post status-publish format-standard hentry category-komunikaty">\n\n    <header class="entry-header">     \n    <h2 class="entry-title"><span>KOMUNIKAT!</span></h2> \n    </header><!-- .entry-header -->\t\n        \t\n    <div class="entry-content">\n        \n<p>Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej w Lubaczowie informuje, że od dnia 21.09.2026 na terenach zieleni płyty Rynku prowadzona jest akcja deratyzacyjna. W związku z tym prosi się o zachowanie szczególnej ostrożności, wzmożenie opieki nad dziećmi i nie wyprowadzanie zwierząt na tereny obsadzone zielenią. Zakończenie akcji deratyzacyjnej planowane jest na dzień 12 października br.</p>\n\n\n\n        <div class="entry-meta single-meta">\n            <p><span class="byline"> Autor: <span class="author vcard"><a class="url fn n" href="https://mzgkim.lubaczow.pl/author/l-baran/">Łukasz Baran</a></span></span><span class="posted-on-text screen-reader-text">Opublikowano w dniu</span> <span class="posted-on"><time class="entry-date published updated" datetime="2026-09-21T09:16:47+02:00">21 września 2026</time></span></p>',
  "https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-98/":
    '<article id="post-4935" class="single_post post-4935 post type-post status-publish format-standard hentry category-komunikaty tag-komunikat">\n\n    <header class="entry-header">     \n    <h2 class="entry-title"><span>Przerwa w dostawie wody</span></h2> \n    </header><!-- .entry-header -->\t\n        \t\n    <div class="entry-content">\n        \n<p class="wp-block-paragraph">Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w nocy z 14 na 15 listopada (z piątku na sobotę) w godzinach: 23.00 – 03.00 nastąpi przerwa w dostawie wody na terenie całego miasta.<br>Przerwa spowodowana jest koniecznością przeprowadzenia prac konserwacyjnych na hydroforni miejskiej.<br>Przepraszamy za utrudnienia i prosimy o wyrozumiałość.</p>\n\n\n\n        <div class="entry-meta single-meta">\n            <p><span class="byline"> Autor: <span class="author vcard"><a class="url fn n" href="https://mzgkim.lubaczow.pl/author/l-baran/">Łukasz Baran</a></span></span><span class="posted-on-text screen-reader-text">Opublikowano w dniu</span> <span class="posted-on"><time class="entry-date published updated" datetime="2025-11-13T14:38:17+02:00">13 listopada 2025</time></span></p>',
};

// Real: the pages of 4799 and 4744, GET on 26 Oct 2026, the same cut
// (task 151).
PAGES["https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-96/"] =
  '<article id="post-4799" class="single_post post-4799 post type-post status-publish format-standard hentry category-komunikaty tag-komunikat">\n\n    <header class="entry-header">     \n    <h2 class="entry-title"><span>Przerwa w dostawie wody</span></h2> \n    </header><!-- .entry-header -->\t\n        \t\n    <div class="entry-content">\n        \n<p class="wp-block-paragraph">Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu <strong>0</strong><strong>8</strong> <strong>lipca </strong><strong>(wtorek)</strong> <strong>w </strong><strong>godzin</strong><strong>ach</strong> <strong>0</strong><strong>9</strong><strong>.</strong><strong>0</strong><strong>0 &#8211; </strong><strong>1</strong><strong>2</strong><strong>.</strong><strong>0</strong><strong>0 </strong>nastąpi przerwa w dostawie wody przy ulicach:</p>\n\n\n\n<ul class="wp-block-list">\n<li>Sobieskiego</li>\n\n\n\n<li>Niemirowska wraz z osiedlem</li>\n\n\n\n<li>Mazury wraz z osiedlem</li>\n\n\n\n<li>Sudel, Sosnowa</li>\n</ul>\n\n\n\n<p class="wp-block-paragraph">Przerwa spowodowana jest koniecznością przeprowadzenia prac konserwacyjnych.</p>\n\n\n\n        <div class="entry-meta single-meta">\n            <p><span class="byline"> Autor: <span class="author vcard"><a class="url fn n" href="https://mzgkim.lubaczow.pl/author/l-baran/">Łukasz Baran</a></span></span><span class="posted-on-text screen-reader-text">Opublikowano w dniu</span> <span class="posted-on"><time class="entry-date published updated" datetime="2025-07-07T09:20:06+02:00">7 lipca 2025</time></span></p>';
PAGES["https://mzgkim.lubaczow.pl/przerwa-w-dostawie-wody-95/"] =
  '<article id="post-4744" class="single_post post-4744 post type-post status-publish format-standard hentry category-komunikaty tag-komunikat">\n\n    <header class="entry-header">     \n    <h2 class="entry-title"><span>Przerwa w dostawie wody</span></h2> \n    </header><!-- .entry-header -->\t\n        \t\n    <div class="entry-content">\n        \n<p>Miejski Zakład Gospodarki Komunalnej i Mieszkaniowej informuje, że w dniu <strong>14 maja w godzinach</strong> <strong>08.30 &#8211; 12.00 </strong>nastąpi przerwa w dostawie wody przy ulicach:</p>\n<ul>\n<li><strong>Kościuszki – od numeru 229 (nieparzyste) oraz numeru 168 (parzyste) w stronę Młodowa, </strong></li>\n<li><strong>Myśliwskiej, Grzybowej, Żelichówka, Walecznych, Cicha, </strong></li>\n<li><strong>ul. Młodowska (Młodów).</strong></li>\n</ul>\n<p>Przerwa spowodowana jest koniecznością przeprowadzenia prac przyłączeniowych.</p>\n\n        <div class="entry-meta single-meta">\n            <p><span class="byline"> Autor: <span class="author vcard"><a class="url fn n" href="https://mzgkim.lubaczow.pl/author/l-baran/">Łukasz Baran</a></span></span><span class="posted-on-text screen-reader-text">Opublikowano w dniu</span> <span class="posted-on"><time class="entry-date published" datetime="2025-05-13T10:14:03+02:00">13 maja 2025</time></span></p>';

/** A real post's page as the site serves it: the theme around the article. */
export function realPage(url: string): string | undefined {
  const article = PAGES[url];
  return (
    article &&
    `<!DOCTYPE html><html lang="pl-PL"><body><main id="main">${article}</div></article></main></body></html>`
  );
}

/** Post ids: the cuts of 2 Oct and 1 Jun 2026, deratyzacja, the whole town. */
export const CUT_100 = 5237;
export const CUT_99 = 5108;
export const DERATYZACJA = 5234;
export const WHOLE_TOWN = 4935;
/** 8 Jul 2025: "Mazury wraz z osiedlem"; 14 May 2025: "Cicha" before "ul. Młodowska". */
export const WITH_ESTATE = 4799;
export const CICHA = 4744;

const street = (
  date: string,
  start: string,
  end: string,
  name: string,
  verbatim: string,
  note: string | null = null,
): AiItem => ({
  date,
  start,
  end,
  locality: "Lubaczów",
  locality_verbatim: null,
  street: name,
  street_verbatim: verbatim,
  note,
  kind: "planned",
  ...AI_ITEM,
});

const OSIEDLE = "Osiedle domów jednorodzinnych na zapleczu ul. Niemirowskiej";

/** A district of the gazetteer as the prompt asks for it: by its name. */
const district = (
  date: string,
  start: string,
  end: string,
  name: string,
  verbatim: string,
) => street(date, start, end, name, verbatim);

/**
 * The model's reading of each real post, as the prompt asks for it
 * (lib/water-prompt.ts, the town never named): written by hand for the
 * tests, never a real call. 5237: three streets, a district with no
 * streets known, Osiedle Mazury of the gazetteer; 5108: Sobieskiego only in
 * part; 4935: the whole town, at night, in its words; 4799: each "X wraz z
 * osiedlem" the street and the district; 4744: a street before "ul.
 * Młodowska"; 5234 (deratyzacja): not water.
 */
export const MZGKIM_READINGS: Record<number, AiResult> = {
  [CUT_100]: {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      street(
        "2026-10-06",
        "08:30",
        "15:00",
        "Jana III Sobieskiego",
        "Sobieskiego",
      ),
      street("2026-10-06", "08:30", "15:00", "Niemirowska", "Niemirowskiej"),
      street("2026-10-06", "08:30", "15:00", "Starzyny", "Starzyny"),
      district("2026-10-06", "08:30", "15:00", OSIEDLE, OSIEDLE),
      district(
        "2026-10-06",
        "08:30",
        "15:00",
        "Osiedle Mazury",
        "Osiedle Mazury",
      ),
    ],
  },
  [CUT_99]: {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      street(
        "2026-06-02",
        "08:30",
        "13:00",
        "Jana III Sobieskiego",
        "Sobieskiego",
        "od siedziby Straży Pożarnej w kierunku Dąbrowy",
      ),
      street("2026-06-02", "08:30", "13:00", "Niemirowska", "Niemirowskiej"),
      street("2026-06-02", "08:30", "13:00", "Starzyny", "Starzyny"),
      street("2026-06-02", "08:30", "13:00", OSIEDLE, OSIEDLE),
    ],
  },
  [WHOLE_TOWN]: {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      {
        date: "2025-11-14",
        start: "23:00",
        end: "03:00",
        locality: "Lubaczów",
        locality_verbatim: null,
        street: null,
        street_verbatim: null,
        note: null,
        kind: "planned",
        ...AI_ITEM,
        whole_town: true,
        whole_town_verbatim: "na terenie całego miasta",
      },
    ],
  },
  [WITH_ESTATE]: {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      street(
        "2025-07-08",
        "09:00",
        "12:00",
        "Jana III Sobieskiego",
        "Sobieskiego",
      ),
      street("2025-07-08", "09:00", "12:00", "Niemirowska", "Niemirowska"),
      district(
        "2025-07-08",
        "09:00",
        "12:00",
        OSIEDLE,
        "Niemirowska wraz z osiedlem",
      ),
      street("2025-07-08", "09:00", "12:00", "Mazury", "Mazury"),
      district(
        "2025-07-08",
        "09:00",
        "12:00",
        "Osiedle Mazury",
        "Mazury wraz z osiedlem",
      ),
      street("2025-07-08", "09:00", "12:00", "Sudel", "Sudel"),
      street("2025-07-08", "09:00", "12:00", "Sosnowa", "Sosnowa"),
    ],
  },
  [CICHA]: {
    post_type: "water_outage",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [
      street(
        "2025-05-14",
        "08:30",
        "12:00",
        "Tadeusza Kościuszki",
        "Kościuszki",
        "od numeru 229 (nieparzyste) oraz numeru 168 (parzyste) w stronę Młodowa",
      ),
      street("2025-05-14", "08:30", "12:00", "Myśliwska", "Myśliwskiej"),
      street("2025-05-14", "08:30", "12:00", "Grzybowa", "Grzybowej"),
      street("2025-05-14", "08:30", "12:00", "Żelichówka", "Żelichówka"),
      street("2025-05-14", "08:30", "12:00", "Walecznych", "Walecznych"),
      street("2025-05-14", "08:30", "12:00", "Cicha", "Cicha"),
      street("2025-05-14", "08:30", "12:00", "Młodowska", "ul. Młodowska"),
    ],
  },
  [DERATYZACJA]: {
    post_type: "other",
    quality_status: null,
    is_past: false,
    changes_earlier_dates: false,
    items: [],
  },
};

/** A real post as the cron reads it: its feed item, its page's text. */
export function realMzgkimPost(id: number): ZukPost {
  const [post] = parseFeed(feedWith([feedItem(id)]));
  const text = pageText(realPage(post.link) ?? "");
  if (!text) throw new Error(`no real page for ${id}`);
  return { ...post, content: { rendered: text } };
}
