/*
 * Placement des widgets sur la grille.
 *
 * Chaque widget enregistré peut avoir une position : x (colonne) et y (ligne),
 * en partant de 0 en haut à gauche. Ce fichier calcule où chaque widget
 * s'affiche réellement, sans chevauchement :
 *   1. le widget "prioritaire" (celui qu'on vient de déplacer ou d'agrandir) d'abord ;
 *   2. puis les widgets qui ont une position libre et valable ;
 *   3. enfin les autres (pas de position, position occupée, ou qui dépasse
 *      de l'écran) vont à la première place libre, de gauche à droite puis de haut en bas.
 */
window.Nidoo = window.Nidoo || {};

Nidoo.placement = {
  /* Largeur (l) et hauteur (h) d'un widget en cases. */
  dimensions(widget, colonnes) {
    const t = Nidoo.TAILLES[widget.taille] || Nidoo.TAILLES.petit;
    return { l: Math.min(t.colonnes, colonnes), h: t.lignes };
  },

  /*
   * Renvoie une Map : id du widget → { x, y, l, h }.
   * Ne modifie pas les widgets.
   */
  calculer(widgets, colonnes, idPrioritaire) {
    const occupe = new Set();
    const resultat = new Map();
    const cle = (x, y) => x + ',' + y;

    const libre = (x, y, l, h) => {
      if (x < 0 || y < 0 || x + l > colonnes) return false;
      for (let i = x; i < x + l; i++) {
        for (let j = y; j < y + h; j++) if (occupe.has(cle(i, j))) return false;
      }
      return true;
    };
    const poser = (w, x, y, l, h) => {
      for (let i = x; i < x + l; i++) for (let j = y; j < y + h; j++) occupe.add(cle(i, j));
      resultat.set(w.id, { x, y, l, h });
    };
    const aUnePosition = (w) => Number.isInteger(w.x) && Number.isInteger(w.y);

    const ordre = [...widgets].sort((a, b) => (b.id === idPrioritaire) - (a.id === idPrioritaire));
    const sansPlace = [];

    ordre.forEach((w) => {
      const { l, h } = this.dimensions(w, colonnes);
      if (aUnePosition(w) && libre(w.x, w.y, l, h)) poser(w, w.x, w.y, l, h);
      else sansPlace.push(w);
    });

    sansPlace.forEach((w) => {
      const { l, h } = this.dimensions(w, colonnes);
      for (let y = 0; ; y++) {
        for (let x = 0; x + l <= colonnes; x++) {
          if (libre(x, y, l, h)) {
            poser(w, x, y, l, h);
            return;
          }
        }
      }
    });

    return resultat;
  },

  /* Nombre de lignes utilisées. */
  hauteur(placement) {
    let max = 0;
    placement.forEach((p) => (max = Math.max(max, p.y + p.h)));
    return max;
  },

  /* Les widgets (ids) dont la zone touche le rectangle donné. */
  chevauchements(placement, x, y, l, h, idIgnore) {
    const ids = [];
    placement.forEach((p, id) => {
      if (id === idIgnore) return;
      if (x < p.x + p.l && p.x < x + l && y < p.y + p.h && p.y < y + h) ids.push(id);
    });
    return ids;
  },
};
