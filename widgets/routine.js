/*
 * Widget "Routine" : la routine du matin avant midi, celle du soir après midi.
 * Les étapes se règlent avec ⚙️. Les cases se décochent toutes seules
 * quand on passe du matin au soir, et chaque nouveau jour.
 */
(function () {
  // 'matin' avant midi, 'soir' à partir de midi.
  const momentActuel = () => (new Date().getHours() < 12 ? 'matin' : 'soir');

  // Ex. "2026-11-10-matin" : change à midi et à minuit.
  function cleDuMoment() {
    const d = new Date();
    const jour = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    return jour + '-' + momentActuel();
  }

  Nidoo.declarerWidget({
    type: 'routine',
    nom: 'Routine',
    icone: '✅',
    tailles: ['grand'],
    tailleParDefaut: 'grand',
    donneesParDefaut: {
      titre: '',
      matin: ['Petit-déjeuner', "S'habiller", 'Se brosser les dents', 'Préparer son sac'],
      soir: ['Faire ses devoirs', 'Prendre sa douche', 'Se brosser les dents', 'Préparer ses habits'],
    },
    reglages: [
      { cle: 'titre', libelle: 'Pour qui ? (facultatif)', type: 'texte', exemple: 'Ex. Léa' },
      { cle: 'matin', libelle: 'Routine du matin (une étape par ligne)', type: 'liste' },
      { cle: 'soir', libelle: 'Routine du soir (une étape par ligne)', type: 'liste' },
    ],

    afficher(zone, widget) {
      let cleAffichee = null;

      function faites() {
        const c = widget.donnees.coches;
        return c && c.cle === cleDuMoment() ? c.faites : [];
      }

      function dessiner() {
        cleAffichee = cleDuMoment();
        const moment = momentActuel();
        const etapes = widget.donnees[moment] || [];
        const fait = faites();
        const total = etapes.length;
        const nbFaites = etapes.filter((e) => fait.includes(e)).length;
        const titre = (moment === 'matin' ? '☀️ Matin' : '🌙 Soir') +
          (widget.donnees.titre ? ' · ' + Nidoo.echapper(widget.donnees.titre) : '');

        zone.innerHTML = `
          <div class="liste-widget">
            <div class="widget-entete">
              <span>${titre}</span>
              ${total ? `<span class="compteur">${nbFaites}/${total}</span>` : ''}
            </div>
            ${total && nbFaites === total ? '<div class="bravo">Bravo, tout est fait ! 🎉</div>' : ''}
            <ul class="cases">
              ${total === 0 ? '<li class="liste-vide">Aucune étape. Ajoutez-en avec ⚙️</li>' : ''}
              ${etapes.map((e, i) => `
                <li class="${fait.includes(e) ? 'fait' : ''}">
                  <button class="case" data-index="${i}" aria-pressed="${fait.includes(e)}" aria-label="${Nidoo.echapper(e)}"></button>
                  <span>${Nidoo.echapper(e)}</span>
                </li>`).join('')}
            </ul>
          </div>`;
      }

      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('.case');
        if (!bouton) return;
        const etape = (widget.donnees[momentActuel()] || [])[Number(bouton.dataset.index)];
        const fait = faites();
        const nouvelles = fait.includes(etape) ? fait.filter((x) => x !== etape) : [...fait, etape];
        widget.enregistrer({ ...widget.donnees, coches: { cle: cleDuMoment(), faites: nouvelles } });
        dessiner();
      });

      dessiner();
      // Chaque minute : si on est passé au soir (ou au lendemain), on redessine.
      const minuteur = setInterval(() => cleDuMoment() !== cleAffichee && dessiner(), 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });
})();
