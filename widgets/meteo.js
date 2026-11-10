/*
 * Widget "Météo" : aujourd'hui (petit) ou aujourd'hui + demain (moyen).
 * Toucher un jour ouvre le détail heure par heure, de 7 h à 21 h.
 * Données : Open-Meteo (https://open-meteo.com), gratuit et sans clé.
 */
(function () {
  const HEURE_DEBUT = 7;  // détail heure par heure : de 7 h…
  const HEURE_FIN = 21;   // … à 21 h

  // Codes météo (norme WMO) → icône et texte. `nuit` : lune au lieu du soleil.
  function decrire(code, nuit) {
    // La nuit : pas de soleil sur les icônes.
    if (nuit && code <= 1) return ['🌙', 'Ciel dégagé'];
    if (nuit && code === 2) return ['☁️', 'Nuageux'];
    if (nuit && code >= 80 && code <= 82) return ['🌧️', 'Averses'];
    if (code === 0) return ['☀️', 'Soleil'];
    if (code === 1) return ['🌤️', 'Beau temps'];
    if (code === 2) return ['⛅', 'Nuageux'];
    if (code === 3) return ['☁️', 'Couvert'];
    if (code === 45 || code === 48) return ['🌫️', 'Brouillard'];
    if (code >= 51 && code <= 57) return ['🌦️', 'Bruine'];
    if (code >= 61 && code <= 67) return ['🌧️', 'Pluie'];
    if (code >= 71 && code <= 77) return ['❄️', 'Neige'];
    if (code >= 80 && code <= 82) return ['🌦️', 'Averses'];
    if (code === 85 || code === 86) return ['🌨️', 'Averses de neige'];
    if (code >= 95) return ['⛈️', 'Orage'];
    return ['🌡️', ''];
  }

  const arrondi = (t) => Math.round(t) + '°';

  // Cherche les coordonnées d'une ville (une seule fois, puis gardées dans le widget).
  const trouverLieu = (ville) => Nidoo.trouverVille(ville); // voir js/widgets.js

  async function previsions(lieu) {
    const url =
      'https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=2' +
      '&current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
      '&latitude=' + lieu.latitude + '&longitude=' + lieu.longitude;
    const reponse = await fetch(url);
    if (!reponse.ok) throw new Error('Météo indisponible');
    return reponse.json();
  }

  function blocJour(numero, titre, code, temperature, min, max) {
    const [icone, texte] = decrire(code);
    return `
      <div class="meteo-jour" data-jour="${numero}" role="button" tabindex="0" aria-label="Détail de la journée">
        <div class="meteo-titre">${titre}</div>
        <div class="meteo-icone" title="${texte}">${icone}</div>
        <div class="meteo-temp">${arrondi(temperature)}</div>
        <div class="meteo-minmax">${arrondi(min)} / ${arrondi(max)}</div>
      </div>`;
  }

  Nidoo.declarerWidget({
    type: 'meteo',
    nom: 'Météo',
    icone: '🌤️',
    tailles: ['petit', 'moyen'],
    tailleParDefaut: 'moyen',
    donneesParDefaut: { ville: 'Paris' },
    reglages: [{ cle: 'ville', libelle: 'Ville', type: 'texte', exemple: 'Paris' }],

    afficher(zone, widget) {
      let arrete = false;
      let derniere = null; // dernières prévisions reçues (pour le détail)
      zone.innerHTML = '<div class="meteo"><p class="widget-message">Chargement…</p></div>';
      const boite = zone.querySelector('.meteo');

      // Toucher un jour : la météo heure par heure dans une popin.
      function ouvrirDetail(numero) {
        if (!derniere) return;
        const date = derniere.daily.time[numero]; // ex. "2026-11-10"
        const h = derniere.hourly;

        // Les heures de la journée, de 7 h à 21 h.
        const heures = [];
        h.time.forEach((t, i) => {
          const heure = Number(t.slice(11, 13));
          if (!t.startsWith(date) || heure < HEURE_DEBUT || heure > HEURE_FIN) return;
          const [icone, texte] = decrire(h.weather_code[i], h.is_day[i] === 0);
          heures.push({ heure, temp: h.temperature_2m[i], pluie: h.precipitation_probability[i], icone, texte });
        });
        if (heures.length < 2) return;

        // Le graphique (voir widgets/meteo-graphique.js).
        const maintenant = new Date();
        const graphique = Nidoo.graphiqueMeteo(heures, {
          maintenant: numero === 0 ? maintenant.getHours() + maintenant.getMinutes() / 60 : null,
        });

        // Les mêmes valeurs en tableau, repliées (pour qui préfère lire des chiffres).
        const cartes = heures.map((x) => `
            <div class="heure-carte">
              <div class="heure-heure">${x.heure} h</div>
              <div class="heure-icone" title="${x.texte}">${x.icone}</div>
              <div class="heure-temp">${arrondi(x.temp)}</div>
              <div class="heure-pluie${x.pluie >= 50 ? ' forte' : ''}">💧 ${x.pluie ?? '–'} %</div>
            </div>`).join('');

        const lieu = widget.donnees.lieu ? ' · ' + widget.donnees.lieu.nom : '';
        const contenu = Nidoo.ouvrirPopin(
          (numero === 0 ? "Météo d'aujourd'hui" : 'Météo de demain') + lieu,
          `${graphique.html}
           <details class="heures-tableau">
             <summary>Voir en tableau</summary>
             <div class="heures">${cartes}</div>
           </details>`
        );
        graphique.brancher(contenu);
      }
      zone.addEventListener('click', (e) => {
        const jour = e.target.closest('[data-jour]');
        if (jour) ouvrirDetail(Number(jour.dataset.jour));
      });

      async function mettreAJour() {
        try {
          const ville = widget.donnees.ville || 'Paris';
          let lieu = widget.donnees.lieu;
          if (!lieu || lieu.ville !== ville) {
            lieu = await trouverLieu(ville);
            widget.enregistrer({ ...widget.donnees, lieu });
          }
          const m = await previsions(lieu);
          if (arrete) return;
          const j = m.daily;
          derniere = m;
          let html = blocJour(
            0,
            widget.taille === 'petit' ? Nidoo.echapper(lieu.nom) : "Aujourd'hui",
            j.weather_code[0], m.current.temperature_2m, j.temperature_2m_min[0], j.temperature_2m_max[0]
          );
          if (widget.taille !== 'petit') {
            // Pour demain, la grande température est la plus haute de la journée.
            html += blocJour(1, 'Demain', j.weather_code[1], j.temperature_2m_max[1], j.temperature_2m_min[1], j.temperature_2m_max[1]);
          }
          boite.innerHTML = html;
        } catch (erreur) {
          if (!arrete) boite.innerHTML = '<p class="widget-message">📡 ' + Nidoo.echapper(erreur.message === 'Failed to fetch' ? 'Pas de connexion' : erreur.message) + '</p>';
        }
      }

      mettreAJour();
      const minuteur = setInterval(mettreAJour, 30 * 60 * 1000); // toutes les 30 minutes
      return () => {
        arrete = true;
        clearInterval(minuteur);
      };
    },
  });
})();
