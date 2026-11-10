/*
 * Widget "Tempo EDF" : la couleur du moment (petit), ou d'aujourd'hui et de demain (moyen),
 * avec "heures creuses / heures pleines" en ce moment.
 * Données : https://www.api-couleur-tempo.fr, gratuit et sans clé.
 * La couleur de demain est publiée par RTE vers 11 h ; avant, elle est "pas encore connue".
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

  async function lire(chemin) {
    const reponse = await fetch(API + chemin);
    if (!reponse.ok) throw new Error('Tempo indisponible');
    return reponse.json();
  }

  function bloc(titre, code, detail) {
    const c = COULEURS_TEMPO[code] || COULEURS_TEMPO[0];
    return `
      <div class="tempo-jour">
        <div class="tempo-titre">${titre}</div>
        <div class="tempo-pastille" style="background:${c.pastille}">${c.symbole}</div>
        <div class="tempo-nom">${c.nom}</div>
        ${detail ? `<div class="tempo-detail">${detail}</div>` : ''}
      </div>`;
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
