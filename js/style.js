/*
 * Interrupteur "Adulte" dans la barre du haut : passe du style enfant (couleurs vives,
 * police ronde) au style adulte (fond blanc, typographie élégante), et inversement.
 * Le choix est propre à cet appareil (Nidoo.appareil) : la tablette peut rester en
 * mode enfant et un téléphone être en mode adulte.
 * Chaque mode a sa propre grille de widgets (voir js/app.js).
 * Tous les styles du mode adulte sont à la fin de css/style.css.
 */
(function () {
  const bouton = document.getElementById('bouton-style');

  function appliquer(style) {
    if (style === 'adulte') document.documentElement.dataset.style = 'adulte';
    else delete document.documentElement.dataset.style;
    bouton.setAttribute('aria-checked', String(style === 'adulte'));
    // L'étiquette indique le mode en cours.
    bouton.querySelector('.etiquette').textContent = style === 'adulte' ? 'Adulte' : 'Enfant';
  }

  bouton.addEventListener('click', () => {
    const style = document.documentElement.dataset.style === 'adulte' ? 'enfant' : 'adulte';
    Nidoo.appareil.modifier({ style });
    appliquer(style);
    // Chaque mode a sa propre grille : js/app.js affiche celle du mode choisi.
    document.dispatchEvent(new Event('nidoo:style'));
  });

  appliquer(Nidoo.appareil.lire().style || 'enfant');
})();
