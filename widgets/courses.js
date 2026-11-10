/*
 * Widget "Courses" : une liste à cocher.
 * Cocher un article le retire de la liste. Le "+" en bas en ajoute un.
 */
Nidoo.declarerWidget({
  type: 'courses',
  nom: 'Courses',
  icone: '🛒',
  tailles: ['moyen', 'grand'], // 1×2 ou 2×2 (choix dans ⚙️)
  tailleParDefaut: 'grand',
  donneesParDefaut: { articles: [] },

  afficher(zone, widget) {
    zone.innerHTML = `
      <div class="liste-widget">
        <div class="widget-entete">🛒 Courses</div>
        <ul class="cases"></ul>
        <form class="ajout">
          <input type="text" placeholder="Ajouter…" maxlength="60" enterkeyhint="done" aria-label="Nouvel article">
          <button type="submit" aria-label="Ajouter">+</button>
        </form>
      </div>`;

    const liste = zone.querySelector('.cases');
    const formulaire = zone.querySelector('.ajout');
    const champ = formulaire.querySelector('input');
    const articles = () => widget.donnees.articles || [];

    function afficherListe() {
      if (articles().length === 0) {
        liste.innerHTML = '<li class="liste-vide">Rien à acheter 🎉</li>';
        return;
      }
      liste.innerHTML = articles()
        .map((a, i) => `
          <li>
            <button class="case" data-index="${i}" aria-label="Cocher ${Nidoo.echapper(a)}"></button>
            <span>${Nidoo.echapper(a)}</span>
          </li>`)
        .join('');
    }

    // Cocher = petite animation, puis l'article disparaît.
    liste.addEventListener('click', (e) => {
      const bouton = e.target.closest('.case');
      if (!bouton || bouton.closest('li').classList.contains('coche')) return;
      const article = articles()[Number(bouton.dataset.index)];
      bouton.closest('li').classList.add('coche');
      setTimeout(() => {
        widget.enregistrer({ ...widget.donnees, articles: articles().filter((a) => a !== article) });
        afficherListe();
      }, 400);
    });

    formulaire.addEventListener('submit', (e) => {
      e.preventDefault();
      const texte = champ.value.trim();
      if (!texte) return;
      // Pas de doublon (sans tenir compte des majuscules).
      if (!articles().some((a) => a.toLowerCase() === texte.toLowerCase())) {
        widget.enregistrer({ ...widget.donnees, articles: [...articles(), texte] });
        afficherListe();
        liste.scrollTop = liste.scrollHeight;
      }
      champ.value = '';
    });

    afficherListe();
  },
});
