# Evaluációs Központ

## 1. A dokumentum célja

Ez a dokumentum a meglévő AI Receptasszisztenshez készített Evaluációs Központ használatát és működését mutatja be.

Az Evaluációs Központ nem egy új AI-asszisztens. A felület a már elkészült receptasszisztens tesztelésére, automatikus értékelésére, emberi felülvizsgálatára és iteratív fejlesztésére szolgál.

Az AI Receptasszisztens önálló dokumentációja a következő fájlban található:

```text
README_AI-Assystant.md
```

A projekt rövid indítási útmutatója:

```text
README.md
```

## 2. Az Evaluációs Központ célja

Az Evaluációs Központ fő céljai:

- a meglévő AI-asszisztens mérhető tesztelése;
- single-turn és multi-turn beszélgetések vizsgálata;
- különböző rendszerpromptok összehasonlítása;
- a RAG-alapú dokumentum-visszakeresés ellenőrzése;
- automatikus LLM as Judge értékelés futtatása;
- automatikus és emberi értékelés összevetése;
- minden tesztfutás külön fájlba mentése;
- baseline és iteráció utáni eredmények összehasonlítása;
- egy célzott promptmódosítás hatásának visszamérése.

A fejlesztés oktatási célú. A cél nem egy hibátlan, minden környezetben használható evaluációs platform létrehozása, hanem az LLM-alapú rendszerek mérésének és iteratív fejlesztésének gyakorlati bemutatása.

## 3. Az Evaluációs Központ indítása

A projekt gyökérkönyvtárában futtasd:

```powershell
npm install
npm run dev
```

Az Evaluációs Központ címe:

```text
http://localhost:3000/evaluation
```

Az AI Receptasszisztens főoldala:

```text
http://localhost:3000
```

Ha a 3000-es port foglalt, a Next.js másik portot használhat. Ebben az esetben a terminálban megjelenő címet kell használni, például:

```text
http://localhost:3001/evaluation
```

Az evaluációs oldalt és az API-végpontokat nem kell külön paranccsal elindítani. Az `npm run dev` az egész Next.js alkalmazást elindítja.

## 4. Megvalósított funkciók

A felület az alábbi evaluációs funkciókat tartalmazza:

- Single-turn evaluáció
- Prompt A/B teszt
- Multi-turn evaluáció
- RAG-szintű evaluáció
- LLM as Judge automatikus értékelés
- szabályalapú RAG-ellenőrzés
- válaszidő mérése
- automatikus JSON-eredménymentés
- emberi értékelés
- baseline és iteráció összehasonlítása

A projekt nem használ Braintrust vagy más külső online evaluációs platformot.

## 5. Főbb fájlok és mappák

```text
app/
├── evaluation/
│   └── page.tsx
└── api/
    └── evaluation/
        ├── judge/
        │   └── route.ts
        ├── save/
        │   └── route.ts
        ├── human-review/
        │   └── route.ts
        └── results/
            └── route.ts

components/
└── evaluation/
    ├── EvaluationDashboard.tsx
    ├── EvaluationDashboard.module.css
    ├── HumanReviewForm.tsx
    ├── HumanReviewForm.module.css
    ├── ResultsComparison.tsx
    └── ResultsComparison.module.css

lib/
└── evaluation/
    └── rag-evaluation.ts

data/
└── evaluation-results/
    └── mentett JSON-eredmények
```

### Fájlok szerepe

#### `app/evaluation/page.tsx`

Az Evaluációs Központ külön weboldala. Betölti a tesztfuttató és az eredmény-összehasonlító komponenseket.

#### `components/evaluation/EvaluationDashboard.tsx`

Az evaluációs felület fő komponense. Kezeli a teszttípus kiválasztását, a tesztadatokat, az API-hívásokat és az eredmények megjelenítését.

#### `app/api/evaluation/judge/route.ts`

Az LLM as Judge szerveroldali végpontja. Pontozza az asszisztens válaszát vagy a teljes többfordulós beszélgetést.

#### `app/api/evaluation/save/route.ts`

Minden automatikus teszt eredményét külön JSON-fájlba menti.

#### `app/api/evaluation/human-review/route.ts`

Az emberi értékelést külön JSON-fájlba menti.

#### `app/api/evaluation/results/route.ts`

Beolvassa és egységes formában visszaadja a mentett automatikus eredményeket az összehasonlító felület számára.

#### `lib/evaluation/rag-evaluation.ts`

Szabályalapú RAG-ellenőrzést végez a találatok, a kontextus, az elvárt forrás és a hasonlósági küszöb alapján.

## 6. Single-turn evaluáció

A Single-turn evaluáció egyetlen felhasználói kérdést küld a meglévő receptasszisztensnek.

### Beállítható adatok

- rendszerprompt;
- tesztkérdés;
- elvárt viselkedés.

### A futtatás során mért adatok

- asszisztens válasza;
- válaszmodell;
- használt rendszerprompt;
- válaszidő;
- keresési találatok száma;
- felhasznált RAG-kontextusok száma;
- források és hasonlósági értékek;
- LLM as Judge pontszámok.

### Példa

```text
Tesztkérdés:
Ajánlj egy gyors húsmentes vacsorát!

Elvárt viselkedés:
Az asszisztens kizárólag a receptadatbázis alapján válaszoljon, és ne találjon ki hiányzó információt.
```

## 7. Prompt A/B teszt

Az A/B teszt ugyanazt a kérdést két rendszerprompttal futtatja:

```text
A változat: strict, szigorúan forráshű
B változat: conversational, beszélgető és ajánló
```

Mindkét változat esetében külön lefut:

1. a receptasszisztens;
2. az LLM as Judge értékelés.

A felület összehasonlítja:

- az összpontszámokat;
- a válaszidőket;
- a válaszokat;
- a részletes Judge-pontszámokat;
- a RAG-forrásokat.

Egy A/B futás két asszisztenshívást és két Judge-hívást végez.

## 8. Multi-turn evaluáció

A Multi-turn evaluáció több egymásra épülő felhasználói fordulót kezel.

A jelenlegi felület három szerkeszthető felhasználói fordulót biztosít.

### Példa tesztforgatókönyv

```text
1. forduló:
Ajánlj egy egyszerű vacsorát!

2. forduló:
Legyen húsmentes.

3. forduló:
Tejterméket sem fogyaszthatok. Mit ajánlasz az eddigi feltételek alapján?
```

### Vizsgált tulajdonságok

- korábbi feltételek megőrzése;
- új feltételek hozzáadása;
- kontextusmegőrzés;
- beszélgetési következetesség;
- utasításkövetés;
- megalapozottság;
- érthetőség;
- összesített minőség.

### A 2000 karakteres korlát kezelése

A meglévő chat API legfeljebb 2000 karakteres üzenetet fogad. Emiatt a következő multi-turn forduló csak a korábbi felhasználói feltételek rövidített változatát kapja meg. A hosszú asszisztensválaszokat a rendszer nem küldi vissza a chat API-nak.

A teljes, rövidítetlen beszélgetés ettől függetlenül:

- megjelenik a felületen;
- bekerül az eredményfájlba;
- eljut az LLM Judge értékeléshez.

Ez a megoldás oktatási célú egyszerűsítés. A meglévő `/api/chat` végpontot nem kellett strukturált `messages` tömb támogatásával átalakítani.

## 9. RAG-szintű evaluáció

A RAG-szintű evaluáció a válasz minősége mellett a dokumentum-visszakeresést is vizsgálja.

### Beállítható adatok

- tesztkérdés;
- elvárt dokumentum vagy recept neve;
- minimális hasonlósági érték;
- rendszerprompt;
- elvárt viselkedés.

### Szabályalapú ellenőrzések

- volt-e keresési találat;
- kapott-e RAG-kontextust a válaszgenerálás;
- szerepel-e az elvárt dokumentum a források között;
- eléri-e a legjobb találat a megadott hasonlósági küszöböt.

A teljes szabályalapú RAG-teszt csak akkor felel meg, ha minden szükséges feltétel teljesül.

### Fontos különbség

A szabályalapú RAG-ellenőrzés és az LLM as Judge eltérő dolgot mér.

Például:

- a dokumentum-visszakeresés nem talál forrást, ezért a RAG-teszt nem felel meg;
- az asszisztens helyesen jelzi, hogy nincs releváns forrás, és nem talál ki választ;
- emiatt az LLM as Judge magas pontszámot adhat az asszisztens viselkedésére.

Ez nem programhiba. A két értékelési réteg egymást kiegészítő információt ad.

### Tesztkérdés megválasztása

A RAG-teszt kérdésének kapcsolódnia kell a feltöltött dokumentum tartalmához.

Példa:

```text
Tesztkérdés:
Milyen hozzávalók szükségesek a túrós palacsintához?

Elvárt dokumentum:
palacsinta

Minimális hasonlóság:
0.30
```

## 10. LLM as Judge

Az LLM as Judge egy külön modellhívással értékeli az asszisztens válaszát.

### Single-turn szempontok

- relevancia;
- utasításkövetés;
- megalapozottság;
- érthetőség.

### Multi-turn további szempontok

- kontextusmegőrzés;
- következetesség.

Minden pontszám 1 és 5 közötti érték.

Az összpontszámot a szerver újraszámolja a részpontszámok átlagából. A teszt akkor felel meg, ha az összpontszám legalább 3,5.

Az értékelő modell rövid magyar nyelvű indoklást is készít.

### Korlátok

Az LLM as Judge nem tekinthető abszolút igazságnak. Az eredmény függhet:

- az értékelő prompttól;
- a használt modelltől;
- a válasz megfogalmazásától;
- az értékelő modell természetes változékonyságától.

Ezért a rendszer emberi értékelést is támogat.

## 11. Emberi értékelés

Minden sikeresen lefuttatott és elmentett automatikus teszthez külön emberi értékelés készíthető.

### Beállítható adatok

- emberi pontszám 1 és 5 között;
- megfelelt vagy nem felelt meg állapot;
- egyetértés az LLM as Judge eredményével;
- szöveges megjegyzés.

Az emberi értékelés külön JSON-fájlba kerül. Az eredeti automatikus eredmény változatlan marad.

A kapcsolatot az automatikus eredményfájl neve biztosítja.

## 12. Automatikus eredménymentés

Minden sikeresen lefuttatott teszt külön JSON-fájlba kerül.

Az eredmények mappája:

```text
data/evaluation-results/
```

Példák:

```text
single-turn_2026-10-01T10-20-30.123Z_a1b2c3.json
ab-test_2026-10-01T10-25-30.123Z_d4e5f6.json
multi-turn_2026-10-01T10-30-30.123Z_g7h8i9.json
rag_2026-10-01T10-35-30.123Z_j1k2l3.json
human-review_2026-10-01T10-40-30.123Z_m4n5o6.json
```

Minden futás egyedi időbélyeget és rövid azonosítót kap, ezért a korábbi eredmények nem íródnak felül.

### Mentett adatok

A teszttípustól függően az eredményfájl tartalmazhatja:

- a tesztkérdést;
- az elvárt viselkedést;
- a rendszerpromptot;
- az asszisztens választ;
- a modellt;
- a válaszidőt;
- a RAG-eredményeket;
- az LLM as Judge pontszámait;
- a teljes multi-turn beszélgetést;
- a szabályalapú RAG-ellenőrzést.

## 13. Eredménylista API

A mentett automatikus eredményeket a következő belső API-végpont listázza:

```text
GET /api/evaluation/results
```

Böngészőből ellenőrzéshez elérhető:

```text
http://localhost:3000/api/evaluation/results
```

A végpontot nem kell külön elindítani és normál használat közben nem szükséges közvetlenül megnyitni.

A Baseline és iteráció összehasonlítása panel automatikusan meghívja az API-t.

## 14. Baseline és iteráció összehasonlítása

A felület alsó részén két mentett automatikus eredmény választható ki:

- baseline eredmény;
- iteráció utáni eredmény.

### Összehasonlított mutatók

- összpontszám;
- relevancia;
- utasításkövetés;
- megalapozottság;
- érthetőség;
- kontextusmegőrzés;
- következetesség;
- válaszidő;
- megfelelt vagy nem felelt meg állapot.

A felület jelzi, hogy a mérőszám:

- javult;
- romlott;
- változatlan maradt.

A válaszidőnél az alacsonyabb érték számít javulásnak. A minőségi pontszámoknál a magasabb érték számít javulásnak.

### Helyes összehasonlítás

Korrekt összehasonlításhoz a két futásnál egyezzen:

- a teszttípus;
- a tesztkérdés vagy multi-turn forgatókönyv;
- az elvárt viselkedés;
- lehetőleg a modell;
- a Judge értékelési logikája.

Az egyetlen szándékos különbség a vizsgált fejlesztési változtatás legyen.

Eltérő teszttípusok kiválasztásakor a felület figyelmeztetést jelenít meg.

## 15. Baseline mérés és iteratív fejlesztés

A kiválasztott fejlesztési cél a multi-turn beszélgetésekben megadott felhasználói feltételek megőrzése volt.

### Baseline

A fejlesztés előtt ugyanaz a háromfordulós teszt három alkalommal futott le a `conversational` rendszerprompttal.

### Célzott módosítás

A `conversational` rendszerprompt külön többfordulós szabályokkal egészült ki.

A módosítás előírja:

- a korábbi felhasználói feltételek összegyűjtését;
- az új feltételek hozzáadását;
- az étkezési korlátozások együttes alkalmazását;
- az összes feltétel ellenőrzését a végső ajánlás előtt;
- ellentmondó feltételeknél pontosító kérdés használatát.

### Iteráció

A promptmódosítás után ugyanaz a háromfordulós teszt további három alkalommal futott le.

A baseline és az iteráció eredményei az összehasonlító panelen vizsgálhatók.

## 16. API-végpontok

### Receptasszisztens

```text
POST /api/chat
```

Feladata a dokumentumkeresés, a RAG-válasz elkészítése és a forrásadatok visszaadása.

### LLM as Judge

```text
POST /api/evaluation/judge
```

Feladata az asszisztensválasz vagy a teljes beszélgetés automatikus pontozása.

### Automatikus eredménymentés

```text
POST /api/evaluation/save
```

Feladata a teszteredmény külön JSON-fájlba mentése.

### Emberi értékelés mentése

```text
POST /api/evaluation/human-review
```

Feladata az emberi értékelés külön JSON-fájlba mentése.

### Eredménylista

```text
GET /api/evaluation/results
```

Feladata a mentett automatikus eredmények egységes listázása.

## 17. Javasolt tesztelési sorrend

1. Indítsd el a projektet.
2. Nyisd meg az `/evaluation` oldalt.
3. Futtass egy Single-turn tesztet.
4. Futtass egy A/B tesztet.
5. Futtass egy Multi-turn tesztet.
6. Futtass egy konkrét dokumentumra irányuló RAG-tesztet.
7. Ellenőrizd a mentett JSON-fájlokat.
8. Készíts legalább egy emberi értékelést.
9. Frissítsd az eredménylistát.
10. Válassz azonos típusú baseline és iterációs eredményt.
11. Értelmezd a pontszámok és a válaszidő változását.

## 18. Technikai ellenőrzés

Kódellenőrzés:

```powershell
npm run lint
```

Production build ellenőrzése:

```powershell
npm run build
```

Fejlesztői szerver indítása:

```powershell
npm run dev
```

## 19. Ismert korlátok

- A multi-turn előzményeket a rendszer rövidített szövegként adja tovább, nem strukturált üzenettömbként.
- A chat API 2000 karakteres korlátja miatt a multi-turn üzenetek rövidítve vannak.
- Az LLM as Judge pontozása nem teljesen determinisztikus.
- A helyi fájlmentés fejlesztői környezethez készült.
- Felhőbe telepített, szerver nélküli környezetben tartós adatbázis vagy külső tárhely szükséges.
- A RAG-szintű ellenőrzés a forrás-metaadatokat és hasonlósági értékeket használja, nem a teljes dokumentumrészleteket.
- Az A/B eredmény összehasonlító listája a két prompt eredményének átlagát használja.
- Különböző teszttípusok eredményei nem hasonlíthatók össze közvetlenül.

## 20. Továbbfejlesztési lehetőségek

Lehetséges későbbi fejlesztések:

- strukturált multi-turn `messages` tömb támogatása;
- szerkeszthető számú beszélgetési forduló;
- tesztkészletek tömeges futtatása;
- eredmények adatbázisban tárolása;
- grafikonok és statisztikai összesítések;
- emberi és automatikus értékelés egyezési arányának számítása;
- eredmények exportálása CSV- vagy Excel-formátumba;
- külön baseline és iteráció címkék;
- ismételt futások átlagának és szórásának automatikus számítása.

## 21. Összegzés

Az Evaluációs Központ a meglévő AI Receptasszisztenshez kapcsolódó, elkülönített tesztfelület.

A rendszer egyszerre támogatja:

- az automatikus tesztfuttatást;
- az LLM-alapú minőségértékelést;
- a determinisztikus RAG-ellenőrzést;
- az emberi felülvizsgálatot;
- a külön eredményfájlok létrehozását;
- a baseline és iteráció utáni állapot összehasonlítását.

A megoldás bemutatja, hogy egy AI-rendszer fejlesztése mérés, célzott módosítás és visszamérés segítségével végezhető el.
