/*
 * Le "catalogue" des widgets.
 *
 * Chaque fichier du dossier widgets/ appelle Nidoo.declarerWidget({...})
 * pour s'ajouter au catalogue. Voir widgets/note.js pour un exemple commenté.
 */
window.Nidoo = window.Nidoo || {};

/* Les tailles possibles : nombre de colonnes et de lignes occupées. */
/* "nom" : ce qui est affiché dans ⚙️ (lignes × colonnes). */
Nidoo.TAILLES = {
  petit: { colonnes: 1, lignes: 1, nom: '1×1 (une case)' },
  moyen: { colonnes: 2, lignes: 1, nom: '1×2 (une ligne, deux colonnes)' },
  grand: { colonnes: 2, lignes: 2, nom: '2×2 (carré de 4 cases)' },
};

/*
 * Les couleurs des widgets. Chaque widget a la sienne (bouton 🎨 en mode Modifier).
 *   fond  : couleur du widget
 *   ombre : couleur plus foncée, pour l'effet "relief"
 *   texte : couleur du texte posé dessus (doit rester bien lisible)
 * On peut en ajouter, en retirer ou en changer librement.
 */
Nidoo.COULEURS = {
  framboise: { fond: '#ef476f', ombre: '#c42a52', texte: '#ffffff' },
  orange:    { fond: '#ff9f1c', ombre: '#d97c00', texte: '#4a2400' },
  soleil:    { fond: '#ffd23f', ombre: '#e0ac00', texte: '#4a3500' },
  pomme:     { fond: '#8ac926', ombre: '#64a000', texte: '#1f3300' },
  lagon:     { fond: '#2ec4b6', ombre: '#169c90', texte: '#003b36' },
  ciel:      { fond: '#3a86ff', ombre: '#1d63d6', texte: '#ffffff' },
  raisin:    { fond: '#8338ec', ombre: '#6119c4', texte: '#ffffff' },
};

/* Tous les widgets déclarés, rangés par type : { horloge: {...}, note: {...} } */
Nidoo.catalogue = {};

/*
 * Déclare un widget. Champs attendus :
 *   type            identifiant unique, sans espace (ex. 'note')
 *   nom             nom affiché dans la fenêtre "Ajouter" (ex. 'Note')
 *   icone           un emoji (ex. '📝')
 *   tailles         tailles autorisées (ex. ['petit', 'moyen', 'grand'])
 *   tailleParDefaut taille à l'ajout (ex. 'moyen')
 *   donneesParDefaut (facultatif) données de départ, ex. { titre: 'Agenda' }
 *   reglages        (facultatif) champs de la fenêtre ⚙️, ex.
 *                   [{ cle: 'ville', libelle: 'Ville', type: 'texte', exemple: 'Paris', aide: '…' }]
 *                   types : 'texte', 'url', 'liste' (une ligne = un élément),
 *                   'choix' (liste déroulante, avec options: [{ valeur, libelle }, …]),
 *                   'date' (ex. "2026-12-19"), 'heure' (ex. "21:30"),
 *                   'jours' (jours de la semaine à cocher : [1, 4] = lundi et jeudi).
 *                   Les valeurs saisies sont rangées dans widget.donnees[cle].
 *   fusionner(a, b) (facultatif) pour le partage entre appareils : réunit les données
 *                   d'un même widget modifié sur deux appareils (b = la plus récente).
 *   afficher(zone, widget)
 *       Dessine le widget dans `zone` (un élément HTML vide).
 *       `widget` contient :
 *         widget.taille            'petit', 'moyen' ou 'grand'
 *         widget.donnees           les données propres à ce widget ({} au départ)
 *         widget.enregistrer(obj)  remplace les données et les sauvegarde
 *       Peut renvoyer une fonction de nettoyage (ex. pour arrêter un setInterval),
 *       appelée quand le widget est supprimé ou redessiné.
 */
Nidoo.declarerWidget = function (definition) {
  if (!definition.type || Nidoo.catalogue[definition.type]) {
    console.warn('Nidoo : widget sans type ou déjà déclaré.', definition);
    return;
  }
  Nidoo.catalogue[definition.type] = definition;
};

/* Outil : rend un texte sûr à insérer dans du HTML (évite qu'un "<" casse la page). */
Nidoo.echapper = function (texte) {
  return String(texte ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
};

/*
 * Outil : ouvre une fenêtre par-dessus la grille ("popin"), avec un titre et du HTML.
 * Elle se ferme avec le bouton "Fermer" ou en touchant à côté.
 * Renvoie la zone de contenu (pour y brancher des actions après affichage).
 *   Nidoo.ouvrirPopin('Titre', '<p>Contenu</p>');
 */
Nidoo.ouvrirPopin = function (titre, html) {
  let popin = document.getElementById('popin');
  if (!popin) {
    popin = document.createElement('dialog');
    popin.id = 'popin';
    popin.className = 'galerie popin';
    popin.innerHTML = `
      <h2 class="popin-titre"></h2>
      <div class="popin-contenu"></div>
      <button class="bouton bouton-principal popin-fermer">Fermer</button>`;
    popin.querySelector('.popin-fermer').addEventListener('click', () => popin.close());
    popin.addEventListener('click', (e) => e.target === popin && popin.close());
    document.body.appendChild(popin);
  }
  popin.querySelector('.popin-titre').textContent = titre;
  const contenu = popin.querySelector('.popin-contenu');
  contenu.innerHTML = html;
  popin.showModal();
  return contenu;
};
