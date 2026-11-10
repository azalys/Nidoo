/*
 * Réglages propres à CET appareil (jamais partagés avec les autres appareils) :
 * mode nuit, code de partage… Rangés à part dans le localStorage (clé "nidoo.appareil").
 */
window.Nidoo = window.Nidoo || {};

Nidoo.appareil = {
  CLE: 'nidoo.appareil',

  lire() {
    try {
      return JSON.parse(localStorage.getItem(this.CLE)) || {};
    } catch (erreur) {
      return {};
    }
  },

  // Modifie une partie des réglages : Nidoo.appareil.modifier({ nuit: {...} })
  modifier(changements) {
    const reglages = { ...this.lire(), ...changements };
    try {
      localStorage.setItem(this.CLE, JSON.stringify(reglages));
    } catch (erreur) {
      console.warn('Nidoo : impossible d\'enregistrer les réglages de l\'appareil.', erreur);
    }
    return reglages;
  },
};
