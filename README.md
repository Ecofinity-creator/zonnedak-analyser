# ☀️ ZonneDak Analyzer

**LiDAR-gebaseerde dakanalyse voor zonnepanelen in Vlaanderen**

Gebruik het **Digitaal Hoogtemodel Vlaanderen II (DHMV II)** om het zonnepotentieel van elk dak in Vlaanderen te berekenen. Met ondersteuning voor **AlphaESS SMILE-G3** omvormers en batterijen.

---

## 🌟 Functies

- 🗺️ **Live DHM Vlaanderen kaart** — DSM/DTM LiDAR lagen via officiële WMS dienst
- 🔍 **Adreszoeker** voor heel België (Nominatim/OpenStreetMap)
- 📐 **Dakparameters** — oppervlak, hellingshoek, oriëntatie
- 🪟 **Panelenlijst** — 5 standaard panelen + zelf toevoegen
- ⚡ **AlphaESS SMILE-G3** — volledige productlijn omvormers (1-fase & 3-fase)
- 🔋 **AlphaESS G3 batterijen** — BAT-G3-3.8S, 9.3S, 10.1P + pakketten
- 🔢 **Aanpasbaar aantal panelen** — automatisch of handmatig per klant
- 📊 **Terugverdientijdvergelijking** — zonder vs. met batterij
- 🤖 **AI Expert Advies** — via Claude API (Vlaamse premies, tips)

---

## 🚀 Installatie & lokaal draaien

### Vereisten
- [Node.js](https://nodejs.org/) versie 18 of hoger
- [Git](https://git-scm.com/)
- Een Anthropic API key (voor de AI analyse)

### Stappen

```bash
# 1. Clone de repository
git clone https://github.com/JOUW-GEBRUIKERSNAAM/zonnedak-analyzer.git
cd zonnedak-analyzer

# 2. Installeer dependencies
npm install

# 3. Start de ontwikkelserver
npm run dev
```

Open vervolgens http://localhost:5173 in je browser.

---

## 🌐 Publiceren via GitHub Pages

### Stap 1 — Repository aanmaken op GitHub

1. Ga naar [github.com](https://github.com) en log in
2. Klik op **"New repository"** (groene knop rechtsboven)
3. Geef de repository de naam: `zonnedak-analyzer`
4. Kies **Public** (verplicht voor gratis GitHub Pages)
5. Klik **"Create repository"**

### Stap 2 — Code uploaden

```bash
# In de projectmap (zonnedak-analyzer)
git init
git add .
git commit -m "Initial commit: ZonneDak Analyzer"
git branch -M main
git remote add origin https://github.com/JOUW-GEBRUIKERSNAAM/zonnedak-analyzer.git
git push -u origin main
```

> ⚠️ Vervang `JOUW-GEBRUIKERSNAAM` door jouw echte GitHub gebruikersnaam!

### Stap 3 — GitHub Pages activeren

1. Ga naar je repository op GitHub
2. Klik op **"Settings"** (tandwiel icoon, bovenaan)
3. Scroll in het linkermenu naar **"Pages"**
4. Onder **"Source"**, selecteer: **"GitHub Actions"**
5. Klik **"Save"**

### Stap 4 — Wachten op deployment

- Ga naar het tabblad **"Actions"** in je repository
- Je ziet een workflow "Deploy ZonneDak naar GitHub Pages" draaien
- Na ±2 minuten is de site live op:

```
https://JOUW-GEBRUIKERSNAAM.github.io/zonnedak-analyzer/
```

### Stap 5 — Repository naam aanpassen (optioneel)

Als je de repository een andere naam geeft (bv. `mijn-solar-app`), pas dan ook `vite.config.js` aan:

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: '/mijn-solar-app/',  // ← Aanpassen naar jouw repository naam
})
```

Commit en push daarna opnieuw.

---

## 🔄 Updates publiceren

Na elke aanpassing doe je:

```bash
git add .
git commit -m "Beschrijving van de aanpassing"
git push
```

GitHub Actions bouwt en publiceert automatisch.

---

## ⚙️ Configuratie

### Vite config (`vite.config.js`)

```js
export default defineConfig({
  plugins: [react()],
  base: '/zonnedak-analyzer/',  // Naam van jouw GitHub repository
})
```

### Producten aanpassen (`src/App.jsx`)

- **Panelen**: zoek naar `DEFAULT_PANELS` — voeg toe of pas aan
- **AlphaESS omvormers**: zoek naar `DEFAULT_INVERTERS`
- **Batterijen**: zoek naar `DEFAULT_BATTERIES`
- **Energieprijs**: zoek naar `0.28` (€/kWh) en pas aan

---

## 📦 Gebruikte technologieën

| Technologie | Gebruik |
|---|---|
| React 18 | UI framework |
| Vite 5 | Build tool |
| Leaflet 1.9 | Kaart |
| DHM Vlaanderen WMS | LiDAR hoogtedata |
| Nominatim/OSM | Adreszoeker |
| Anthropic Claude API | AI analyse |
| GitHub Actions | CI/CD deployment |
| GitHub Pages | Hosting |

---

## 📊 Databronnen

- **Digitaal Hoogtemodel Vlaanderen II (DHMV II)** — Agentschap Digitaal Vlaanderen
  - DSM (Digitaal Oppervlaktemodel) — 1m resolutie
  - DTM (Digitaal Terreinmodel) — 1m resolutie  
  - LiDAR inwinning 2013–2015
  - [Meer info](https://overheid.vlaanderen.be/informatie-vlaanderen/producten-diensten/digitaal-hoogtemodel-dhmv)
- **OpenStreetMap** via Nominatim — adreszoeker
- **AlphaESS** — productspecificaties SMILE-G3 generatie

---

## ⚠️ Disclaimer

De berekeningen zijn schattingen op basis van gemiddelde waarden voor Vlaanderen (irradiantie, energieprijzen, zelfverbruik). Raadpleeg een erkend installateur voor een officiële offerte. Prijzen zijn richtprijzen excl. BTW en installatie.

---

## 📄 Licentie

MIT — Vrij te gebruiken, aan te passen en te distribueren.
