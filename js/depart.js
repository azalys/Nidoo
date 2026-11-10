/*
 * La grille installée au tout premier lancement (quand rien n'est encore enregistré).
 * Pour la retrouver plus tard : vider le localStorage du navigateur.
 *
 * L'ordre compte : la grille range les widgets de gauche à droite, puis de haut en bas,
 * en bouchant les trous. Avec cet ordre, tout tient sur un iPad à l'horizontale
 * (6 colonnes × 4 lignes).
 */
window.Nidoo = window.Nidoo || {};

Nidoo.GRILLE_DE_DEPART = [
  { type: 'meteo',   taille: 'moyen', couleur: 'ciel' },
  { type: 'agenda',  taille: 'grand', couleur: 'raisin',    donnees: { titre: 'Famille' } },
  { type: 'agenda',  taille: 'grand', couleur: 'lagon',     donnees: { titre: 'Tibo' } },
  { type: 'tempo',   taille: 'moyen', couleur: 'soleil' },
  { type: 'courses', taille: 'grand', couleur: 'pomme' },
  { type: 'routine', taille: 'grand', couleur: 'orange' },
  { type: 'agenda',  taille: 'grand', couleur: 'framboise', donnees: { titre: 'Gwen' } },
];
