/*
 * Enregistrement des données dans le navigateur (localStorage).
 *
 * Tout ce que l'appli garde tient dans un seul objet :
 *   { widgets: [ { id, type, taille, couleur, donnees }, ... ] }
 * L'ordre du tableau = l'ordre des widgets dans la grille.
 *
 * Attention : les données restent sur CET appareil et CE navigateur.
 */
window.Nidoo = window.Nidoo || {};

Nidoo.stockage = {
  CLE: 'nidoo.v1',

  charger() {
    try {
      const texte = localStorage.getItem(this.CLE);
      if (texte) {
        const etat = JSON.parse(texte);
        if (Array.isArray(etat.widgets)) return etat;
      }
    } catch (erreur) {
      console.warn('Nidoo : impossible de lire les données enregistrées.', erreur);
    }
    // Rien d'enregistré : c'est le premier lancement.
    return { widgets: [], nouveau: true };
  },

  enregistrer(etat) {
    try {
      localStorage.setItem(this.CLE, JSON.stringify(etat));
    } catch (erreur) {
      console.warn('Nidoo : impossible d\'enregistrer les données.', erreur);
    }
  },
};
