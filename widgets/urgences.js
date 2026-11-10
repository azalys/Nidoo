/*
 * Widget "Urgences" (1×1, côté enfant) : les numéros d'urgence en gros.
 * Le toucher ouvre la liste complète : numéros d'urgence, numéros des parents
 * (réglés avec ⚙️) et l'adresse de la maison (à dire aux secours).
 * Sur un téléphone, toucher un numéro lance l'appel.
 *
 * Réglages : contacts (une ligne par contact : "Maman : 06 12 34 56 78") et adresse.
 */
(function () {
  const NUMEROS = [
    { emoji: '🚑', numero: '15', nom: 'SAMU', aide: 'Quelqu\'un est blessé ou très malade' },
    { emoji: '🚒', numero: '18', nom: 'Pompiers', aide: 'Feu, accident, quelqu\'un en danger' },
    { emoji: '🚓', numero: '17', nom: 'Police', aide: 'Quelqu\'un te fait peur ou te veut du mal' },
    { emoji: '🆘', numero: '112', nom: 'Urgences (partout en Europe)', aide: 'Si tu ne sais pas lequel appeler' },
  ];
  const AUTRES = [
    { emoji: '🧏', numero: '114', nom: 'Urgences par SMS', aide: 'Si tu ne peux pas parler' },
    { emoji: '☠️', numero: '01 40 05 48 48', nom: 'Centre antipoison (Paris)', aide: 'Si tu as avalé quelque chose de dangereux' },
    { emoji: '🧒', numero: '119', nom: 'Allô Enfance en danger', aide: 'Gratuit, jour et nuit' },
  ];

  const tel = (numero) => 'tel:' + numero.replace(/[^0-9+]/g, '');

  // "Maman : 06 12 34 56 78" → { nom: 'Maman', numero: '06 12 34 56 78' }
  function lireContact(ligne) {
    const i = ligne.lastIndexOf(':');
    return i > 0 ? { nom: ligne.slice(0, i).trim(), numero: ligne.slice(i + 1).trim() } : { nom: ligne.trim(), numero: '' };
  }

  function ligne(n) {
    return `
      <a class="urgence-ligne" href="${tel(n.numero)}">
        <span class="urgence-emoji">${n.emoji}</span>
        <span class="urgence-texte"><strong>${Nidoo.echapper(n.nom)}</strong>${n.aide ? `<small>${Nidoo.echapper(n.aide)}</small>` : ''}</span>
        <span class="urgence-numero">${Nidoo.echapper(n.numero)}</span>
      </a>`;
  }

  Nidoo.declarerWidget({
    type: 'urgences',
    nom: 'Urgences',
    icone: '🆘',
    tailles: ['petit'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { contacts: [], adresse: '' },
    reglages: [
      {
        cle: 'contacts',
        libelle: 'Parents et proches (une ligne par personne)',
        type: 'liste',
        aide: 'Exemple : « Maman : 06 12 34 56 78 »',
      },
      { cle: 'adresse', libelle: 'Adresse de la maison (à dire aux secours)', type: 'texte', exemple: 'Ex. 12 rue des Lilas, 44000 Nantes' },
    ],

    afficher(zone, widget) {
      zone.innerHTML = `
        <button class="urgences" aria-label="Numéros d'urgence">
          <span class="urgences-titre">Urgences</span>
          <span class="urgences-grille">
            ${NUMEROS.map((n) => `<span class="urgence-case"><span>${n.emoji}</span><b>${n.numero}</b></span>`).join('')}
          </span>
        </button>`;

      zone.querySelector('.urgences').addEventListener('click', () => {
        const contacts = (widget.donnees.contacts || []).map(lireContact).filter((c) => c.numero);
        const adresse = (widget.donnees.adresse || '').trim();
        Nidoo.ouvrirPopin(
          '🆘 Numéros d\'urgence',
          `<div class="urgences-liste">
             ${NUMEROS.map(ligne).join('')}
             ${contacts.length ? '<h3>👨‍👩‍👧 La famille</h3>' + contacts.map((c) => ligne({ emoji: '📞', ...c })).join('') : ''}
             ${adresse ? `<div class="urgence-adresse"><span>🏠</span><div><small>Notre adresse (à dire aux secours)</small><strong>${Nidoo.echapper(adresse)}</strong></div></div>` : ''}
             <h3>Autres numéros</h3>
             ${AUTRES.map(ligne).join('')}
           </div>
           ${!contacts.length || !adresse ? '<p class="aide">Ajoutez les numéros des parents et l\'adresse avec ⚙️ (mode Modifier).</p>' : ''}`
        );
      });
    },
  });
})();
