"""Prototype (NOT production) — builds sample JSON from manually transcribed 2026 schedules.
Sources: czystylubaczow.info JPG S1-S5 (uploaded 2025-12-15), gminalubaczow.pl PDFs 1-5 (2026-01-02).
Transcription by agent from images/pdftotext on 2026-10-18; MUST be re-verified by the ETL task (task-10)."""
import csv, json, re, unicodedata, datetime as dt, pathlib
D = pathlib.Path(__file__).resolve().parents[1]
M = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paz','lis','gru']
def days(spec):  # spec: 12 entries, each list of day ints for that month
    out=[]
    for m,ds in enumerate(spec,1):
        for d in ds: out.append(dt.date(2026,m,d).isoformat())
    return out
# ---- MIASTO (JPG) ----  fractions: zmieszane+popiol share a cell; papier+tworzywa+szklo share a cell
CITY = {
 1: dict(zm=[[12,26],[9,23],[9,23],[8,20],[4,18],[1,15,29],[13,27],[10,24],[7,21],[5,19],[2,16,30],[14,28]],
         sel=[[5],[2],[2],[1],[4],[1,15],[6,20],[3,17],[1],[5],[2],[7]],
         bio=[[5],[2],[2],[1,13,27],[11,25],[8,22],[6,20],[3,17],[2,14,28],[12,26],[9],[7]],
         wlk=[[],[],[5],[],[],[],[],[],[3],[],[],[]]),
 2: dict(zm=[[13,27],[10,24],[10,24],[7,21],[5,19],[2,16,30],[14,28],[11,25],[8,22],[6,20],[3,17],[1,15,29]],
         sel=[[13],[10],[10],[7],[12],[2,16],[7,21],[4,18],[8],[13],[10],[15]],
         bio=[[7],[3],[3],[2,14,28],[12,26],[9,23],[7,21],[4,18],[1,15,29],[13,27],[10],[8]],
         wlk=[[],[],[16],[],[],[],[],[],[16],[],[],[]]),
 4: dict(zm=[[2,15,29],[12,26],[12,26],[9,23],[7,21],[3,18],[2,16,30],[13,27],[10,24],[8,22],[5,19],[3,17,31]],
         sel=[[22],[19],[19],[16],[21],[11,25],[16,30],[13,27],[17],[22],[19],[23]],
         bio=[[8],[5],[5],[2,16,30],[14,28],[11,25],[9,23],[6,20],[3,17],[1,15,29],[12],[10]],
         wlk=[[],[],[20],[],[],[],[],[],[21],[],[],[]]),
 5: dict(zm=[[2,16,30],[13,27],[13,27],[10,24],[8,22],[5,19],[3,17,31],[14,28],[11,25],[9,23],[6,20],[4,18]],
         sel=[[30],[27],[27],[24],[29],[12,26],[17,31],[14,28],[25],[30],[27],[30]],
         bio=[[9],[6],[6],[3,17,29],[15,29],[12,26],[10,24],[7,21],[4,18],[2,16,30],[13],[11]],
         wlk=[[],[],[30],[],[],[],[],[],[30],[],[],[]]),
}
CITY[3] = CITY[2]  # S3 table is pixel-identical to S2 in the source JPGs (verified by image diff) -> flagged
CITY_FRAC = {'zm':['zmieszane','popiol'],'sel':['papier','tworzywa_metale','szklo'],'bio':['bio'],
             'wlk':['wielkogabarytowe','elektro','opony','tekstylia']}
STREETS = {
1:"Adama Asnyka, Cicha, Cypriana Kamila Norwida, Dolna, Elizy Orzeszkowej, Jana Kasprowicza, Juliusza Słowackiego, Gabrieli Zapolskiej, Gen. Nakoniecznikoffa, Kamila Baczyńskiego, Kazimierza Przerwy-Tetmajera, Kurierów Armii Krajowej, Kolejowa, Ks. Haasa Paneckiego, Leopolda Staffa, Marii Dąbrowskiej, Mjr. Henryka Sucharskiego, Mjr. Henryka Hubala, Młodowska, Myśliwska, Łowiecka, Ofiar Katynia, Rtm. Pileckiego, Rynek, Stanisława Konery, Szarych Szeregów, Tadeusza Kościuszki, Techniczna, Towarowa, Walecznych, Władysława Broniewskiego, Zofii Nałkowskiej, Zygmunta Krasińskiego, Żelichówka, Żwirki i Wigury, Grzybowa, Leśników, Inżynierska, Fabryczna",
2:"Agrestowa, Bolesława Prusa, Brzoskwiniowa, Grunwaldzka, Gruszkowa, Hotelowa, Ignacego Krasickiego, Jabłkowa, Jana Matejki, Jana Kochanowskiego, Jasna, Jęczmienna, Józefa Ignacego Kraszewskiego, Józefa Piłsudskiego, Kard. Stefana Wyszyńskiego, Kazimierza Wielkiego, Krótka, Legionów, Mikołaja Kopernika, Morelowa, Nowa, Płk. Stanisława Dąbka, Polna, Rzeczna, Rzemieślnicza, Sadowa, Sienna, Słoneczna, Sportowa, Stefana Żeromskiego, Śliwkowa, Św. Anny, Targowa, Wiśniowa, Zbożowa, Żuki, Żniwna, Żytnia, Warzywna",
3:"Abp. Eugeniusza Baziaka, Armii Krajowej, Batalionów Chłopskich, Bohaterów Września 1939, Bolesława Chrobrego, Bolesława Krzywoustego, Gen. Grota-Roweckiego, Gen. Józefa Kustronia, Jagiellonów, Józefa Conrada-Korzeniowskiego, Józefa Pluchy, Kombatantów, Marii Konopnickiej, Obrońców Lubaczowa, Partyzantów, Prof. Franciszka Misztala, Prof. Władysława Witwickiego, Pszennego, Unii Lubelskiej, Wincentego Witosa, Władysława Jagiełły, Władysława Łokietka, Wojska Polskiego, Okrężna, Zygmunta Nowickiego",
4:"3-ego Maja, Agenora Gołuchowskiego, Akacjowa, Andrzeja II Węgierskiego, Boczna Mazury, Brzozowa, Dębowa, Dworska, Fiołkowa, Franciszka Mazurkiewicza, Gen. Antoniego Jeziorańskiego, Handlowa, Henryka Sienkiewicza, Het. Sieniawskiego, Het. Tarnowskiego, Irysowa, Jagodowa, Jana III Sobieskiego, Jarzębinowa, Jaśminowa, Jaworowa, Kasztelańska, Klonowa, Konwaliowa, Księcia Leszka Białego, Księcia Władysława Opolczyka, Kwiatowa, Lipowa, Malinowa, Mały Łążek, Mazury, Mikołaja Zibura, Miodowa, Monte Casino, Narcyzowa, Niemirowska, Ostrowiecka, Parkowa, Piotra Łukasiewicza, Płk. Franciszka Herzoga, Podzamcze, Pogodna, Poziomkowa, Rejtana, Różana, Słonecznikowa, Sosnowa, Stanisława Wyspiańskiego, Starzyny, Strażacka, Sudel, Tulipanowa, Wierzbowa, Wiosenna, Wojewody Pakosława, Wrzosowa, Św. Huberta, Św. Królowej Jadwigi, Zielna, Chabrowa",
5:"Eugeniusza Kwiatkowskiego, Adama Mickiewicza, Budowlanych, Dr. Henryka Szymańskiego, Dr. Szczepana Kruczka, Dr. Zygmunta Leszczyńskiego, Fryderyka Szopena, Gen. Józefa Hallera, Gen. Władysława Sikorskiego, Ignacego Mościckiego, Jacka Malczewskiego, Ks. Bronisława Gwoździa, Leśna, Kasztanowa, Obrońców Lwowa, Ogrodowa, Piaski, Piaskowa, Pod Borem, Przemysłowa, Rolna, Romana Dmowskiego, Stanisława Dębickiego, Szpitalna, Westerplatte, Wodna, Wspólna, Zacisze, Zielona"}
# ---- GMINA (PDF) ---- col1 = "ZMIESZANE I BIO", col2 = selektywne (żółty/niebieski/zielony), col3 = wielkogabarytowe
GM = {
 1: (["Lisie Jamy","Dąbrowa","Szczutków"], "1_2026_Lisie_Jamy_Dabrowa_Szczutkow.pdf",
     [[19],[16],[16],[2,20],[4,18],[1,15],[6,20],[3,14],[1,14],[5,19],[16],[14]], [[19],[16],[16],[20],[18],[15],[20],[14],[14],[19],[16],[14]], [[],[],[24],[],[],[],[],[],[22],[],[],[]]),
 2: (["Wólka Krowicka","Budomierz","Krowica Hołodowska","Krowica Sama","Krowica Lasowa"], "2_2026_WolkaKrowicka_Budomierz_Krowica.pdf.pdf",
     [[20],[17],[17],[7,21],[5,19],[2,16],[7,21],[4,18],[2,15],[6,20],[17],[15]], [[20],[17],[17],[21],[19],[16],[21],[18],[15],[20],[17],[15]], [[],[],[25],[],[],[],[],[],[23],[],[],[]]),
 3: (["Borowa Góra","Karolówka","Młodów","Hurcze","Opaka"], "3_2026_BorowaGora_Karolowka_Hurcze_Opaka.pdf",
     [[21],[18],[18],[8,22],[6,20],[3,17],[8,22],[5,19],[3,16],[7,21],[18],[16]], [[21],[18],[18],[22],[20],[17],[22],[19],[16],[21],[18],[16]], [[],[],[26],[],[],[],[],[],[24],[],[],[]]),
 4: (["Basznia Dolna","Tymce","Basznia Górna","Podlesie","Huta Kryształowa"], "4_2026_Basznie_Tymce_Podlesie_Huta_Krysz.pdf",
     [[22],[19],[19],[9,23],[7,21],[8,18],[9,23],[6,20],[4,17],[8,22],[19],[17]], [[22],[19],[19],[23],[21],[18],[23],[20],[17],[22],[19],[17]], [[],[],[27],[],[],[],[],[],[25],[],[],[]]),
 5: (["Mokrzyca","Załuże","Piastowo","Antoniki","Bałaje","Dąbków"], "5_2026_Mokrzyca_Zaluze_Piastowo_Antoniki_Balaje_Dabkow.pdf",
     [[23],[20],[20],[10,24],[8,22],[9,19],[10,24],[7,21],[7,18],[9,23],[20],[18]], [[23],[20],[20],[24],[22],[19],[24],[21],[18],[23],[20],[18]], [[],[],[31],[],[],[],[],[],[29],[],[],[]]),
}
def norm(s):
    s=unicodedata.normalize('NFKD',s.lower()); s=''.join(c for c in s if not unicodedata.combining(c)).replace('ł','l')
    return re.sub(r'[^a-z0-9]+',' ',s).strip()
PREF=r'^(gen|ks|mjr|rtm|plk|kard|abp|prof|dr|het|sw|ksiecia|wojewody)\s+'
def key(s):
    s=norm(s)
    while re.match(PREF,s): s=re.sub(PREF,'',s)
    return s
ulic=list(csv.DictReader(open(D/'teryt/ULIC_1809011_miasto_lubaczow.csv',encoding='utf-8-sig'),delimiter=';'))
idx={}
for r in ulic:
    full=f"{r['NAZWA_2']} {r['NAZWA_1']}".strip()
    for k in {key(full),key(r['NAZWA_1'])}: idx.setdefault(k,[]).append(r)
streets=[];unmatched=[];used=set()
for s,txt in STREETS.items():
    for name in [x.strip() for x in txt.split(',') if x.strip()]:
        ALIAS={'Monte Casino':'Monte Cassino','Józefa Conrada-Korzeniowskiego':'Józefa Conrad-Korzeniowskiego','Jagiellonów':'Osiedle Jagiellonów'}
        k=key(ALIAS.get(name,name)); hits=idx.get(k) or []
        if not hits:  # try surname-only (last token(s))
            hits=[r for r in ulic if key(r['NAZWA_1'])==k.split(' ')[-1] or k.endswith(key(r['NAZWA_1']))]
        hits={h['SYM_UL']:h for h in hits}.values()
        if len(hits)==1:
            h=list(hits)[0]; used.add(h['SYM_UL'])
            streets.append(dict(source_name=name,sector=f"miasto-s{s}",sym_ul=h['SYM_UL'],teryt_cecha=h['CECHA'],teryt_nazwa_1=h['NAZWA_1'],teryt_nazwa_2=h['NAZWA_2'] or None,match='alias' if name in ALIAS else 'auto'))
        else:
            unmatched.append(dict(source_name=name,sector=f"miasto-s{s}",candidates=[(h['SYM_UL'],h['NAZWA_1'],h['NAZWA_2']) for h in hits]))
not_in_schedule=[dict(sym_ul=r['SYM_UL'],cecha=r['CECHA'],nazwa_1=r['NAZWA_1'],nazwa_2=r['NAZWA_2']) for r in ulic if r['SYM_UL'] not in used]
simc=list(csv.DictReader(open(D/'teryt/SIMC_1809011_1809042.csv',encoding='utf-8-sig'),delimiter=';'))
bysym={r['SYM']:r for r in simc}
v2s={}
for s,(vs,*_) in GM.items():
    for v in vs: v2s[v]=s
places=[]
for r in simc:
    if r['GMI']=='01':
        places.append(dict(sym=r['SYM'],name=r['NAZWA'],gmina='Lubaczów (miasto)',parent=bysym[r['SYMPOD']]['NAZWA'],sector='miasto: wg ulicy')); continue
    parent=bysym[r['SYMPOD']]; pname=parent['NAZWA']
    if r['SYM']=='0606010': pname='Dąbrowa'
    sec=v2s.get(pname)
    places.append(dict(sym=r['SYM'],name=r['NAZWA'],gmina='Lubaczów (gmina wiejska)',parent=pname if r['SYM']!=r['SYMPOD'] else None,
                       rm=r['RM'],sector=f"gmina-s{sec}" if sec else None,mapping='direct' if r['SYM']==r['SYMPOD'] else 'via_parent (needs confirmation)'))
sched=[]
for s,c in CITY.items():
    for col,frs in CITY_FRAC.items():
        for d in days(c[col]): sched.append(dict(sector=f"miasto-s{s}",date=d,fractions=frs,source=f"https://czystylubaczow.info/wp-content/uploads/2025/12/harmonogram-2026-s{s}.jpg"))
for s,(vs,f,c1,c2,c3) in GM.items():
    src=f"https://www.gminalubaczow.pl/wp-content/uploads/2026/01/{f}"
    for d in days(c1): sched.append(dict(sector=f"gmina-s{s}",date=d,fractions=['zmieszane','bio'],source=src,note='column header "ODPADY KOMUNALNE ZMIESZANE I BIO" — whether both fractions go on every date needs confirmation'))
    for d in days(c2): sched.append(dict(sector=f"gmina-s{s}",date=d,fractions=['tworzywa_metale','papier','szklo'],source=src))
    for d in days(c3): sched.append(dict(sector=f"gmina-s{s}",date=d,fractions=['wielkogabarytowe'],source=src))
WD='pon wt śr czw pt sob ndz'.split()
anom=[]
for x in sched:
    d=dt.date.fromisoformat(x['date']); x['weekday']=WD[d.weekday()]
for sec in sorted({x['sector'] for x in sched}):
    wds=[x['weekday'] for x in sched if x['sector']==sec]; mode=max(set(wds),key=wds.count)
    for x in sched:
        if x['sector']==sec and x['weekday']!=mode: anom.append(f"{sec} {x['date']} ({x['weekday']}, usual {mode}) {'/'.join(x['fractions'])}")
meta=dict(generated='2026-10-18',status='PROTOTYPE sample — manual transcription, unverified; do not publish',
          flags=['miasto S2 and S3 JPG tables are pixel-identical (image diff = 0); confirm with MZGKiM/UM or eGmina BOM',
                 'gmina column 1 = "zmieszane i BIO" combined; semantics to confirm'])
(D/'sample').mkdir(exist_ok=True)
json.dump(dict(meta=meta,events=sched),open(D/'sample/schedule-2026.sample.json','w'),ensure_ascii=False,indent=1)
json.dump(dict(meta=meta,streets=streets,unmatched=unmatched,teryt_streets_not_in_any_sector=not_in_schedule,places=places),open(D/'sample/address-register.sample.json','w'),ensure_ascii=False,indent=1)
open(D/'sample/weekday-anomalies.txt','w').write('\n'.join(anom)+'\n')
print('events',len(sched),'streets matched',len(streets),'unmatched',len(unmatched),'teryt city streets not in schedule',len(not_in_schedule),'places',len(places),'anomalies',len(anom))
for u in unmatched: print('UNMATCHED',u)
print('NOT IN SCHEDULE:',', '.join(f"{x['cecha']} {x['nazwa_2']} {x['nazwa_1']}".replace('  ',' ') for x in not_in_schedule))
print([p for p in places if p['gmina'].startswith('Lubaczów (g') and not p['sector']])
