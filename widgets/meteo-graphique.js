/*
 * Graphique météo de la journée (utilisé par le widget Météo, dans la popin).
 *
 *   ☀️  ☁️  🌧️  …            ← le temps, heure par heure
 *   ─── courbe de température (°)
 *   ─── courbe du risque de pluie (%)
 *   7 h   9 h   11 h  …      ← les heures
 *
 * Deux graphiques l'un sous l'autre, alignés sur les mêmes heures, chacun avec sa
 * propre échelle à gauche (comme sur l'iPhone) : mélanger des ° et des % sur un même
 * graphique fait croire à des croisements de courbes qui ne veulent rien dire.
 *
 * Toucher le graphique : un trait vertical et les valeurs de l'heure touchée.
 * Dessiné en SVG "à la main" : pas de bibliothèque à charger.
 * Couleurs : variables --courbe-temp et --courbe-pluie dans css/style.css.
 */
window.Nidoo = window.Nidoo || {};

(function () {
  // Taille du dessin (le SVG s'adapte ensuite à la largeur de la popin).
  const L = 720;          // largeur
  const GAUCHE = 46;      // place pour les graduations à gauche
  const DROITE = 18;
  const ICONES_H = 40;    // rangée d'icônes
  const TEMP_HAUT = 80;   // haut du graphique des températures (sous les icônes et le titre)
  const TEMP_H = 170;     // hauteur du graphique des températures
  const PLUIE_HAUT = TEMP_HAUT + TEMP_H + 40;
  const PLUIE_H = 100;
  const H = PLUIE_HAUT + PLUIE_H + 30; // + les heures en bas

  const largeurUtile = L - GAUCHE - DROITE;

  // Un pas "rond" pour les graduations : 1, 2, 5, 10…
  function pasRond(etendue, nombre) {
    const brut = etendue / nombre;
    const puissance = Math.pow(10, Math.floor(Math.log10(brut)));
    for (const m of [1, 2, 5, 10]) if (m * puissance >= brut) return m * puissance;
    return 10 * puissance;
  }

  /*
   * Courbe lisse qui passe par tous les points sans faire de "bosses" inventées
   * entre deux heures (méthode "monotone", la même que les graphiques d'Apple).
   */
  function courbe(points) {
    const n = points.length;
    if (n < 2) return '';
    const pentes = [];
    for (let i = 0; i < n - 1; i++) {
      pentes.push((points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]));
    }
    const t = [pentes[0]];
    for (let i = 1; i < n - 1; i++) {
      t.push(pentes[i - 1] * pentes[i] <= 0 ? 0 : (pentes[i - 1] + pentes[i]) / 2);
    }
    t.push(pentes[n - 2]);
    for (let i = 0; i < n - 1; i++) {
      if (pentes[i] === 0) {
        t[i] = 0;
        t[i + 1] = 0;
        continue;
      }
      const a = t[i] / pentes[i];
      const b = t[i + 1] / pentes[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * pentes[i];
        t[i + 1] = k * b * pentes[i];
      }
    }
    let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      const dx = (x1 - x0) / 3;
      d += ` C${(x0 + dx).toFixed(1)},${(y0 + t[i] * dx).toFixed(1)} ${(x1 - dx).toFixed(1)},${(y1 - t[i + 1] * dx).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  }

  /*
   * heures : [{ heure: 7, temp: 9.4, pluie: 25, icone: '🌧️', texte: 'Pluie' }, …]
   * options.maintenant : heure actuelle avec décimales (ex. 14.5), ou null si ce n'est pas aujourd'hui.
   * Renvoie { html, brancher(conteneur) } : brancher() active le toucher une fois le HTML affiché.
   */
  Nidoo.graphiqueMeteo = function (heures, options = {}) {
    const n = heures.length;
    const pasX = largeurUtile / (n - 1);
    const x = (i) => GAUCHE + i * pasX;

    // Échelle des températures : quelques degrés de marge, au moins 6° d'écart.
    const temps = heures.map((h) => h.temp);
    let bas = Math.floor(Math.min(...temps)) - 1;
    let haut = Math.ceil(Math.max(...temps)) + 1;
    if (haut - bas < 6) {
      const milieu = (haut + bas) / 2;
      bas = Math.floor(milieu - 3);
      haut = Math.ceil(milieu + 3);
    }
    const pasT = pasRond(haut - bas, 3);
    bas = Math.floor(bas / pasT) * pasT;
    haut = Math.ceil(haut / pasT) * pasT;
    const yT = (t) => TEMP_HAUT + TEMP_H - ((t - bas) / (haut - bas)) * TEMP_H;
    const yP = (p) => PLUIE_HAUT + PLUIE_H - (p / 100) * PLUIE_H;

    let svg = '';

    // Titres des deux graphiques.
    svg += `<text class="graph-titre" x="${GAUCHE}" y="${TEMP_HAUT - 10}">Température</text>`;
    svg += `<text class="graph-titre" x="${GAUCHE}" y="${PLUIE_HAUT - 10}">Risque de pluie</text>`;

    // Graduations et lignes de fond (fines et discrètes).
    for (let v = bas; v <= haut + 0.001; v += pasT) {
      svg += `<line class="graph-grille" x1="${GAUCHE}" x2="${L - DROITE}" y1="${yT(v)}" y2="${yT(v)}"/>`;
      svg += `<text class="graph-axe" x="${GAUCHE - 8}" y="${yT(v) + 4}" text-anchor="end">${Math.round(v)}°</text>`;
    }
    for (const v of [0, 50, 100]) {
      svg += `<line class="graph-grille" x1="${GAUCHE}" x2="${L - DROITE}" y1="${yP(v)}" y2="${yP(v)}"/>`;
      svg += `<text class="graph-axe" x="${GAUCHE - 8}" y="${yP(v) + 4}" text-anchor="end">${v} %</text>`;
    }

    // Les heures en bas (une sur deux pour que ce soit lisible).
    heures.forEach((h, i) => {
      if (h.heure % 2 === 1) {
        svg += `<text class="graph-axe" x="${x(i)}" y="${H - 6}" text-anchor="middle">${h.heure} h</text>`;
      }
      // Le temps qu'il fait, heure par heure.
      svg += `<text class="graph-icone" x="${x(i)}" y="${ICONES_H - 10}" text-anchor="middle">${h.icone}</text>`;
    });

    // Trait "maintenant" (seulement pour aujourd'hui).
    const m = options.maintenant;
    if (m != null && m >= heures[0].heure && m <= heures[n - 1].heure) {
      const xm = GAUCHE + (m - heures[0].heure) * pasX;
      svg += `<line class="graph-maintenant" x1="${xm}" x2="${xm}" y1="${TEMP_HAUT}" y2="${PLUIE_HAUT + PLUIE_H}"/>`;
    }

    // Courbe de température + zone colorée dessous.
    const ptsT = heures.map((h, i) => [x(i), yT(h.temp)]);
    const ligneT = courbe(ptsT);
    svg += `<path class="graph-zone-temp" d="${ligneT} L${x(n - 1)},${TEMP_HAUT + TEMP_H} L${x(0)},${TEMP_HAUT + TEMP_H} Z"/>`;
    svg += `<path class="graph-ligne-temp" d="${ligneT}"/>`;

    // La température la plus haute : un point et sa valeur.
    const iMax = temps.indexOf(Math.max(...temps));
    svg += `<circle class="graph-point-temp" cx="${x(iMax)}" cy="${yT(temps[iMax])}" r="5"/>`;
    svg += `<text class="graph-valeur" x="${x(iMax)}" y="${yT(temps[iMax]) - 12}" text-anchor="middle">${Math.round(temps[iMax])}°</text>`;

    // Courbe de pluie + zone colorée dessous (le % ne peut pas dépasser 0–100).
    const ptsP = heures.map((h, i) => [x(i), yP(Math.max(0, Math.min(100, h.pluie ?? 0)))]);
    const ligneP = courbe(ptsP);
    svg += `<path class="graph-zone-pluie" d="${ligneP} L${x(n - 1)},${PLUIE_HAUT + PLUIE_H} L${x(0)},${PLUIE_HAUT + PLUIE_H} Z"/>`;
    svg += `<path class="graph-ligne-pluie" d="${ligneP}"/>`;

    // Repère qui suit le doigt (caché au départ).
    svg += `
      <g class="graph-repere" visibility="hidden">
        <line class="graph-repere-ligne" y1="${TEMP_HAUT}" y2="${PLUIE_HAUT + PLUIE_H}"/>
        <circle class="graph-point-temp" r="5"/>
        <circle class="graph-point-pluie" r="5"/>
      </g>
      <rect class="graph-toucher" x="${GAUCHE - pasX / 2}" y="0" width="${largeurUtile + pasX}" height="${H}"/>`;

    const pluieMax = Math.max(...heures.map((h) => h.pluie ?? 0));
    const resume = `Température de ${Math.round(Math.min(...temps))}° à ${Math.round(Math.max(...temps))}°, ` +
      `risque de pluie jusqu'à ${pluieMax} %`;

    const html = `
      <p class="graph-lecture" aria-live="polite">&nbsp;</p>
      <svg class="graph-meteo" viewBox="0 0 ${L} ${H}" role="img" aria-label="${resume}">${svg}</svg>`;

    // Active le toucher : montre les valeurs de l'heure la plus proche du doigt.
    function brancher(conteneur) {
      const dessin = conteneur.querySelector('.graph-meteo');
      const lecture = conteneur.querySelector('.graph-lecture');
      const repere = dessin.querySelector('.graph-repere');
      const [ligne, pointT, pointP] = repere.children;

      function montrer(i) {
        const h = heures[i];
        const xi = x(i);
        ligne.setAttribute('x1', xi);
        ligne.setAttribute('x2', xi);
        pointT.setAttribute('cx', xi);
        pointT.setAttribute('cy', yT(h.temp));
        pointP.setAttribute('cx', xi);
        pointP.setAttribute('cy', yP(Math.max(0, Math.min(100, h.pluie ?? 0))));
        repere.setAttribute('visibility', 'visible');
        lecture.innerHTML =
          `<strong>${h.heure} h</strong> · ${h.icone} ${h.texte} · ` +
          `<strong>${Math.round(h.temp)}°</strong> · 💧 <strong>${h.pluie ?? '–'} %</strong>`;
      }

      function suivre(e) {
        const rect = dessin.getBoundingClientRect();
        const xSvg = ((e.clientX - rect.left) / rect.width) * L;
        const i = Math.max(0, Math.min(n - 1, Math.round((xSvg - GAUCHE) / pasX)));
        montrer(i);
      }

      dessin.addEventListener('pointerdown', suivre);
      dessin.addEventListener('pointermove', suivre);

      // Au départ : l'heure actuelle (aujourd'hui) ou midi (demain).
      const depart = m != null ? Math.round(m) : 12;
      const iDepart = heures.findIndex((h) => h.heure === Math.max(heures[0].heure, Math.min(heures[n - 1].heure, depart)));
      montrer(Math.max(0, iDepart));
    }

    return { html, brancher };
  };
})();
