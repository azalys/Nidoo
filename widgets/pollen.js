/*
 * Widget "Pollen et air" (1×1) : qualité de l'air et pollen, aujourd'hui et demain.
 * Le toucher ouvre le détail par pollen.
 * Données : Open-Meteo (service "air-quality", d'après Copernicus/CAMS), gratuit et sans clé.
 * Le pollen n'est prévu qu'en Europe et pendant la saison (hors saison : "aucun").
 *
 * Réglages : la ville, et le pollen à surveiller (ou tous).
 */
(function () {
  const POLLENS = [
    { cle: 'grass_pollen', nom: 'Graminées', emoji: '🌾' },
    { cle: 'birch_pollen', nom: 'Bouleau', emoji: '🌳' },
    { cle: 'alder_pollen', nom: 'Aulne', emoji: '🌲' },
    { cle: 'olive_pollen', nom: 'Olivier', emoji: '🫒' },
    { cle: 'mugwort_pollen', nom: 'Armoise', emoji: '🌿' },
    { cle: 'ragweed_pollen', nom: 'Ambroisie', emoji: '🌼' },
  ];

  // Indice européen de qualité de l'air (paliers officiels de l'Agence européenne de l'environnement).
  const AIR = [
    { max: 20, nom: 'Bon', couleur: '#50c878' },
    { max: 40, nom: 'Correct', couleur: '#a3d65c' },
    { max: 60, nom: 'Moyen', couleur: '#f5c542' },
    { max: 80, nom: 'Dégradé', couleur: '#f08c3a' },
    { max: 100, nom: 'Mauvais', couleur: '#e0453a' },
    { max: Infinity, nom: 'Très mauvais', couleur: '#8e3a8e' },
  ];

  /*
   * Niveau de pollen (grains par m³ d'air). Il n'existe pas de seuil unique pour tous
   * les pollens : ce sont des repères simples, à ajuster si besoin.
   */
  const POLLEN = [
    { max: 1, nom: 'Aucun', couleur: '#b9c2cc' },
    { max: 10, nom: 'Faible', couleur: '#50c878' },
    { max: 50, nom: 'Moyen', couleur: '#f5c542' },
    { max: 200, nom: 'Élevé', couleur: '#f08c3a' },
    { max: Infinity, nom: 'Très élevé', couleur: '#e0453a' },
  ];
  const niveau = (echelle, valeur) => echelle.find((n) => valeur < n.max) || echelle[echelle.length - 1];

  async function donnees(lieu) {
    const url =
      'https://air-quality-api.open-meteo.com/v1/air-quality?timezone=auto&forecast_days=2' +
      '&hourly=european_aqi,' + POLLENS.map((p) => p.cle).join(',') +
      '&latitude=' + lieu.latitude + '&longitude=' + lieu.longitude;
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error('Données indisponibles');
    return reponse.json();
  }

  // Valeur la plus haute de la journée (de 7 h à 21 h), pour aujourd'hui (0) ou demain (1).
  function maxDuJour(h, cle, numeroJour) {
    const jours = [...new Set(h.time.map((t) => t.slice(0, 10)))];
    let max = null;
    h.time.forEach((t, i) => {
      const heure = Number(t.slice(11, 13));
      if (t.startsWith(jours[numeroJour]) && heure >= 7 && heure <= 21 && h[cle][i] != null) {
        max = Math.max(max ?? 0, h[cle][i]);
      }
    });
    return max;
  }

  Nidoo.declarerWidget({
    type: 'pollen',
    nom: 'Pollen et air',
    icone: '🌼',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { ville: 'Paris', pollen: 'tous' },
    reglages: [
      { cle: 'ville', libelle: 'Ville', type: 'texte', exemple: 'Paris' },
      {
        cle: 'pollen',
        libelle: 'Pollen à surveiller',
        type: 'choix',
        options: [{ valeur: 'tous', libelle: 'Tous (le plus élevé)' }].concat(POLLENS.map((p) => ({ valeur: p.cle, libelle: p.emoji + ' ' + p.nom }))),
      },
    ],

    afficher(zone, widget) {
      let arrete = false;
      let derniere = null;
      zone.innerHTML = '<button class="pollen"><span class="widget-message">Chargement…</span></button>';
      const boite = zone.querySelector('.pollen');

      // Niveau de pollen d'un jour : celui choisi, ou le plus élevé de tous.
      function pollenDuJour(h, jour) {
        const choix = widget.donnees.pollen && widget.donnees.pollen !== 'tous' ? [widget.donnees.pollen] : POLLENS.map((p) => p.cle);
        return Math.max(0, ...choix.map((c) => maxDuJour(h, c, jour) ?? 0));
      }

      function ligne(titre, h, jour) {
        const air = niveau(AIR, maxDuJour(h, 'european_aqi', jour) ?? 0);
        const pollen = niveau(POLLEN, pollenDuJour(h, jour));
        return `
          <span class="pollen-jour">
            <span class="pollen-quand">${titre}</span>
            <span class="pollen-mesure"><i style="background:${air.couleur}"></i>Air · ${air.nom}</span>
            <span class="pollen-mesure"><i style="background:${pollen.couleur}"></i>Pollen · ${pollen.nom}</span>
          </span>`;
      }

      async function mettreAJour() {
        try {
          const ville = widget.donnees.ville || 'Paris';
          let lieu = widget.donnees.lieu;
          if (!lieu || lieu.ville !== ville) {
            lieu = await Nidoo.trouverVille(ville);
            widget.enregistrer({ ...widget.donnees, lieu });
          }
          derniere = await donnees(lieu);
          if (arrete) return;
          const h = derniere.hourly;
          boite.innerHTML = `<span class="pollen-titre">🌼 ${Nidoo.echapper(lieu.nom)}</span>` + ligne("Aujourd'hui", h, 0) + ligne('Demain', h, 1);
        } catch (erreur) {
          if (!arrete) boite.innerHTML = '<span class="widget-message">📡 ' + Nidoo.echapper(Nidoo.messageErreur(erreur)) + '</span>';
        }
      }

      // Toucher : le détail par pollen.
      boite.addEventListener('click', () => {
        if (!derniere) return;
        const h = derniere.hourly;
        const cellule = (echelle, v) => {
          const n = niveau(echelle, v ?? 0);
          return `<td><i style="background:${n.couleur}"></i>${n.nom}</td>`;
        };
        Nidoo.ouvrirPopin(
          '🌼 Pollen et qualité de l\'air',
          `<table class="pollen-tableau">
             <thead><tr><th></th><th>Aujourd'hui</th><th>Demain</th></tr></thead>
             <tbody>
               <tr><th>💨 Qualité de l'air</th>${cellule(AIR, maxDuJour(h, 'european_aqi', 0))}${cellule(AIR, maxDuJour(h, 'european_aqi', 1))}</tr>
               ${POLLENS.map((p) => `<tr><th>${p.emoji} ${p.nom}</th>${cellule(POLLEN, maxDuJour(h, p.cle, 0))}${cellule(POLLEN, maxDuJour(h, p.cle, 1))}</tr>`).join('')}
             </tbody>
           </table>
           <p class="aide">Valeur la plus haute entre 7 h et 21 h. Source : Open-Meteo / Copernicus.</p>`
        );
      });

      mettreAJour();
      const minuteur = setInterval(mettreAJour, 60 * 60 * 1000); // toutes les heures
      return () => {
        arrete = true;
        clearInterval(minuteur);
      };
    },
  });
})();
