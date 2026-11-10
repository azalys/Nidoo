/*
 * Widget "Corvées" : qui est de corvée aujourd'hui (et demain), avec une rotation automatique.
 *
 * Réglages (⚙️) :
 *   titre      le titre affiché (par défaut "Corvées")
 *   personnes  une par ligne, dans l'ordre de la rotation
 *   rythme     comment on passe d'une personne à la suivante :
 *     'parite'   jours pairs / impairs : avec 2 personnes, la 1re les jours pairs
 *                (2, 4, 6…), la 2e les jours impairs. Attention : après le 31 vient le 1er,
 *                deux jours impairs de suite.
 *     'jour'     chaque jour à tour de rôle, sans exception
 *     'semaine'  chaque semaine à tour de rôle, changement le lundi
 */
(function () {
  const RYTHMES = [
    { valeur: 'parite', libelle: 'Jours pairs / impairs (date du mois)' },
    { valeur: 'jour', libelle: 'Chaque jour, à tour de rôle' },
    { valeur: 'semaine', libelle: 'Chaque semaine, à tour de rôle (le lundi)' },
  ];

  // Nombre de jours depuis le 1er janvier 1970 (en heure locale), pour compter sans se tromper.
  function numeroDuJour(date) {
    return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  }

  // La position, dans la liste, de la personne de corvée à cette date.
  function rang(date, rythme, nombre) {
    if (rythme === 'jour') return numeroDuJour(date) % nombre;
    if (rythme === 'semaine') {
      // Le 1er janvier 1970 était un jeudi : +3 pour que les semaines commencent le lundi.
      return Math.floor((numeroDuJour(date) + 3) / 7) % nombre;
    }
    return date.getDate() % nombre; // 'parite' : 2 % 2 = 0 → 1re personne ; 3 % 2 = 1 → 2e
  }

  function personneDuJour(donnees, date) {
    const personnes = donnees.personnes || [];
    if (personnes.length === 0) return null;
    return personnes[rang(date, donnees.rythme, personnes.length)];
  }

  Nidoo.declarerWidget({
    type: 'corvees',
    nom: 'Corvées',
    icone: '🧹',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { titre: 'Corvées', personnes: ['Emilie', 'Alice'], rythme: 'parite' },
    reglages: [
      { cle: 'titre', libelle: 'Titre', type: 'texte', exemple: 'Corvées' },
      {
        cle: 'personnes',
        libelle: 'Qui ? (une personne par ligne, dans l\'ordre)',
        type: 'liste',
        aide: 'Jours pairs / impairs : la 1re personne les jours pairs, la 2e les jours impairs.',
      },
      { cle: 'rythme', libelle: 'Ça change…', type: 'choix', options: RYTHMES },
    ],

    afficher(zone, widget) {
      let jourAffiche = null;

      function dessiner() {
        const aujourdhui = new Date();
        const demain = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + 1);
        jourAffiche = aujourdhui.toDateString();
        const qui = personneDuJour(widget.donnees, aujourdhui);
        const quiDemain = personneDuJour(widget.donnees, demain);

        zone.innerHTML = `
          <div class="corvee">
            <div class="corvee-titre">${Nidoo.echapper(widget.donnees.titre || 'Corvées')}</div>
            <div class="corvee-qui">${qui ? Nidoo.echapper(qui) : '?'}</div>
            ${qui
              ? `<div class="corvee-demain">Demain : ${Nidoo.echapper(quiDemain)}</div>`
              : '<div class="corvee-demain">Réglez avec ⚙️</div>'}
          </div>`;
      }

      dessiner();
      // Chaque minute : si on a changé de jour, on redessine.
      const minuteur = setInterval(() => new Date().toDateString() !== jourAffiche && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
