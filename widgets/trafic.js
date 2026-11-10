/*
 * Widget "Trafic" (1×1 ou 1×2) : temps de trajet avec le trafic et heure d'arrivée prévue.
 * Le toucher ouvre la carte du trajet, colorée selon le trafic.
 * Mise à jour toutes les 15 minutes, et tout de suite avec ↻.
 *
 * Données : TomTom (offre gratuite : il faut une clé, à créer sur developer.tomtom.com),
 * et la Base Adresse Nationale pour transformer les adresses en coordonnées.
 * Carte : bibliothèque Leaflet (chargée seulement à l'ouverture) + fond de carte TomTom.
 *
 * Réglages (⚙️) : nom du trajet, adresse de départ, adresse d'arrivée, clé TomTom.
 * Sans clé, le widget montre un exemple.
 */
(function () {
  const ACTUALISER_MS = 15 * 60 * 1000;
  const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';

  // Couleur d'une portion du trajet selon le ralentissement (magnitudeOfDelay de TomTom : 0 à 4).
  const COULEURS = { fluide: '#2e9d4f', ralenti: '#f08c3a', bouchon: '#e0453a', arret: '#8e1d14' };
  const couleurRalentissement = (m) => (m >= 4 ? COULEURS.arret : m >= 3 ? COULEURS.bouchon : m >= 1 ? COULEURS.ralenti : COULEURS.fluide);

  const minutes = (secondes) => {
    const m = Math.round(secondes / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
  };
  // Espaces insécables : « 13 h 39 » ne se coupe jamais en deux lignes.
  const heure = (d) => d.getHours() + '\u00a0h\u00a0' + String(d.getMinutes()).padStart(2, '0');

  /* ---- TomTom ----------------------------------------------------------- */

  async function calculerTrajet(depart, arrivee, cle) {
    const url =
      'https://api.tomtom.com/routing/1/calculateRoute/' +
      `${depart.latitude},${depart.longitude}:${arrivee.latitude},${arrivee.longitude}/json` +
      '?traffic=true&travelMode=car&routeType=fastest&sectionType=traffic&language=fr-FR' +
      '&computeTravelTimeFor=all&key=' + encodeURIComponent(cle);
    const reponse = await fetch(url);
    if (reponse.status === 403 || reponse.status === 401) throw new Error('Clé TomTom refusée : vérifiez-la dans ⚙️');
    if (reponse.status === 429) throw new Error('Trop de demandes aujourd\'hui (limite gratuite TomTom)');
    if (!reponse.ok) throw new Error('Trajet indisponible (' + reponse.status + ')');
    const json = await reponse.json();
    const route = json.routes && json.routes[0];
    if (!route) throw new Error('Aucun trajet trouvé');

    const points = route.legs.flatMap((l) => l.points).map((p) => [p.latitude, p.longitude]);
    const bouchons = (route.sections || [])
      .filter((s) => s.sectionType === 'TRAFFIC')
      .map((s) => ({ debut: s.startPointIndex, fin: s.endPointIndex, couleur: couleurRalentissement(s.magnitudeOfDelay || 0), retard: s.delayInSeconds || 0 }));
    const r = route.summary;
    return {
      duree: r.travelTimeInSeconds,
      retard: r.trafficDelayInSeconds || 0,
      distance: r.lengthInMeters,
      arrivee: r.arrivalTime ? new Date(r.arrivalTime) : new Date(Date.now() + r.travelTimeInSeconds * 1000),
      points,
      bouchons,
      calcule: new Date(),
    };
  }

  // Exemple affiché tant qu'aucune clé n'est réglée.
  function exemple() {
    return { exemple: true, duree: 23 * 60, retard: 6 * 60, distance: 18200, arrivee: new Date(Date.now() + 23 * 60000), points: [], bouchons: [], calcule: new Date() };
  }

  /* ---- Carte (Leaflet, chargé à la demande) ----------------------------- */

  let chargementLeaflet = null;
  function chargerLeaflet() {
    if (window.L) return Promise.resolve();
    chargementLeaflet ??= new Promise((ok, echec) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET + 'leaflet.min.css';
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = LEAFLET + 'leaflet.min.js';
      script.onload = ok;
      script.onerror = () => echec(new Error('Impossible de charger la carte'));
      document.head.appendChild(script);
    });
    return chargementLeaflet;
  }

  async function dessinerCarte(conteneur, trajet, cle) {
    await chargerLeaflet();
    const carte = L.map(conteneur, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=' + encodeURIComponent(cle), {
      maxZoom: 18,
      attribution: '© TomTom, © OpenStreetMap',
    }).addTo(carte);
    // Le trajet en vert, puis les portions ralenties par-dessus.
    const contour = L.polyline(trajet.points, { color: '#ffffff', weight: 10, opacity: 0.9 }).addTo(carte);
    L.polyline(trajet.points, { color: COULEURS.fluide, weight: 6 }).addTo(carte);
    trajet.bouchons.forEach((b) => L.polyline(trajet.points.slice(b.debut, b.fin + 1), { color: b.couleur, weight: 7 }).addTo(carte));
    const marqueur = (point, emoji) =>
      L.marker(point, { icon: L.divIcon({ className: 'trafic-marqueur', html: emoji, iconSize: [34, 34] }) }).addTo(carte);
    marqueur(trajet.points[0], '🏠');
    marqueur(trajet.points[trajet.points.length - 1], '📍');
    carte.fitBounds(contour.getBounds(), { padding: [24, 24] });
    return carte;
  }

  /* ---- Le widget --------------------------------------------------------- */

  Nidoo.declarerWidget({
    type: 'trafic',
    nom: 'Trafic',
    icone: '🚗',
    tailles: ['petit', 'moyen'],
    tailleParDefaut: 'moyen',
    donneesParDefaut: { titre: 'Travail', depart: '', arrivee: '', cle: '' },
    reglages: [
      { cle: 'titre', libelle: 'Nom du trajet', type: 'texte', exemple: 'Ex. Travail, École' },
      { cle: 'depart', libelle: 'Adresse de départ', type: 'texte', exemple: 'Ex. 12 rue des Lilas, Nantes' },
      { cle: 'arrivee', libelle: 'Adresse d\'arrivée', type: 'texte', exemple: 'Ex. 3 place du Commerce, Nantes' },
      {
        cle: 'cle',
        libelle: 'Clé TomTom',
        type: 'texte',
        aide: 'Gratuite : créez un compte sur developer.tomtom.com, puis copiez la clé ("API key") du tableau de bord. ' +
          'Elle reste sur vos appareils et votre serveur, jamais dans le code.',
      },
    ],

    afficher(zone, widget) {
      let arrete = false;
      let trajet = null;
      zone.innerHTML = '<div class="trafic"><span class="widget-message">Chargement…</span></div>';
      const boite = zone.querySelector('.trafic');
      const d = () => widget.donnees;

      function dessiner(erreur) {
        const titre = Nidoo.echapper(d().titre || 'Trajet');
        const recharger = '<button class="trafic-recharger" aria-label="Actualiser le trafic">↻</button>';
        if (erreur) {
          boite.innerHTML = `<div class="trafic-entete"><span>🚗 ${titre}</span>${recharger}</div><span class="trafic-info">📡 ${Nidoo.echapper(erreur)}</span>`;
          return;
        }
        const t = trajet;
        const retard = t.retard >= 60 ? `<span class="trafic-retard">+${minutes(t.retard)}</span>` : '<span class="trafic-fluide">Fluide</span>';
        boite.innerHTML = `
          <div class="trafic-entete"><span>🚗 ${titre}</span>${recharger}</div>
          <div class="trafic-ligne"><span class="trafic-duree">${minutes(t.duree)}</span>${retard}</div>
          <div class="trafic-arrivee">${widget.taille === 'petit' ? 'Arrivée' : 'Arrivée prévue à'} <strong>${heure(t.arrivee)}</strong></div>
          <div class="trafic-info">${t.exemple ? 'Exemple · ajoutez votre clé TomTom avec ⚙️' :
            (t.distance / 1000).toFixed(1).replace('.', ',') + ' km · actualisé à ' + heure(t.calcule)}</div>`;
      }

      async function mettreAJour() {
        const { depart, arrivee, cle } = d();
        if (!cle || !depart || !arrivee) {
          trajet = exemple();
          if (!arrete) dessiner(!cle ? null : 'Réglez les adresses avec ⚙️');
          return;
        }
        boite.classList.add('charge');
        try {
          // Les coordonnées des adresses sont gardées (on ne les recherche qu'une fois).
          let lieux = d().lieux;
          if (!lieux || lieux.depart.adresse !== depart || lieux.arrivee.adresse !== arrivee) {
            lieux = { depart: await Nidoo.trouverAdresse(depart), arrivee: await Nidoo.trouverAdresse(arrivee) };
            widget.enregistrer({ ...d(), lieux });
          }
          trajet = await calculerTrajet(lieux.depart, lieux.arrivee, cle);
          if (!arrete) dessiner();
        } catch (erreur) {
          if (!arrete) dessiner(Nidoo.messageErreur(erreur));
        }
        boite.classList.remove('charge');
      }

      zone.addEventListener('click', async (e) => {
        if (e.target.closest('.trafic-recharger')) {
          e.stopPropagation();
          mettreAJour();
          return;
        }
        if (!trajet) return;
        if (trajet.exemple || !trajet.points.length) {
          Nidoo.ouvrirPopin('🚗 ' + (d().titre || 'Trajet'), '<p>La carte s\'affichera quand la clé TomTom et les deux adresses seront réglées (⚙️ en mode Modifier).</p>');
          return;
        }
        const contenu = Nidoo.ouvrirPopin(
          `🚗 ${d().titre || 'Trajet'}`,
          `<p class="trafic-resume">${minutes(trajet.duree)} · arrivée ${heure(trajet.arrivee)}${trajet.retard >= 60 ? ` · <span class="trafic-retard">+${minutes(trajet.retard)} de bouchons</span>` : ''}</p>
           <div class="trafic-carte"></div>
           <p class="trafic-legende"><i style="background:${COULEURS.fluide}"></i>Fluide <i style="background:${COULEURS.ralenti}"></i>Ralenti <i style="background:${COULEURS.bouchon}"></i>Bouchon</p>`
        );
        try {
          const carte = await dessinerCarte(contenu.querySelector('.trafic-carte'), trajet, d().cle);
          contenu.closest('dialog').addEventListener('close', () => carte.remove(), { once: true });
        } catch (erreur) {
          contenu.querySelector('.trafic-carte').innerHTML = '<p class="widget-message">📡 ' + Nidoo.echapper(erreur.message) + '</p>';
        }
      });

      mettreAJour();
      const minuteur = setInterval(mettreAJour, ACTUALISER_MS);
      return () => {
        arrete = true;
        clearInterval(minuteur);
      };
    },
  });
})();
