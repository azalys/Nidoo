/*
 * Widget "Humeurs" : l'humeur du jour de chacun (enfants ou parents), de 0 à 5.
 *
 *   - Réglages (⚙️) : les prénoms de ceux qui donnent leur humeur (un par ligne, 6 maximum).
 *   - Chaque jour à minuit, tout le monde repart sur « Choisis ton humeur ».
 *   - Toucher son prénom : choisir son humeur, de 😭/😡 (0, la pire) à 😄 (5, la meilleure),
 *     et en bas « Voir mes humeurs du mois » : la courbe des humeurs jour par jour.
 *
 * Les données sont les mêmes pour tous les widgets Humeurs (côté enfant et côté parents,
 * et sur les appareils reliés) : elles sont rangées une seule fois, dans etat.listes.humeurs
 * (voir js/app.js), et chaque widget n'indique que { liste: 'humeurs' }.
 * Données : { enfants: ['Léa', 'Papa'],
 *             historique: { Léa: { '2026-11-20': { note: 4, emoji: '🙂', maj: 1700000000000 } } } }
 * (la clé "enfants" garde son ancien nom pour ne pas perdre les prénoms déjà réglés).
 */
(function () {
  // De la meilleure (5) à la pire (0). Deux humeurs valent 0 : les pleurs et la colère.
  const HUMEURS = [
    { emoji: '😄', nom: 'Super', note: 5 },
    { emoji: '🙂', nom: 'Bien', note: 4 },
    { emoji: '😐', nom: 'Bof', note: 3 },
    { emoji: '😕', nom: 'Pas terrible', note: 2 },
    { emoji: '😢', nom: 'Triste', note: 1 },
    { emoji: '😭', nom: 'En pleurs', note: 0 },
    { emoji: '😡', nom: 'En colère', note: 0 },
  ];
  // L'emoji qui représente chaque note sur la courbe (axe de gauche).
  const EMOJI_NOTE = ['😭', '😢', '😕', '😐', '🙂', '😄'];
  const MAXIMUM = 6;
  const GARDER_MOIS = 13; // l'historique est gardé un peu plus d'un an
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  const cleJour = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const aujourdhui = () => cleJour(new Date());
  const virgule = (n) => String(Math.round(n * 10) / 10).replace('.', ',');

  /* ---- La courbe du mois (SVG) ----------------------------------------- */

  function courbe(jours, annee, mois) {
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const L = 640;
    const H = 300;
    const G = 46;  // marge gauche (emojis de l'axe)
    const D = 14;
    const HAUT = 18;
    const BAS = 34; // numéros des jours
    const x = (j) => G + ((j - 1) * (L - G - D)) / Math.max(1, nbJours - 1);
    const y = (note) => HAUT + ((5 - note) * (H - HAUT - BAS)) / 5;

    let svg = '';
    // Lignes horizontales et emojis de l'axe (0 en bas, 5 en haut).
    for (let n = 0; n <= 5; n++) {
      svg += `<line x1="${G}" x2="${L - D}" y1="${y(n)}" y2="${y(n)}" class="humeur-grille"/>`;
      svg += `<text x="${G - 12}" y="${y(n)}" class="humeur-axe" text-anchor="end" dominant-baseline="central">${EMOJI_NOTE[n]}</text>`;
    }
    // Numéros des jours (tous les 5 jours, et le dernier).
    for (let j = 1; j <= nbJours; j++) {
      if (j === 1 || j % 5 === 0 || j === nbJours) {
        svg += `<text x="${x(j)}" y="${H - 10}" class="humeur-jour" text-anchor="middle">${j}</text>`;
      }
    }
    // Aujourd'hui (si c'est ce mois-ci).
    const maintenant = new Date();
    if (maintenant.getFullYear() === annee && maintenant.getMonth() === mois) {
      const xa = x(maintenant.getDate());
      svg += `<line x1="${xa}" x2="${xa}" y1="${HAUT - 6}" y2="${H - BAS + 4}" class="humeur-aujourdhui"/>`;
    }
    // La courbe : trait plein d'un jour au lendemain, pointillé s'il manque des jours entre deux.
    const points = jours.map(([j, h]) => [x(j), y(h.note), j, h]);
    for (let i = 1; i < points.length; i++) {
      const [x1, y1, j1] = points[i - 1];
      const [x2, y2, j2] = points[i];
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="humeur-trait${j2 - j1 > 1 ? ' trou' : ''}"/>`;
    }
    points.forEach(([px, py, j, h]) => {
      svg += `<circle cx="${px}" cy="${py}" r="13" class="humeur-point"><title>${j} : ${h.emoji} (${h.note}/5)</title></circle>`;
      svg += `<text x="${px}" y="${py}" class="humeur-point-emoji" text-anchor="middle" dominant-baseline="central" aria-hidden="true">${h.emoji}</text>`;
    });
    return { svg: `<svg class="humeur-courbe" viewBox="0 0 ${L} ${H}" role="img">${svg}</svg>`, nbJours };
  }

  Nidoo.declarerWidget({
    type: 'humeurs',
    nom: 'Humeurs',
    icone: '😊',
    tailles: ['petit', 'moyen'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { enfants: [], historique: {} },
    reglages: [
      {
        cle: 'enfants',
        libelle: 'Qui donne son humeur ? (un prénom par ligne, 6 maximum)',
        type: 'liste',
        aide: 'Enfants ou parents, sans distinction. Au-delà de 4 personnes, choisissez la taille 1×2.',
      },
    ],

    afficher(zone, widget) {
      let jourAffiche = null;
      const personnes = () => (widget.donnees.enfants || []).map((p) => p.trim()).filter(Boolean).slice(0, MAXIMUM);
      const historique = (prenom) => (widget.donnees.historique || {})[prenom] || {};
      const humeurDuJour = (prenom) => historique(prenom)[aujourdhui()] || null;

      function dessiner() {
        jourAffiche = aujourdhui();
        const liste = personnes();
        if (liste.length === 0) {
          zone.innerHTML = '<div class="humeurs"><p class="widget-message">Ajoutez les prénoms avec ⚙️</p></div>';
          return;
        }
        zone.innerHTML = `
          <div class="humeurs nb-${liste.length}">
            ${liste.map((p, i) => {
              const h = humeurDuJour(p);
              return `<button class="humeur${h ? '' : ' a-choisir'}" data-index="${i}"
                  aria-label="${Nidoo.echapper(p)} : ${h ? h.emoji + ' ' + h.note + ' sur 5' : 'choisis ton humeur'}">
                <span class="humeur-emoji" aria-hidden="true">${h ? h.emoji : '❔'}</span>
                <span class="humeur-prenom">${Nidoo.echapper(p)}</span>
                ${h ? '' : '<span class="humeur-consigne">Choisis ton humeur</span>'}
              </button>`;
            }).join('')}
          </div>`;
      }

      function enregistrer(prenom, humeur) {
        const tout = { ...(widget.donnees.historique || {}) };
        const jours = { ...(tout[prenom] || {}) };
        jours[aujourdhui()] = { note: humeur.note, emoji: humeur.emoji, maj: Date.now() };
        // On oublie ce qui a plus d'un an.
        const limite = new Date();
        limite.setMonth(limite.getMonth() - GARDER_MOIS);
        Object.keys(jours).forEach((j) => j < cleJour(limite) && delete jours[j]);
        tout[prenom] = jours;
        widget.enregistrer({ ...widget.donnees, historique: tout });
      }

      // Toucher un prénom : choisir son humeur, ou voir ses humeurs du mois.
      function choisir(prenom) {
        const actuelle = humeurDuJour(prenom);
        const contenu = Nidoo.ouvrirPopin(
          `Comment ça va, ${prenom} ?`,
          `<div class="humeurs-choix">
             ${HUMEURS.map((h) => `
               <button type="button" class="humeur-choix${actuelle && actuelle.emoji === h.emoji ? ' actuelle' : ''}" data-emoji="${h.emoji}"
                       aria-label="${h.nom}, ${h.note} sur 5">
                 <span aria-hidden="true">${h.emoji}</span>${h.nom}
               </button>`).join('')}
           </div>
           <button type="button" class="bouton humeurs-mois">📈 Voir mes humeurs du mois</button>`
        );
        contenu.querySelectorAll('.humeur-choix').forEach((b) =>
          b.addEventListener('click', () => {
            enregistrer(prenom, HUMEURS.find((h) => h.emoji === b.dataset.emoji));
            contenu.closest('dialog').close();
            dessiner();
          })
        );
        contenu.querySelector('.humeurs-mois').addEventListener('click', () => voirMois(prenom, new Date().getFullYear(), new Date().getMonth()));
      }

      // La popin des humeurs du mois : la courbe, la moyenne, et ‹ › pour changer de mois.
      function voirMois(prenom, annee, mois) {
        const h = historique(prenom);
        const prefixe = annee + '-' + String(mois + 1).padStart(2, '0') + '-';
        const jours = Object.keys(h)
          .filter((j) => j.startsWith(prefixe))
          .sort()
          .map((j) => [Number(j.slice(8)), h[j]]);
        const { svg, nbJours } = courbe(jours, annee, mois);
        const moyenne = jours.length ? jours.reduce((s, [, x]) => s + x.note, 0) / jours.length : null;
        const maintenant = new Date();
        const estCeMois = annee === maintenant.getFullYear() && mois === maintenant.getMonth();
        const resume = moyenne === null
          ? 'Aucune humeur ce mois-ci.'
          : `Moyenne : ${EMOJI_NOTE[Math.round(moyenne)]} ${virgule(moyenne)} / 5 · ${jours.length} jour${jours.length > 1 ? 's' : ''} sur ${estCeMois ? maintenant.getDate() : nbJours}`;

        const contenu = Nidoo.ouvrirPopin(
          `📈 Les humeurs de ${prenom}`,
          `<div class="humeurs-mois-nav">
             <button type="button" class="bouton" data-mois="-1" aria-label="Mois précédent">‹</button>
             <span class="humeurs-mois-titre">${MOIS[mois]} ${annee}</span>
             <button type="button" class="bouton" data-mois="1" aria-label="Mois suivant" ${estCeMois ? 'disabled' : ''}>›</button>
           </div>
           <div class="humeurs-graphique">${svg}</div>
           <p class="humeurs-resume">${resume}</p>
           <p class="visuellement-cache">${jours.map(([j, x]) => `${j} ${MOIS[mois]} : ${x.note} sur 5`).join(' ; ')}</p>`
        );
        contenu.querySelector('.humeur-courbe').setAttribute('aria-label', `Courbe des humeurs de ${prenom} en ${MOIS[mois]} ${annee}. ${resume}`);
        contenu.querySelectorAll('[data-mois]').forEach((b) =>
          b.addEventListener('click', () => {
            const d = new Date(annee, mois + Number(b.dataset.mois), 1);
            voirMois(prenom, d.getFullYear(), d.getMonth());
          })
        );
      }

      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('.humeur');
        if (bouton) choisir(personnes()[Number(bouton.dataset.index)]);
      });

      dessiner();
      // Chaque minute : à minuit, tout le monde repart sur « Choisis ton humeur ».
      const minuteur = setInterval(() => aujourdhui() !== jourAffiche && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },

    /*
     * Partage entre appareils : si deux personnes donnent leur humeur en même temps sur deux
     * appareils, on garde les deux (jour par jour, personne par personne, le plus récent gagne).
     */
    fusionner(a, b) {
      const historique = {};
      [a.historique || {}, b.historique || {}].forEach((h) =>
        Object.entries(h).forEach(([prenom, jours]) => {
          historique[prenom] = historique[prenom] || {};
          Object.entries(jours).forEach(([jour, valeur]) => {
            const deja = historique[prenom][jour];
            if (!deja || (valeur.maj || 0) > (deja.maj || 0)) historique[prenom][jour] = valeur;
          });
        })
      );
      return { ...a, ...b, historique };
    },
  });
})();
