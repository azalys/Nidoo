/*
 * La grille installée au tout premier lancement (quand rien n'est encore enregistré).
 * Pour la retrouver plus tard : vider le localStorage du navigateur.
 *
 * Prévue pour une tablette à l'horizontale (5 colonnes × 4 lignes) :
 *   colonnes 1 à 4 : quatre widgets 2×2 ;
 *   colonne 5      : quatre widgets 1×1.
 * x = colonne, y = ligne, en partant de 0 en haut à gauche.
 */
window.Nidoo = window.Nidoo || {};

Nidoo.GRILLE_DE_DEPART = [
  { type: 'agenda',   taille: 'grand', x: 0, y: 0, couleur: 'raisin',    donnees: { titre: 'Famille' } },
  { type: 'agenda',   taille: 'grand', x: 2, y: 0, couleur: 'lagon',     donnees: { titre: 'Tibo' } },
  { type: 'courses',  taille: 'grand', x: 0, y: 2, couleur: 'pomme' },
  { type: 'agenda',   taille: 'grand', x: 2, y: 2, couleur: 'framboise', donnees: { titre: 'Gwen' } },
  { type: 'meteo',    taille: 'petit', x: 4, y: 0, couleur: 'ciel' },
  { type: 'tempo',    taille: 'petit', x: 4, y: 1, couleur: 'soleil' },
  { type: 'corvees',  taille: 'petit', x: 4, y: 2, couleur: 'orange' },
  { type: 'minuteur', taille: 'petit', x: 4, y: 3, couleur: 'raisin' },
];
