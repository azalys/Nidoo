/*
 * Le "catalogue" des widgets.
 *
 * Chaque fichier du dossier widgets/ appelle Nidoo.declarerWidget({...})
 * pour s'ajouter au catalogue. Voir widgets/note.js pour un exemple commenté.
 */
window.Nidoo = window.Nidoo || {};

/* Les tailles possibles : nombre de colonnes et de lignes occupées. */
Nidoo.TAILLES = {
  petit: { colonnes: 1, lignes: 1, nom: 'Petit' },
  moyen: { colonnes: 2, lignes: 1, nom: 'Moyen' },
  grand: { colonnes: 2, lignes: 2, nom: 'Grand' },
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
 *                   types : 'texte', 'url', 'liste' (une ligne = un élément).
 *                   Les valeurs saisies sont rangées dans widget.donnees[cle].
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
