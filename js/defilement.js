/*
 * Barre de défilement des listes dans les widgets (Liste, Routine, Agenda, Échéances…).
 *
 * Sur iPad, Safari n'affiche la barre de défilement que PENDANT qu'on fait défiler
 * (et ignore les styles de barre) : on ne voit donc pas qu'une liste dépasse.
 * On dessine ici notre propre barre, toujours visible quand la liste dépasse du cadre.
 * La barre du navigateur est masquée (css/style.css) pour ne pas en avoir deux.
 */
(function () {
  const LISTES = '.liste-widget > ul';
  const barres = new WeakMap(); // liste → sa barre

  function mettreAJour(liste) {
    const parent = liste.parentElement;
    if (!parent) return;
    let barre = barres.get(liste);
    if (!barre || barre.parentElement !== parent) {
      barre = document.createElement('div');
      barre.className = 'barre-defilement';
      barre.setAttribute('aria-hidden', 'true');
      barre.innerHTML = '<div class="barre-defilement-curseur"></div>';
      parent.appendChild(barre);
      barres.set(liste, barre);
    }
    const depasse = liste.scrollHeight - liste.clientHeight;
    barre.hidden = depasse <= 2;
    if (barre.hidden) return;

    const piste = Math.max(20, liste.clientHeight - 8);
    const curseur = Math.max(22, (piste * liste.clientHeight) / liste.scrollHeight);
    const position = ((piste - curseur) * Math.min(liste.scrollTop, depasse)) / depasse;
    barre.style.top = liste.offsetTop + 4 + 'px';
    barre.style.height = piste + 'px';
    barre.firstElementChild.style.height = curseur + 'px';
    barre.firstElementChild.style.transform = `translateY(${position}px)`;
  }

  // Toutes les listes, au prochain affichage (regroupe les changements rapprochés).
  let attente = null;
  function bientot() {
    cancelAnimationFrame(attente);
    attente = requestAnimationFrame(() => document.querySelectorAll(LISTES).forEach(mettreAJour));
  }

  // "scroll" ne remonte pas : on l'écoute pour toute la page, en phase de capture.
  document.addEventListener('scroll', (e) => e.target.matches && e.target.matches(LISTES) && mettreAJour(e.target), true);
  window.addEventListener('resize', bientot);
  // Widget ajouté, liste redessinée, élément ajouté ou coché…
  new MutationObserver(bientot).observe(document.getElementById('grille'), { childList: true, subtree: true, characterData: true });
  bientot();

  Nidoo.barresDefilement = bientot;
})();
