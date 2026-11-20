/*
 * Widget "Récompenses" : le tableau à gommettes.
 *
 * Chaque enfant a sa ligne d'étoiles. « + » lui en donne une (rangement, devoirs…),
 * « − » en retire une (en cas d'erreur). Arrivé à l'objectif, il a gagné : on lui donne
 * sa récompense, on touche « Donné ✓ » et ses étoiles repartent à zéro.
 *
 * Réglages (⚙️) : les enfants (un par ligne, avec sa récompense si on veut :
 * « Léa : 🍦 Sortie glace »), le nombre d'étoiles à gagner, la récompense par défaut.
 *
 * Données : { enfants: [...], objectif: '10', recompense: '…',
 *             etoiles: { Léa: 3 }, gagnees: { Léa: 1 } }
 */
(function () {
  // « Léa : 🍦 Sortie glace » → { nom: 'Léa', recompense: '🍦 Sortie glace' }
  function lireEnfant(ligne) {
    const [nom, ...reste] = ligne.split(/\s*[:=]\s*/);
    return { nom: nom.trim(), recompense: reste.join(' : ').trim() };
  }

  // Une étoile dessinée (pleine, sans contour) : elle prend toute la place de sa case.
  const ETOILE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.6 5.7 21l1.3-7.1L1.8 9l7.1-.9z" stroke-linejoin="round"/></svg>';

  const objectifDe = (d) => Math.min(50, Math.max(1, parseInt(d.objectif, 10) || 10));

  Nidoo.declarerWidget({
    type: 'recompenses',
    nom: 'Récompenses',
    icone: '⭐',
    tailles: ['moyen', 'grand', 'haut3'],
    tailleParDefaut: 'grand',
    donneesParDefaut: { enfants: [], objectif: '10', recompense: '🎁 Une surprise', etoiles: {}, gagnees: {} },
    reglages: [
      {
        cle: 'enfants',
        libelle: 'Enfants (un par ligne)',
        type: 'liste',
        aide: 'Avec sa propre récompense si vous voulez : « Léa : 🍦 Sortie glace ».',
      },
      { cle: 'objectif', libelle: 'Nombre d\'étoiles à gagner', type: 'texte', exemple: 'Ex. 10' },
      { cle: 'recompense', libelle: 'Récompense (pour tous les enfants)', type: 'texte', exemple: 'Ex. 🎬 Soirée film' },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;

      function dessiner(anime) {
        const enfants = (d().enfants || []).map(lireEnfant).filter((e) => e.nom);
        const objectif = objectifDe(d());
        const etoiles = d().etoiles || {};
        zone.innerHTML = `
          <div class="liste-widget recompenses">
            <div class="widget-entete"><span>⭐ Récompenses</span><span class="compteur">${objectif} ⭐</span></div>
            <ul class="recomp-liste" style="--etapes:${enfants.length}">
              ${enfants.length === 0 ? '<li class="liste-vide">Ajoutez les enfants avec ⚙️</li>' : ''}
              ${enfants.map((e) => {
                const n = Math.min(objectif, etoiles[e.nom] || 0);
                const recompense = e.recompense || d().recompense || '🎁 Une surprise';
                const nom = Nidoo.echapper(e.nom);
                if (n >= objectif) {
                  return `<li class="recomp recomp-gagne">
                      <span class="recomp-nom">${nom}</span>
                      <span class="recomp-bravo"><span class="visuellement-cache">a gagné : </span>🎉 ${Nidoo.echapper(recompense)}</span>
                      <button class="bouton recomp-donne" data-nom="${nom}" type="button" aria-label="${nom} : récompense donnée, repartir à zéro">Donné ✓</button>
                    </li>`;
                }
                // Jusqu'à 10 : une étoile par case ; au-delà : une barre et « 7 / 15 ».
                const progression = objectif <= 10
                  ? `<span class="recomp-etoiles" style="--n:${objectif};--c:${objectif > 6 ? Math.ceil(objectif / 2) : objectif}" aria-label="${n} étoiles sur ${objectif}">${
                      Array.from({ length: objectif }, (_, i) =>
                        `<span class="recomp-etoile${i < n ? ' pleine' : ''}${anime === e.nom && i === n - 1 ? ' nouvelle' : ''}">${ETOILE}</span>`).join('')}</span>`
                  : `<span class="recomp-progres"><span class="recomp-barre"><span style="width:${(100 * n) / objectif}%"></span></span><span class="recomp-nombre">${n} / ${objectif}</span></span>`;
                return `<li class="recomp">
                    <span class="recomp-nom" title="${Nidoo.echapper(recompense)}">${nom}</span>
                    <button class="recomp-moins" data-nom="${nom}" type="button" aria-label="Retirer une étoile à ${nom}" ${n === 0 ? 'disabled' : ''}>−</button>
                    ${progression}
                    <button class="recomp-plus" data-nom="${nom}" type="button" aria-label="Donner une étoile à ${nom}">+</button>
                  </li>`;
              }).join('')}
            </ul>
          </div>`;
      }

      function changer(nom, ecart) {
        const etoiles = { ...(d().etoiles || {}) };
        etoiles[nom] = Math.max(0, Math.min(objectifDe(d()), (etoiles[nom] || 0) + ecart));
        widget.enregistrer({ ...d(), etoiles });
        dessiner(ecart > 0 ? nom : null);
      }

      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('button[data-nom]');
        if (!bouton) return;
        // data-nom est échappé pour le HTML : le navigateur nous le rend tel qu'il était.
        const nom = bouton.dataset.nom;
        if (bouton.classList.contains('recomp-plus')) changer(nom, 1);
        else if (bouton.classList.contains('recomp-moins')) changer(nom, -1);
        else if (bouton.classList.contains('recomp-donne')) {
          widget.enregistrer({
            ...d(),
            etoiles: { ...(d().etoiles || {}), [nom]: 0 },
            gagnees: { ...(d().gagnees || {}), [nom]: ((d().gagnees || {})[nom] || 0) + 1 },
          });
          dessiner();
        }
      });

      dessiner();
    },
  });
})();
