/*
 * La grille installée au tout premier lancement (quand rien n'est encore enregistré).
 * Pour la retrouver plus tard : vider le localStorage du navigateur.
 *
 * Prévue pour une tablette à l'horizontale (8 colonnes × 4 lignes) :
 *   lignes 1-2 : les trois agendas et les courses (2×2) ;
 *   lignes 3-4 : météo et Tempo (1×2), routine (2×2), corvées et minuteur (1×1).
 * x = colonne, y = ligne, en partant de 0 en haut à gauche.
 */
window.Nidoo = window.Nidoo || {};

Nidoo.GRILLE_DE_DEPART = [
  { type: 'agenda',   taille: 'grand', x: 0, y: 0, couleur: 'raisin',    donnees: { titre: 'Famille' } },
  { type: 'agenda',   taille: 'grand', x: 2, y: 0, couleur: 'lagon',     donnees: { titre: 'Tibo' } },
  { type: 'agenda',   taille: 'grand', x: 4, y: 0, couleur: 'framboise', donnees: { titre: 'Gwen' } },
  { type: 'liste',    taille: 'grand', x: 6, y: 0, couleur: 'pomme',     donnees: { titre: 'Courses', emoji: '🛒' } },
  { type: 'meteo',    taille: 'moyen', x: 0, y: 2, couleur: 'ciel' },
  { type: 'tempo',    taille: 'moyen', x: 0, y: 3, couleur: 'soleil' },
  { type: 'routine',  taille: 'grand', x: 2, y: 2, couleur: 'orange' },
  { type: 'corvees',  taille: 'petit', x: 4, y: 2, couleur: 'lagon' },
  { type: 'minuteur', taille: 'petit', x: 5, y: 2, couleur: 'raisin' },
];
