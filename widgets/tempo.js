/*
 * Widget "Tempo EDF" : la couleur du moment (petit), ou d'aujourd'hui et de demain (moyen),
 * avec "heures creuses / heures pleines" en ce moment.
 * Données : https://www.api-couleur-tempo.fr, gratuit et sans clé.
 * La couleur de demain est publiée par RTE vers 11 h ; avant, elle est "pas encore connue".
 *
 * Toucher une couleur : un petit voyage dans le temps, avec des conseils pour la journée.
 *   🔵 Bleu  → bienvenue en 2026 : on vit comme d'habitude ;
 *   ⚪ Blanc → bienvenue en 1830 : on y va doucement ;
 *   🔴 Rouge → bienvenue en l'an 820 : retour au Moyen Âge.
 */
(function () {
  const API = 'https://www.api-couleur-tempo.fr/api';

  // Code couleur de l'API → nom et couleur de la pastille.
  const COULEURS_TEMPO = {
    0: { nom: 'Pas encore connue', pastille: 'rgba(255,255,255,0.35)', symbole: '?' },
    1: { nom: 'Bleu', pastille: '#2f6fe0', symbole: '' },
    2: { nom: 'Blanc', pastille: '#ffffff', symbole: '' },
    3: { nom: 'Rouge', pastille: '#e0323c', symbole: '' },
  };

  // Les conseils de chaque couleur (à adapter librement).
  const CONSEILS = {
    1: {
      epoque: '📱 Bienvenue en 2026',
      resume: 'Jour bleu : l\'électricité est au meilleur prix. On vit comme d\'habitude !',
      conseils: [
        ['🧺', 'Lave-linge, lave-vaisselle, sèche-linge : de préférence après 22 h (heures creuses), avec le départ différé.'],
        ['💡', 'Comme d\'habitude : on éteint la lumière en quittant une pièce.'],
        ['🍕', 'C\'est le bon jour pour le four, le repassage, la raclette… et pour recharger la voiture électrique la nuit.'],
        ['🗓️', 'Un jour rouge s\'annonce ? On prend de l\'avance : lessives faites, plats cuisinés à réchauffer.'],
      ],
    },
    2: {
      epoque: '🎩 Bienvenue en 1830',
      resume: 'Jour blanc : l\'électricité coûte plus cher. On y va doucement.',
      conseils: [
        ['🧺', 'Les machines attendent le prochain jour bleu si c\'est possible. Sinon, on les lance après 22 h.'],
        ['📺', 'Un peu moins d\'écrans : une partie de cartes, un livre, une balade.'],
        ['🌡️', 'Le chauffage à 19 °C, et un pull de plus.'],
        ['🍳', 'Les plaques ou le micro-ondes plutôt que le four.'],
        ['🚿', 'Des douches courtes plutôt qu\'un bain.'],
      ],
    },
    3: {
      epoque: '🏰 Bienvenue en l\'an 820',
      resume: 'Jour rouge : de 6 h à 22 h, l\'électricité coûte plusieurs fois plus cher. Retour au Moyen Âge !',
      conseils: [
        ['🧽', 'Vaisselle à la main, comme les moines de l\'abbaye.'],
        ['🔌', 'On coupe les multiprises et tout ce qui reste en veille.'],
        ['🥪', 'Sandwichs, salades, pique-nique… ou un repas dehors. Le four et les plaques se reposent.'],
        ['🧥', 'Chauffage baissé (17-18 °C), pulls et plaids pour tout le monde.'],
        ['🔦', 'Lampes à piles plutôt que bougies : avec les enfants, c\'est plus sûr.'],
        ['🌙', 'Après 22 h, l\'électricité redevient plus abordable : les machines qui ne peuvent vraiment pas attendre, c\'est à ce moment-là.'],
      ],
    },
    0: {
      epoque: '🔮 L\'avenir n\'est pas encore écrit',
      resume: 'La couleur de demain est publiée vers 11 h (parfois un peu plus tard). Revenez voir !',
      conseils: [],
    },
  };

  function ouvrirConseils(code, titre) {
    const c = COULEURS_TEMPO[code] || COULEURS_TEMPO[0];
    const t = CONSEILS[code] || CONSEILS[0];
    Nidoo.ouvrirPopin(
      `⚡ ${titre} : ${code ? 'jour ' + c.nom.toLowerCase() : 'couleur pas encore connue'}`,
      `<div class="tempo-conseils tempo-code-${code || 0}">
         <div class="tempo-epoque">
           <span class="tempo-pastille-mini" style="background:${c.pastille}" aria-hidden="true"></span>
           <div><strong>${t.epoque}</strong><p>${t.resume}</p></div>
         </div>
         ${t.conseils.length ? `<ul>${t.conseils.map(([e, texte]) => `<li><span aria-hidden="true">${e}</span>${texte}</li>`).join('')}</ul>` : ''}
         <p class="aide">Heures creuses : de 22 h à 6 h, tous les jours. Chaque année, environ 300 jours bleus,
           43 blancs et 22 rouges ; les jours rouges tombent en semaine, entre novembre et mars.</p>
       </div>`
    );
  }

  async function lire(chemin) {
    const reponse = await fetch(API + chemin);
    if (!reponse.ok) throw new Error('Tempo indisponible');
    return reponse.json();
  }

  function bloc(titre, code, detail) {
    const c = COULEURS_TEMPO[code] || COULEURS_TEMPO[0];
    // Un bouton : le toucher ouvre les conseils de la couleur.
    return `
      <button type="button" class="tempo-jour" data-code="${code || 0}" data-titre="${titre}"
              aria-label="${titre} : ${c.nom}. Voir les conseils">
        <div class="tempo-titre">${titre}</div>
        <div class="tempo-pastille" style="background:${c.pastille}">${c.symbole}</div>
        <div class="tempo-nom">${c.nom}</div>
        ${detail ? `<div class="tempo-detail">${detail}</div>` : ''}
      </button>`;
  }

  Nidoo.declarerWidget({
    type: 'tempo',
    nom: 'Tempo EDF',
    icone: '⚡',
    tailles: ['petit', 'moyen'],
    tailleParDefaut: 'moyen',

    afficher(zone, widget) {
      let arrete = false;
      zone.innerHTML = '<div class="tempo"><p class="widget-message">Chargement…</p></div>';
      const boite = zone.querySelector('.tempo');

      async function mettreAJour() {
        try {
          let html;
          if (widget.taille === 'petit') {
            // "now" tient compte du changement de jour Tempo à 6 h et des heures creuses.
            const maintenant = await lire('/now');
            const creuses = /-HC$/.test(maintenant.libTarif || '');
            html = bloc('Maintenant', maintenant.codeCouleur, creuses ? 'Heures creuses' : 'Heures pleines');
          } else {
            const [aujourdhui, demain, maintenant] = await Promise.all([lire('/jourTempo/today'), lire('/jourTempo/tomorrow'), lire('/now')]);
            const creuses = /-HC$/.test(maintenant.libTarif || '');
            // Un éclair entre les deux jours, pour qu'on voie tout de suite que c'est EDF.
            html = bloc("Aujourd'hui", aujourdhui.codeJour, creuses ? 'Heures creuses' : 'Heures pleines') +
              '<div class="tempo-eclair" aria-hidden="true">⚡</div>' +
              bloc('Demain', demain.codeJour, '\u00a0'); // ligne vide : les deux colonnes restent alignées
          }
          if (!arrete) boite.innerHTML = html;
        } catch (erreur) {
          if (!arrete) boite.innerHTML = '<p class="widget-message">📡 Tempo indisponible</p>';
        }
      }

      boite.addEventListener('click', (e) => {
        const jour = e.target.closest('.tempo-jour');
        if (jour) ouvrirConseils(Number(jour.dataset.code), jour.dataset.titre);
      });

      mettreAJour();
      const minuteur = setInterval(mettreAJour, 15 * 60 * 1000); // toutes les 15 minutes
      // Et pile au passage heures pleines / heures creuses (6 h et 22 h).
      const passage = setInterval(() => {
        const d = new Date();
        if (d.getMinutes() === 0 && (d.getHours() === 6 || d.getHours() === 22)) mettreAJour();
      }, 60 * 1000);
      return () => {
        arrete = true;
        clearInterval(minuteur);
        clearInterval(passage);
      };
    },
  });
})();
