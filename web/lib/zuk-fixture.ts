// ZUK water cut fixtures for the unit tests (lib/zuk.test.ts). A fixture,
// so code (scripts/check-tracked-data.mjs).
//
// Formats seen in ZUK posts on gminalubaczow.pl (2021-2026, 81 posts):
// - title: "Przerwa w dostawie wody – 22.10.2026: <places>", "… – 29.09.2026 –
//   <places>", "Przerwy w dostawie wody: 26-29.10.2026", "… – <places>
//   (7-8.09.2026)", "… – Lisie Jamy – 27.08.2026r.", "… 1.09.2025 r.
//   (<places>)", and with no date at all ("Przerwa w dostawie wody", "… dla
//   mieszkańców miejscowości Lisie Jamy", "(noc 21/22 grudnia)");
// - body: one sentence "w dniu D (weekday) w godz. od 8:00 do godz. 16:00
//   nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: <places>";
//   two days "w dniach: D (…) i D (…)"; one day with a list, a window per item;
//   a range "w dniach od D (…) do D (…)" with a list item per day "-D (…):
//   <places> w godz. od … do …"; a night "w nocy z D (…) na D (…) w godz. od
//   22:00 do godz. 5:00"; failure reports in the past tense ("nastąpiła",
//   "przewidywane wznowienie do godz. 19.00"); date updates ("aktualizacja
//   dat", "wydłużenie terminu prac");
// - places: "Wólka Krowicka, Karolówka – ul. Sobieskiego od nr 23 do nr 47",
//   "Lubaczów ul. Żuki", "Lisie Jamy: ul. Polna", "Młodów ulice: Warszawska,
//   …", "Karolówka ulica Sobieskiego", "Młodów, ul. Pilipy" (village and street
//   split by a comma), "Opaka od numeru 104 do 110", "ul. Sobieskiego numery:
//   od 1 do 15 i od 16 do 54", "(przysiółek Dąbrowa)", "ul. Przemysłowa
//   (Lubaczów)", "Załuże–Podłęże od numeru 44" (Podłęże is not in TERYT).

import { terytName } from "./places.ts";
import type { ZukPlaces, ZukPost } from "./zuk.ts";

/**
 * Real: GET https://www.gminalubaczow.pl/wp-json/wp/v2/posts?include=39885,
 * 39872,39865,39863,38969,38890,35690,35661&per_page=20&_fields=id,date,
 * modified,link,title,content on 25 Oct 2026 at 06:48 UTC, body verbatim
 * (9664 bytes): 8 ZUK posts.
 */
export const REAL_2026_10_25 =
  '[{"id":39885,"date":"2026-10-23T18:59:43","modified":"2026-10-23T18:59:43","link":"https:\\/\\/www.gminalubaczow.pl\\/2026\\/10\\/23\\/przerwy-w-dostawie-wody-26-29-10-2026\\/","title":{"rendered":"Przerwy w dostawie wody: 26-29.10.2026"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o. o. w Mokrzycy informuje, \\u017ce w zwi\\u0105zku z trwaj\\u0105cymi pracami modernizacyjnymi (wymiana w\\u0119z\\u0142\\u00f3w i hydrant\\u00f3w) w dniach <strong>od \\u00a026.10.2026r. (poniedzia\\u0142ek)\\u00a0 do 29.10.2026r. (czwartek) <\\/strong>nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci:<\\/p>\\n<ul>\\n<li><strong><u>-26.10.2026 (poniedzia\\u0142ek): <\\/u><\\/strong><strong>Lisie Jamy w godz. od 8:00 do 16:00<\\/strong><\\/li>\\n<li><strong><u>-27.10.2026 (wtorek): <\\/u><\\/strong><strong>D\\u0105bk\\u00f3w, Lubacz\\u00f3w ul. \\u017buki, Opaka od numeru 104 do 110 w godz. od 8:00 do 16:00\\u00a0<\\/strong><\\/li>\\n<li><strong><u>-28.10.2026 (\\u015broda): <\\/u><\\/strong><strong>Za\\u0142u\\u017ce\\u2013Pod\\u0142\\u0119\\u017ce od numeru 44 do numeru 92, Ba\\u0142aje, ul. Przemys\\u0142owa (Lubacz\\u00f3w), Antoniki, M\\u0142od\\u00f3w ul. Pilipy, Piastowo, Basznia Dolna, Basznia G\\u00f3rna, Podlesie \\u2013 w godz. od 8:00 do 16:00\\u00a0<\\/strong><\\/li>\\n<li><strong><u>-29.10.2026 (czwartek): <\\/u><\\/strong><strong>W\\u00f3lka Krowicka, Lisie Jamy &#8211; w godz. od 8:00 do 16:00\\u00a0 <\\/strong><\\/li>\\n<\\/ul>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody.<\\/p>\\n<p>Za utrudnienia przepraszamy.<br \\/>\\nPrezes ZUK. Sp. z o. o.<\\/p>\\n","protected":false}},{"id":39872,"date":"2026-10-21T13:54:49","modified":"2026-10-22T22:03:20","link":"https:\\/\\/www.gminalubaczow.pl\\/2026\\/10\\/21\\/przerwa-w-dostawie-wody-22-10-2026-wolka-krowicka-karolowka-ul-sobieskiego-od-nr-23-do-nr-47-mlodow-ul-warszawska-rzeczna-krotka-wodna\\/","title":{"rendered":"Przerwa w dostawie wody &#8211; 22.10.2026: W\\u00f3lka Krowicka, Karol\\u00f3wka &#8211; ul. Sobieskiego od nr 23 do nr 47, M\\u0142od\\u00f3w &#8211; ul. Warszawska, Rzeczna, Kr\\u00f3tka, Wodna"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o. o. w Mokrzycy informuje, \\u017ce w dniu: <strong>\\u00a022.10.2026r. (czwartek)\\u00a0 w godz. od 8:00 do godz. 16:00 <\\/strong>nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci: <strong>W\\u00f3lka Krowicka, Karol\\u00f3wka &#8211; ul. Sobieskiego od nr 23 do nr 47, M\\u0142od\\u00f3w &#8211; ul. Warszawska, Rzeczna, Kr\\u00f3tka, Wodna.<\\/strong><\\/p>\\n<p>Powy\\u017csza przerwa wynika z konieczno\\u015bci przeprowadzenia prac modernizacyjnych (wymiana w\\u0119z\\u0142\\u00f3w i hydrant\\u00f3w).<\\/p>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody.<\\/p>\\n<p>Za utrudnienia przepraszamy.<br \\/>\\nPrezes ZUK. Sp. z o. o.<\\/p>\\n<p>&nbsp;<\\/p>\\n","protected":false}},{"id":39865,"date":"2026-10-20T11:40:25","modified":"2026-10-21T13:52:45","link":"https:\\/\\/www.gminalubaczow.pl\\/2026\\/10\\/20\\/przerwa-w-dostawie-wody-21-10-2026-dabkow-lubaczow-ul-zuki-opaka-od-nr-104-do-nr-110-piastowo-basznia-dolna-basznia-gorna-podlesie-mlodow-ul-pilipy\\/","title":{"rendered":"Przerwa w dostawie wody &#8211; 21.10.2026: D\\u0105bk\\u00f3w, Lubacz\\u00f3w ul. \\u017buki, Opaka od nr 104 do nr 110, Piastowo, Basznia Dolna, Basznia G\\u00f3rna, Podlesie, M\\u0142od\\u00f3w, ul. Pilipy."},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o. o. w Mokrzycy informuje, \\u017ce w dniu: <strong>\\u00a021.10.2026r. (\\u015broda)\\u00a0 <\\/strong>nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci:<\\/p>\\n<ul>\\n<li><strong> D\\u0105bk\\u00f3w, Lubacz\\u00f3w ul. \\u017buki, Opaka od nr 104 do nr 110 w godz. &#8211; od 8:00 do 12:00\\u00a0<\\/strong><\\/li>\\n<li><strong>Piastowo, Basznia Dolna, Basznia G\\u00f3rna, Podlesie, M\\u0142od\\u00f3w, ul. Pilipy &#8211; od 8:00 do 16:00\\u00a0<\\/strong><\\/li>\\n<\\/ul>\\n<p>Powy\\u017csza przerwa wynika z konieczno\\u015bci przeprowadzenia prac modernizacyjnych (wymiana w\\u0119z\\u0142\\u00f3w i hydrant\\u00f3w).<\\/p>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody.<\\/p>\\n<p>Za utrudnienia przepraszamy.<br \\/>\\nPrezes ZUK. Sp. z o. o.<\\/p>\\n<p>&nbsp;<\\/p>\\n","protected":false}},{"id":39863,"date":"2026-10-19T14:33:20","modified":"2026-10-20T11:36:41","link":"https:\\/\\/www.gminalubaczow.pl\\/2026\\/10\\/19\\/przerwa-w-dostawie-wody-20-10-2026-wolka-krowicka\\/","title":{"rendered":"Przerwa w dostawie wody &#8211; 20.10.2026: W\\u00f3lka Krowicka"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o. o. w Mokrzycy informuje, \\u017ce w dniu <strong>20.10.2026r. (wtorek)\\u00a0 <\\/strong>w godz. od 8:00 do godz. 16:00 nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci: <strong>W\\u00f3lka Krowicka.<\\/strong><\\/p>\\n<p>Powy\\u017csza przerwa wynika z konieczno\\u015bci przeprowadzenia prac modernizacyjnych (wymiana w\\u0119z\\u0142\\u00f3w i hydrant\\u00f3w).<\\/p>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody.<\\/p>\\n<p>Za utrudnienia przepraszamy.<br \\/>\\nPrezes ZUK. Sp. z o. o.<\\/p>\\n<p>&nbsp;<\\/p>\\n","protected":false}},{"id":38969,"date":"2026-09-04T14:18:30","modified":"2026-09-04T14:18:30","link":"https:\\/\\/www.gminalubaczow.pl\\/2026\\/09\\/04\\/przerwa-w-dostawie-wody-mlodow-ul-floriana-7-8-09-2026\\/","title":{"rendered":"Przerwa w dostawie wody &#8211; M\\u0142od\\u00f3w, ul. Floriana (7-8.09.2026)"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o. o. w Mokrzycy informuje, \\u017ce w dniach: <strong>07.09.2026r.(poniedzia\\u0142ek)<\\/strong> <strong>i 08.09.2026r.(wtorek)\\u00a0 <\\/strong>w godz. od 8:00 do godz. 16:00 nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci: <strong>M\\u0142od\\u00f3w, ul. Floriana<\\/strong>.<\\/p>\\n<p>Powy\\u017csza przerwa wynika z konieczno\\u015bci przeprowadzenia prac modernizacyjnych (wymiana w\\u0119z\\u0142\\u00f3w i hydrant\\u00f3w).<\\/p>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody.<\\/p>\\n<p>Za utrudnienia przepraszamy.<\\/p>\\n<p>Prezes ZUK. Sp. z o. o.<\\/p>\\n<p>&nbsp;<\\/p>\\n","protected":false}},{"id":38890,"date":"2026-09-01T14:27:59","modified":"2026-09-03T07:39:54","link":"https:\\/\\/www.gminalubaczow.pl\\/2026\\/09\\/01\\/przerwa-w-dostawie-wody-karolowka-ul-sobieskiego-numery-od-1-do-15-i-od-16-do-54\\/","title":{"rendered":"Przerwa w dostawie wody &#8211; Karol\\u00f3wka ul. Sobieskiego numery: od 1 do 15 i od 16 do 54 (2.09.2026)"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o. o. w Mokrzycy informuje, \\u017ce w dniu <strong>2.09.2026r. (\\u015broda)<\\/strong> w godz. od 8:00 do godz. 16:00 nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci:<strong> Karol\\u00f3wka, ul. Sobieskiego numery: od 1 do 15 i od 16 do 54.<\\/strong><\\/p>\\n<p>Powy\\u017csza przerwa spowodowana jest konieczno\\u015bci\\u0105 przeprowadzenia pilnych prac remontowych na sieci wodoci\\u0105gowej.<\\/p>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody.<\\/p>\\n<p>Za utrudnienia przepraszamy.<\\/p>\\n<p>Prezes ZUK. Sp. z o. o.<\\/p>\\n<p>&nbsp;<\\/p>\\n","protected":false}},{"id":35690,"date":"2025-12-19T14:48:38","modified":"2025-12-29T14:26:47","link":"https:\\/\\/www.gminalubaczow.pl\\/2025\\/12\\/19\\/planowana-przerwa-w-dostawie-wody-lisie-jamy-wolka-krowicka-krowica-sama-krowica-holodowska-budomierz-noc-21-22-grudnia\\/","title":{"rendered":"Planowana przerwa w dostawie wody: Lisie Jamy, W\\u00f3lka Krowicka, Krowica Sama, Krowica Ho\\u0142odowska, Budomierz (noc 21\\/22 grudnia)"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o.o. w Mokrzycy informuje, \\u017ce w <strong>nocy z 21.12.2025r.(niedziela) na 22.12.2025r.(poniedzia\\u0142ek)<\\/strong> w godz. <strong>od 22:00 do godz. 5:00<\\/strong> nast\\u0105pi przerwa w dostawie wody dla mieszka\\u0144c\\u00f3w miejscowo\\u015bci Lisie Jamy, W\\u00f3lka Krowicka, Krowica Sama, Krowica Ho\\u0142odowska, Budomierz. Powy\\u017csza przerwa spowodowana jest konieczno\\u015bci\\u0105 wykonania niezb\\u0119dnych prac na Stacji Uzdatniania Wody w W\\u00f3lce Krowickiej.<\\/p>\\n<p>Za utrudnienia przepraszamy.<\\/p>\\n<p>Prezes ZUK Sp. z o.o.<\\/p>\\n","protected":false}},{"id":35661,"date":"2025-12-16T16:01:29","modified":"2025-12-19T14:46:40","link":"https:\\/\\/www.gminalubaczow.pl\\/2025\\/12\\/16\\/przerwa-w-dostawie-wody-lisie-jamy-wolka-krowicka-krowica-sama-krowica-holodowska-budomierz-awaria-16-12-2025\\/","title":{"rendered":"Przerwa w dostawie wody: Lisie Jamy, W\\u00f3lka Krowicka, Krowica Sama, Krowica Ho\\u0142odowska, Budomierz (awaria 16.12.2025)"},"content":{"rendered":"<p>Zak\\u0142ad Us\\u0142ug Komunalnych Sp. z o.o. w Mokrzycy informuje, \\u017ce w zwi\\u0105zku z awari\\u0105 sieci wodoci\\u0105gowej w dniu 16.12.2025 (wtorek) w miejscowo\\u015bciach Lisie Jamy, W\\u00f3lka Krowicka, Krowica Sama, Krowica Ho\\u0142odowska, Budomierz nast\\u0105pi\\u0142a czasowa przerwa w dostawie wody.<\\/p>\\n<p>Przewidywane wznowienie dostawy do godz. 19.00.<\\/p>\\n<p>Informujemy, \\u017ce po ponownym uruchomieniu wodoci\\u0105gu mo\\u017ce nast\\u0105pi\\u0107 czasowe pogorszenie jako\\u015bci wody. Za utrudnienia przepraszamy.<\\/p>\\n<p style=\\"text-align: center;\\">Prezes ZUK Sp. z o.o.<\\/p>\\n","protected":false}}]';

/** When REAL_2026_10_25 was fetched. */
export const REAL_CHECKED_AT = "2026-10-25T06:48:03Z";

// [SIMC SYM, NAZWA]: every locality of both gminy, TERYT SIMC as of
// 1 Jan 2026 (parts of villages included: Żuki, Pilipy, Smolińce, the two
// Dąbrowas).
const SIMC: Array<[string, string]> = [
  ["0605878", "Bałaje"],
  ["0605884", "Mokrzyca"],
  ["0605890", "Basznia Dolna"],
  ["0605909", "Basznia"],
  ["0605915", "Piaski"],
  ["0605921", "Lubasy"],
  ["0605938", "Ruda"],
  ["0605944", "Szymeczki"],
  ["0605950", "Basznia Górna"],
  ["0605967", "Dąbrowa"],
  ["0605973", "Malce"],
  ["0605980", "Borowa Góra"],
  ["0605996", "Budomierz"],
  ["0606004", "Dąbków"],
  ["0606010", "Dąbrowa"],
  ["0606027", "Holiki"],
  ["0606033", "Kornagi"],
  ["0606040", "Krause"],
  ["0606056", "Mądre"],
  ["0606062", "Michalce"],
  ["0606079", "Szutki"],
  ["0606085", "Wasie"],
  ["0606091", "Hurcze"],
  ["0606100", "Huta Kryształowa"],
  ["0606116", "Karolówka"],
  ["0606122", "Krowica Hołodowska"],
  ["0606139", "Mielniki"],
  ["0606145", "Cetynia Hołodowska"],
  ["0606151", "Głodówka"],
  ["0606168", "Krowica Lasowa"],
  ["0606174", "Boble"],
  ["0606180", "Krowica Sama"],
  ["0606197", "Blusy"],
  ["0606205", "Cetynia"],
  ["0606211", "Obrawczyzna"],
  ["0606228", "Wychylówka"],
  ["0606234", "Lisie Jamy"],
  ["0606240", "Flisy"],
  ["0606257", "Smolińce"],
  ["0606263", "Wygnańce"],
  ["0606270", "Misztale"],
  ["0606286", "Młodów"],
  ["0606292", "Antoniki"],
  ["0606300", "Pilipy"],
  ["0606317", "Opaka"],
  ["0606323", "Kamienna"],
  ["0606330", "Tuczarnia"],
  ["0606346", "Żuki"],
  ["0606352", "Piastowo"],
  ["0606369", "Podlesie"],
  ["0606375", "Szczutków"],
  ["0606381", "Mielniki"],
  ["0606398", "Onyszczaki"],
  ["0606406", "Prewendy"],
  ["0606412", "Szyszaki"],
  ["0606429", "Ruda Szczutkowska"],
  ["0606435", "Tymce"],
  ["0606441", "Wólka Krowicka"],
  ["0606458", "Brzozie"],
  ["0606464", "Załuże"],
  ["0606470", "Czarne"],
  ["0606487", "Moczar Duży"],
  ["0606493", "Moczar Mały"],
  ["0972447", "Lubaczów"],
  ["0972453", "Mazury"],
  ["0972460", "Niwki"],
  ["0972476", "Ostrowiec"],
  ["0972482", "Piaski"],
  ["0972499", "Zaprzekop"],
];

// [SIMC SYM, SYM_UL, NAZWA_1, NAZWA_2]: every street of gmina Lubaczów
// (TERYT ULIC, 16 Oct 2026), and two of the town's that ZUK names.
const ULIC: Array<[string, string, string, string?]> = [
  ["0605890", "08828", "Kolejowa"],
  ["0605890", "10898", "Leśna"],
  ["0605890", "20431", "Jana III Sobieskiego"],
  ["0605890", "20683", "Sportowa"],
  ["0605890", "21970", "Szkolna"],
  ["0605890", "24048", "Wiejska"],
  ["0605890", "27261", "Mierzwy", "Stefana"],
  ["0605890", "46751", "Osiedle Sportowe"],
  ["0605890", "51472", "Osiedle Sołotwina"],
  ["0606004", "07380", "Jaśminowa"],
  ["0606004", "07562", "Jeżynowa"],
  ["0606004", "08574", "Klonowa"],
  ["0606004", "09223", "Konwaliowa"],
  ["0606004", "10567", "Kwiatów Polnych"],
  ["0606004", "12004", "Makowa"],
  ["0606004", "14834", "Ogrodowa"],
  ["0606004", "15710", "Parkowa"],
  ["0606004", "17390", "Poziomkowa"],
  ["0606004", "19000", "Różana"],
  ["0606004", "21227", "Stokrotki"],
  ["0606004", "24870", "Wrzosowa"],
  ["0606004", "26555", "Żuki"],
  ["0606004", "46737", "Dąbka", "gen. Stanisława"],
  ["0606116", "09582", "Kościuszki", "Tadeusza"],
  ["0606116", "14330", "Nowa"],
  ["0606116", "20431", "Jana III Sobieskiego"],
  ["0606116", "24459", "Witosa", "Wincentego"],
  ["0606116", "24885", "Wspólna"],
  ["0606180", "51473", "Osiedle Wolności"],
  ["0606234", "02974", "Cicha"],
  ["0606234", "03839", "Długa"],
  ["0606234", "10009", "Krótka"],
  ["0606234", "10898", "Leśna"],
  ["0606234", "11467", "Lwowska"],
  ["0606234", "13902", "Nadrzeczna"],
  ["0606234", "14330", "Nowa"],
  ["0606234", "14834", "Ogrodowa"],
  ["0606234", "15710", "Parkowa"],
  ["0606234", "17011", "Polna"],
  ["0606234", "20431", "Jana III Sobieskiego"],
  ["0606234", "20677", "Spokojna"],
  ["0606234", "20683", "Sportowa"],
  ["0606234", "23795", "Wąska"],
  ["0606234", "23884", "Wesoła"],
  ["0606234", "24885", "Wspólna"],
  ["0606234", "26081", "Zielona"],
  ["0606234", "27260", "Smolińce"],
  ["0606234", "57638", "aleja kardynała Mariana Jaworskiego"],
  ["0606286", "01465", "Błonie"],
  ["0606286", "05083", "Floriana", "św."],
  ["0606286", "07123", "Jana Pawła II"],
  ["0606286", "09582", "Kościuszki", "Tadeusza"],
  ["0606286", "10009", "Krótka"],
  ["0606286", "10898", "Leśna"],
  ["0606286", "11596", "Łąkowa"],
  ["0606286", "11988", "Majowa"],
  ["0606286", "12964", "Miłosza", "Czesława"],
  ["0606286", "16033", "Piaskowa"],
  ["0606286", "19326", "Rzeczna"],
  ["0606286", "19585", "Sąsiedzka"],
  ["0606286", "20254", "Słoneczna"],
  ["0606286", "20683", "Sportowa"],
  ["0606286", "21970", "Szkolna"],
  ["0606286", "22727", "Techniczna"],
  ["0606286", "23682", "Warszawska"],
  ["0606286", "23884", "Wesoła"],
  ["0606286", "24550", "Wodna"],
  ["0606286", "26081", "Zielona"],
  ["0606286", "39507", "Pilipy"],
  ["0606286", "54164", "Osiedle Wrzosowe"],
  ["0972447", "17742", "Przemysłowa"],
  ["0972447", "26555", "Żuki"],
];

/** Our places as the database holds them: ids SIMC and SIMC-SYM_UL. */
export const PLACES: ZukPlaces = {
  localities: SIMC.map(([id, name]) => ({ id, name })),
  streets: ULIC.map(([simc, sym, nazwa1, nazwa2]) => ({
    id: `${simc}-${sym}`,
    localityId: simc,
    name: terytName(nazwa1, nazwa2 ?? null),
    nazwa1,
  })),
};

/** A synthetic post in ZUK's own wording. */
export function zukPost(
  id: number,
  date: string,
  title: string,
  html: string,
  modified = date,
): ZukPost {
  return {
    id,
    date,
    modified,
    link: `https://www.gminalubaczow.pl/2026/10/${id}/`,
    title: { rendered: title },
    content: { rendered: html },
  };
}

const SIGNATURE =
  "<p>Informujemy, że po ponownym uruchomieniu wodociągu może nastąpić czasowe pogorszenie jakości wody.</p><p>Za utrudnienia przepraszamy.<br />Prezes ZUK. Sp. z o. o.</p>";

/** ZUK's one-sentence notice: "w dniu <when> <hours> nastąpi … <places>". */
export function sentence(
  when: string,
  places: string,
  hours = "w godz. od 8:00 do godz. 16:00",
): string {
  return `<p>Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że w dniu <strong>${when}</strong> ${hours} nastąpi przerwa w dostawie wody dla mieszkańców miejscowości: <strong>${places}.</strong></p>${SIGNATURE}`;
}

/** ZUK's list notice: an intro naming the day(s), one item per list. */
export function list(when: string, items: string[]): string {
  return `<p>Zakład Usług Komunalnych Sp. z o. o. w Mokrzycy informuje, że ${when} nastąpi przerwa w dostawie wody dla mieszkańców miejscowości:</p><ul>${items.map((i) => `<li><strong>${i}</strong></li>`).join("")}</ul>${SIGNATURE}`;
}
