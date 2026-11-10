/*
 * Widget "Note" : un simple bloc-notes.
 *
 * C'est le bon modèle pour créer un nouveau widget :
 *   1. copier ce fichier dans widgets/ sous un autre nom ;
 *   2. changer type, nom, icone… et le contenu de afficher() ;
 *   3. ajouter une ligne <script src="widgets/mon-widget.js"></script> dans index.html.
 */
Nidoo.declarerWidget({
  type: 'note',
  nom: 'Note',
  icone: '📝',
  tailles: ['petit', 'moyen', 'grand'],
  tailleParDefaut: 'moyen',

  afficher(zone, widget) {
    zone.innerHTML = '<textarea class="note" placeholder="Écrire une note…"></textarea>';

    const champ = zone.querySelector('textarea');
    champ.value = widget.donnees.texte || '';

    // À chaque frappe, on enregistre le texte.
    champ.addEventListener('input', () => {
      widget.enregistrer({ texte: champ.value });
    });
  },
});
