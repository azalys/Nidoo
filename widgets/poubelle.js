/*
 * Widget "Poubelles" (1×1) : quelle poubelle sortir ce soir (jaune ou noire).
 *
 * Réglages (⚙️) : pour chaque poubelle, les jours de ramassage, et si c'est toutes
 * les semaines ou une semaine sur deux (semaines paires ou impaires du calendrier).
 *
 * Affichage :
 *   - la veille d'un ramassage : "Ce soir" + la (ou les) poubelle(s) à sortir ;
 *   - sinon : la prochaine poubelle et son jour.
 */
(function () {
  const POUBELLES = [
    { cle: 'jaune', nom: 'Jaune', couleur: '#ffd23f', bord: '#e0ac00' },
    { cle: 'noire', nom: 'Noire', couleur: '#2b2b33', bord: '#000000' },
  ];
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  const FREQUENCES = [
    { valeur: 'toutes', libelle: 'Toutes les semaines' },
    { valeur: 'paires', libelle: 'Semaines paires seulement' },
    { valeur: 'impaires', libelle: 'Semaines impaires seulement' },
  ];

  // Numéro de la semaine dans l'année (norme ISO, celle des calendriers en France).
  function numeroSemaine(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const jour = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - jour);
    const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7);
  }

  // Cette poubelle est-elle ramassée ce jour-là ?
  function ramassee(donnees, poubelle, date) {
    const jours = donnees[poubelle.cle + '_jours'] || [];
    const jourIso = date.getDay() || 7; // 1 = lundi … 7 = dimanche
    if (!jours.includes(jourIso)) return false;
    const frequence = donnees[poubelle.cle + '_frequence'] || 'toutes';
    if (frequence === 'toutes') return true;
    const paire = numeroSemaine(date) % 2 === 0;
    return frequence === 'paires' ? paire : !paire;
  }

  function dansNJours(n) {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function bac(poubelle) {
    return `<div class="poubelle-bac" style="--bac:${poubelle.couleur};--bac-bord:${poubelle.bord}"><span>🗑️</span></div>`;
  }

  const reglages = [];
  POUBELLES.forEach((p) => {
    reglages.push({ cle: p.cle + '_jours', libelle: `Poubelle ${p.nom.toLowerCase()} : jours de ramassage`, type: 'jours' });
    reglages.push({
      cle: p.cle + '_frequence',
      libelle: `Poubelle ${p.nom.toLowerCase()} : fréquence`,
      type: 'choix',
      options: FREQUENCES,
      // Pour savoir quoi choisir : la semaine en cours (calculée à l'ouverture de Nidoo).
      aide: (() => {
        const n = numeroSemaine(new Date());
        return `Cette semaine est la semaine ${n} (${n % 2 === 0 ? 'paire' : 'impaire'}).`;
      })(),
    });
  });

  Nidoo.declarerWidget({
    type: 'poubelle',
    nom: 'Poubelles',
    icone: '🗑️',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { jaune_jours: [], jaune_frequence: 'toutes', noire_jours: [], noire_frequence: 'toutes' },
    reglages,

    afficher(zone, widget) {
      let jourAffiche = null;

      function dessiner() {
        jourAffiche = new Date().toDateString();
        const d = widget.donnees;

        // Rien de réglé ?
        if (!POUBELLES.some((p) => (d[p.cle + '_jours'] || []).length)) {
          zone.innerHTML = '<div class="poubelle"><div class="poubelle-titre">🗑️ Poubelles</div><div class="poubelle-quand">Réglez les jours avec ⚙️</div></div>';
          return;
        }

        // Demain : on la sort ce soir.
        const demain = POUBELLES.filter((p) => ramassee(d, p, dansNJours(1)));
        if (demain.length) {
          zone.innerHTML = `
            <div class="poubelle ce-soir">
              <div class="poubelle-titre">Ce soir 🌙</div>
              <div class="poubelle-bacs">${demain.map(bac).join('')}</div>
              <div class="poubelle-quand">Sortir ${demain.map((p) => 'la ' + p.nom.toLowerCase()).join(' et ')}</div>
            </div>`;
          return;
        }

        // Sinon : la prochaine (dans les 3 semaines qui viennent).
        for (let n = 2; n <= 21; n++) {
          const jour = dansNJours(n);
          const lesquelles = POUBELLES.filter((p) => ramassee(d, p, jour));
          if (lesquelles.length) {
            // On la sort la veille au soir.
            const veille = dansNJours(n - 1);
            const quand = n - 1 === 1 ? 'demain soir' : JOURS[veille.getDay()] + ' soir';
            zone.innerHTML = `
              <div class="poubelle">
                <div class="poubelle-titre">Prochaine</div>
                <div class="poubelle-bacs">${lesquelles.map(bac).join('')}</div>
                <div class="poubelle-quand">${lesquelles.map((p) => p.nom).join(' + ')} · ${quand}</div>
              </div>`;
            return;
          }
        }
        zone.innerHTML = '<div class="poubelle"><div class="poubelle-titre">🗑️ Poubelles</div><div class="poubelle-quand">Rien dans les 3 semaines</div></div>';
      }

      dessiner();
      // Toutes les 10 minutes : si on a changé de jour, on redessine.
      const minuteur = setInterval(() => new Date().toDateString() !== jourAffiche && dessiner(), 10 * 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
