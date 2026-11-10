/*
 * Widget "Humeurs" (1×1) : l'humeur du jour de chaque enfant (1 à 4).
 * Chacun touche son emoji pour en choisir un autre, quand il veut.
 * Chaque matin, tout le monde repart sur 🙂 "Normal".
 *
 * Réglages (⚙️) : les prénoms (un par ligne, 4 maximum).
 * Données : { enfants: ['Alice', 'Emilie'], humeurs: { Alice: { emoji: '😄', jour: '2026-11-10' } } }
 */
(function () {
  const HUMEURS = [
    { emoji: '😄', nom: 'Super' },
    { emoji: '🙂', nom: 'Normal' },
    { emoji: '😐', nom: 'Bof' },
    { emoji: '😢', nom: 'Triste' },
    { emoji: '😠', nom: 'En colère' },
    { emoji: '😴', nom: 'Fatigué' },
    { emoji: '🤒', nom: 'Malade' },
    { emoji: '😟', nom: 'Inquiet' },
  ];
  const PAR_DEFAUT = HUMEURS[1]; // 🙂 Normal

  const aujourdhui = () => {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  };

  Nidoo.declarerWidget({
    type: 'humeurs',
    nom: 'Humeurs',
    icone: '😊',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { enfants: ['Alice', 'Emilie'], humeurs: {} },
    reglages: [{ cle: 'enfants', libelle: 'Les enfants (un prénom par ligne, 4 maximum)', type: 'liste' }],

    afficher(zone, widget) {
      let jourAffiche = null;
      const enfants = () => (widget.donnees.enfants || []).slice(0, 4);

      // L'humeur du jour d'un enfant (🙂 si rien de choisi aujourd'hui).
      function humeur(prenom) {
        const h = (widget.donnees.humeurs || {})[prenom];
        return h && h.jour === aujourdhui() ? h.emoji : PAR_DEFAUT.emoji;
      }

      function dessiner() {
        jourAffiche = aujourdhui();
        const liste = enfants();
        if (liste.length === 0) {
          zone.innerHTML = '<div class="humeurs"><p class="widget-message">Ajoutez les enfants avec ⚙️</p></div>';
          return;
        }
        zone.innerHTML = `
          <div class="humeurs nb-${liste.length}">
            ${liste.map((p, i) => `
              <button class="humeur" data-index="${i}" aria-label="Humeur de ${Nidoo.echapper(p)}">
                <span class="humeur-emoji">${humeur(p)}</span>
                <span class="humeur-prenom">${Nidoo.echapper(p)}</span>
              </button>`).join('')}
          </div>`;
      }

      // Toucher un enfant : choisir son humeur.
      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('.humeur');
        if (!bouton) return;
        const prenom = enfants()[Number(bouton.dataset.index)];
        const actuelle = humeur(prenom);
        const contenu = Nidoo.ouvrirPopin(
          `Comment ça va, ${prenom} ?`,
          `<div class="humeurs-choix">
             ${HUMEURS.map((h) => `
               <button class="humeur-choix${h.emoji === actuelle ? ' actuelle' : ''}" data-emoji="${h.emoji}">
                 <span>${h.emoji}</span>${h.nom}
               </button>`).join('')}
           </div>`
        );
        contenu.querySelectorAll('.humeur-choix').forEach((choix) =>
          choix.addEventListener('click', () => {
            widget.enregistrer({
              ...widget.donnees,
              humeurs: { ...(widget.donnees.humeurs || {}), [prenom]: { emoji: choix.dataset.emoji, jour: aujourdhui() } },
            });
            contenu.closest('dialog').close();
            dessiner();
          })
        );
      });

      dessiner();
      // Toutes les 10 minutes : si on a changé de jour, tout le monde repart sur 🙂.
      const minuteur = setInterval(() => aujourdhui() !== jourAffiche && dessiner(), 10 * 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
