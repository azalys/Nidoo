/*
 * Widget "Compte à rebours" (1×1) : "Vacances dans 12 jours", "Anniversaire de Léa dans 5 dodos".
 *
 * Réglages (⚙️) : titre, emoji, date, une seule fois ou chaque année (anniversaire),
 * et l'unité : jours ou dodos (pour les plus petits : le nombre de nuits).
 */
(function () {
  // Nombre de jours entre aujourd'hui et une date "AAAA-MM-JJ" (en heure locale).
  function joursJusqua(dateTexte) {
    const [a, m, j] = dateTexte.split('-').map(Number);
    const maintenant = new Date();
    const aujourdhui = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    return Math.round((Date.UTC(a, m - 1, j) - aujourdhui) / 86400000);
  }

  // Pour un anniversaire : la prochaine fois que ce jour revient (aujourd'hui compris).
  function prochaineFois(dateTexte) {
    const [, m, j] = dateTexte.split('-');
    const annee = new Date().getFullYear();
    const cetteAnnee = `${annee}-${m}-${j}`;
    return joursJusqua(cetteAnnee) >= 0 ? cetteAnnee : `${annee + 1}-${m}-${j}`;
  }

  Nidoo.declarerWidget({
    type: 'compte',
    nom: 'Compte à rebours',
    icone: '⏳',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { titre: 'Vacances', emoji: '🏖️', date: '', repeter: 'non', unite: 'jours' },
    reglages: [
      { cle: 'titre', libelle: 'Quoi ?', type: 'texte', exemple: 'Ex. Vacances, Anniversaire de Léa' },
      { cle: 'emoji', libelle: 'Emoji', type: 'texte', exemple: 'Ex. 🏖️ 🎂 🎄' },
      { cle: 'date', libelle: 'Quand ?', type: 'date' },
      {
        cle: 'repeter',
        libelle: 'Ça revient…',
        type: 'choix',
        options: [
          { valeur: 'non', libelle: 'Une seule fois' },
          { valeur: 'an', libelle: 'Chaque année (anniversaire, Noël…)' },
        ],
      },
      {
        cle: 'unite',
        libelle: 'Compter en…',
        type: 'choix',
        options: [
          { valeur: 'jours', libelle: 'Jours' },
          { valeur: 'dodos', libelle: 'Dodos (nuits)' },
        ],
      },
    ],

    afficher(zone, widget) {
      let jourAffiche = null;

      function dessiner() {
        jourAffiche = new Date().toDateString();
        const d = widget.donnees;
        const emoji = Nidoo.echapper(d.emoji || '⏳');
        const titre = Nidoo.echapper(d.titre || 'Compte à rebours');

        if (!d.date) {
          zone.innerHTML = `<div class="compte"><div class="compte-emoji">${emoji}</div>
            <div class="compte-titre">${titre}</div><div class="compte-unite">Réglez la date avec ⚙️</div></div>`;
          return;
        }

        const cible = d.repeter === 'an' ? prochaineFois(d.date) : d.date;
        const n = joursJusqua(cible);
        const unite = d.unite === 'dodos' ? (n > 1 ? 'dodos' : 'dodo') : n > 1 ? 'jours' : 'jour';

        let milieu;
        if (n === 0) {
          milieu = `<div class="compte-jour-j">C'est aujourd'hui ! 🎉</div>`;
        } else if (n < 0) {
          milieu = `<div class="compte-unite">C'était il y a ${-n} jour${-n > 1 ? 's' : ''}</div>`;
        } else {
          milieu = `<div class="compte-nombre">${n}</div><div class="compte-unite">${unite}</div>`;
        }
        zone.innerHTML = `
          <div class="compte${n === 0 ? ' jour-j' : ''}">
            <div class="compte-emoji">${emoji}</div>
            ${milieu}
            <div class="compte-titre">${titre}</div>
          </div>`;
      }

      dessiner();
      // Toutes les 10 minutes : si on a changé de jour, on redessine.
      const minuteur = setInterval(() => new Date().toDateString() !== jourAffiche && dessiner(), 10 * 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
