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

/* Tous les widgets déclarés, rangés par type : { horloge: {...}, note: {...} } */
Nidoo.catalogue = {};

/*
 * Déclare un widget. Champs attendus :
 *   type            identifiant unique, sans espace (ex. 'note')
 *   nom             nom affiché dans la fenêtre "Ajouter" (ex. 'Note')
 *   icone           un emoji (ex. '📝')
 *   tailles         tailles autorisées (ex. ['petit', 'moyen', 'grand'])
 *   tailleParDefaut taille à l'ajout (ex. 'moyen')
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
