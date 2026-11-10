/*
 * Widget "Carburants" (1×1) : la station la moins chère près de chez vous.
 * Le toucher ouvre les 5 moins chères.
 *
 * Données (gratuites, sans clé) :
 *   - l'adresse → coordonnées : Base Adresse Nationale (api-adresse.data.gouv.fr) ;
 *   - les prix : données ouvertes de l'État (data.economie.gouv.fr, mises à jour en continu).
 * Les prix non mis à jour depuis plus de 7 jours sont écartés.
 *
 * Réglages : adresse, carburant, distance maximale.
 */
(function () {
  const CARBURANTS = [
    { cle: 'gazole', nom: 'Gazole' },
    { cle: 'e10', nom: 'SP95-E10' },
    { cle: 'sp95', nom: 'SP95' },
    { cle: 'sp98', nom: 'SP98' },
    { cle: 'e85', nom: 'E85' },
    { cle: 'gplc', nom: 'GPL' },
  ];
  const PRIX_TROP_VIEUX_MS = 7 * 24 * 3600 * 1000;
  const API_PRIX = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';

  async function trouverAdresse(adresse) {
    const reponse = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(adresse));
    const json = await reponse.json();
    const f = json.features && json.features[0];
    if (!f) throw new Error('Adresse introuvable');
    const [longitude, latitude] = f.geometry.coordinates;
    return { adresse, nom: f.properties.city || f.properties.label, latitude, longitude };
  }

  // Distance en km entre deux points (formule de haversine).
  function distance(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }

  async function stations(lieu, carburant, rayon) {
    const params = new URLSearchParams({
      where: `within_distance(geom, geom'POINT(${lieu.longitude} ${lieu.latitude})', ${rayon}km) and ${carburant}_prix is not null`,
      order_by: `${carburant}_prix asc`,
      select: `id,adresse,ville,geom,${carburant}_prix,${carburant}_maj`,
      limit: '30',
    });
    const reponse = await fetch(API_PRIX + '?' + params);
    if (!reponse.ok) throw new Error('Prix indisponibles');
    const json = await reponse.json();
    const maintenant = Date.now();
    return (json.results || [])
      .filter((s) => s[carburant + '_maj'] && maintenant - new Date(s[carburant + '_maj']).getTime() < PRIX_TROP_VIEUX_MS)
      .map((s) => ({
        prix: s[carburant + '_prix'],
        maj: new Date(s[carburant + '_maj']),
        adresse: s.adresse,
        ville: s.ville,
        km: distance(lieu, { latitude: s.geom.lat, longitude: s.geom.lon }),
      }))
      .slice(0, 5);
  }

  const euros = (p) => p.toFixed(3).replace('.', ',') + ' €';
  const km = (d) => (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1).replace('.', ',') + ' km');
  const titreCase = (t) => (t || '').toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase());

  function ilYa(date) {
    const minutes = Math.round((Date.now() - date) / 60000);
    if (minutes < 60) return `il y a ${minutes} min`;
    if (minutes < 48 * 60) return `il y a ${Math.round(minutes / 60)} h`;
    return `il y a ${Math.round(minutes / 1440)} jours`;
  }

  Nidoo.declarerWidget({
    type: 'carburants',
    nom: 'Carburants',
    icone: '⛽',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { adresse: '', carburant: 'gazole', rayon: '5' },
    reglages: [
      { cle: 'adresse', libelle: 'Votre adresse', type: 'texte', exemple: 'Ex. 12 rue des Lilas, Nantes' },
      { cle: 'carburant', libelle: 'Carburant', type: 'choix', options: CARBURANTS.map((c) => ({ valeur: c.cle, libelle: c.nom })) },
      {
        cle: 'rayon',
        libelle: 'Chercher jusqu\'à',
        type: 'choix',
        options: ['3', '5', '10', '20'].map((r) => ({ valeur: r, libelle: r + ' km' })),
      },
    ],

    afficher(zone, widget) {
      let arrete = false;
      let liste = [];
      zone.innerHTML = '<button class="carburant"><span class="widget-message">Chargement…</span></button>';
      const boite = zone.querySelector('.carburant');
      const nomCarburant = () => (CARBURANTS.find((c) => c.cle === widget.donnees.carburant) || CARBURANTS[0]).nom;

      async function mettreAJour() {
        const adresse = (widget.donnees.adresse || '').trim();
        if (!adresse) {
          boite.innerHTML = '<span class="carburant-titre">⛽ Carburants</span><span class="carburant-lieu">Réglez votre adresse avec ⚙️</span>';
          return;
        }
        try {
          let lieu = widget.donnees.lieu;
          if (!lieu || lieu.adresse !== adresse) {
            lieu = await trouverAdresse(adresse);
            widget.enregistrer({ ...widget.donnees, lieu });
          }
          liste = await stations(lieu, widget.donnees.carburant || 'gazole', widget.donnees.rayon || '5');
          if (arrete) return;
          const s = liste[0];
          boite.innerHTML = s
            ? `<span class="carburant-titre">⛽ ${nomCarburant()}</span>
               <span class="carburant-prix">${euros(s.prix)}</span>
               <span class="carburant-lieu">${Nidoo.echapper(titreCase(s.ville))} · ${km(s.km)}</span>`
            : `<span class="carburant-titre">⛽ ${nomCarburant()}</span><span class="carburant-lieu">Aucune station à moins de ${widget.donnees.rayon || 5} km</span>`;
        } catch (erreur) {
          if (!arrete) boite.innerHTML = '<span class="widget-message">📡 ' + Nidoo.echapper(Nidoo.messageErreur(erreur)) + '</span>';
        }
      }

      // Toucher : les 5 stations les moins chères.
      boite.addEventListener('click', () => {
        if (!liste.length) return;
        Nidoo.ouvrirPopin(
          `⛽ ${nomCarburant()} : les moins chers`,
          `<div class="carburant-liste">
             ${liste.map((s, i) => `
               <div class="carburant-station${i === 0 ? ' meilleur' : ''}">
                 <span class="carburant-rang">${i + 1}</span>
                 <span class="carburant-infos">
                   <strong>${Nidoo.echapper(titreCase(s.adresse))}</strong>
                   <small>${Nidoo.echapper(titreCase(s.ville))} · ${km(s.km)} · prix mis à jour ${ilYa(s.maj)}</small>
                 </span>
                 <span class="carburant-montant">${euros(s.prix)}</span>
               </div>`).join('')}
           </div>
           <p class="aide">Source : données ouvertes de l'État (prix-carburants.gouv.fr).</p>`
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
