/*
 * Widget "Liste" : une liste à cocher (courses, choses à faire, valise…).
 *
 *   - le titre et l'emoji se règlent avec ⚙️ (ex. 🛒 Courses, 📝 À faire, 🧳 Valise) ;
 *   - cocher le rond = c'est fait, l'élément disparaît ;
 *   - "+" en bas pour ajouter ;
 *   - toucher le texte d'un élément pour dire QUI doit le faire et POUR QUAND
 *     (la liste des personnes se règle avec ⚙️). Une date dépassée passe en rouge.
 *
 * Données : { titre, emoji, personnes: ['Alice', …],
 *             elements: [{ id, texte, qui, echeance: '2026-11-15' }, …] }
 */
(function () {
  const COULEURS_PERSONNES = ['#3a86ff', '#ef476f', '#2e9d4f', '#8338ec', '#ff7a1a', '#14919b'];

  // "2026-11-10" pour aujourd'hui (+ décalage en jours).
  function jour(decalage = 0) {
    const d = new Date();
    d.setDate(d.getDate() + decalage);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Pastille de date : "Aujourd'hui", "Demain", "15/11", avec une classe selon l'urgence.
  function pastilleDate(echeance) {
    if (!echeance) return '';
    let texte;
    let classe = '';
    if (echeance < jour()) {
      texte = 'En retard';
      classe = 'retard';
    } else if (echeance === jour()) {
      texte = "Aujourd'hui";
      classe = 'urgent';
    } else if (echeance === jour(1)) {
      texte = 'Demain';
    } else {
      const [, m, j] = echeance.split('-');
      texte = j + '/' + m;
    }
    return `<span class="liste-date ${classe}">${texte}</span>`;
  }

  function pastillePersonne(qui, personnes) {
    if (!qui) return '';
    const i = Math.max(0, personnes.indexOf(qui));
    const couleur = COULEURS_PERSONNES[i % COULEURS_PERSONNES.length];
    return `<span class="liste-qui" style="background:${couleur}" title="${Nidoo.echapper(qui)}">${Nidoo.echapper(qui.slice(0, 1).toUpperCase())}</span>`;
  }

  const nouvelId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  Nidoo.declarerWidget({
    type: 'liste',
    nom: 'Liste',
    icone: '📝',
    tailles: ['moyen', 'grand'], // 1×2 ou 2×2
    tailleParDefaut: 'grand',
    donneesParDefaut: { titre: 'À faire', emoji: '📝', personnes: [], elements: [] },
    reglages: [
      { cle: 'titre', libelle: 'Titre', type: 'texte', exemple: 'Ex. Courses, À faire, Valise…' },
      { cle: 'emoji', libelle: 'Emoji', type: 'texte', exemple: 'Ex. 🛒' },
      {
        cle: 'personnes',
        libelle: 'Personnes (une par ligne, facultatif)',
        type: 'liste',
        aide: 'Pour pouvoir dire qui doit faire quoi : touchez ensuite le texte d\'un élément.',
      },
    ],

    afficher(zone, widget) {
      const d = () => widget.donnees;
      const elements = () => d().elements || [];
      const enregistrer = (changements) => widget.enregistrer({ ...d(), ...changements });

      zone.innerHTML = `
        <div class="liste-widget">
          <div class="widget-entete"></div>
          <ul class="cases"></ul>
          <form class="ajout">
            <input type="text" placeholder="Ajouter…" maxlength="80" enterkeyhint="done" aria-label="Nouvel élément">
            <button type="submit" aria-label="Ajouter">+</button>
          </form>
        </div>`;

      const entete = zone.querySelector('.widget-entete');
      const liste = zone.querySelector('.cases');
      const formulaire = zone.querySelector('.ajout');
      const champ = formulaire.querySelector('input');

      function afficherListe() {
        entete.textContent = `${d().emoji || '📝'} ${d().titre || 'Liste'}`;
        const tous = elements();
        if (tous.length === 0) {
          liste.innerHTML = '<li class="liste-vide">Rien à faire 🎉</li>';
          return;
        }
        // Ceux qui ont une date d'abord (la plus proche en haut), puis les autres dans l'ordre d'ajout.
        const tries = [...tous].sort((a, b) => (a.echeance || '9999') < (b.echeance || '9999') ? -1 : (a.echeance || '9999') > (b.echeance || '9999') ? 1 : 0);
        liste.innerHTML = tries
          .map((e) => `
            <li data-id="${e.id}">
              <button class="case" aria-label="Fait : ${Nidoo.echapper(e.texte)}"></button>
              <div class="liste-corps">
                <button class="liste-texte" aria-label="Modifier ${Nidoo.echapper(e.texte)}">${Nidoo.echapper(e.texte)}</button>
                ${e.qui || e.echeance
                  ? `<div class="liste-infos">${pastillePersonne(e.qui, d().personnes || [])}${pastilleDate(e.echeance)}</div>`
                  : ''}
              </div>
            </li>`)
          .join('');
      }

      // Toucher le texte : qui, pour quand, modifier ou supprimer.
      function modifier(id) {
        const e = elements().find((x) => x.id === id);
        if (!e) return;
        const personnes = d().personnes || [];
        const contenu = Nidoo.ouvrirPopin(
          `${d().emoji || '📝'} ${e.texte}`,
          `<form class="champs liste-edition">
             <label class="champ"><span>Texte</span><input name="texte" maxlength="80"></label>
             <label class="champ"><span>Qui ?</span>
               <select name="qui">
                 <option value="">Personne en particulier</option>
                 ${personnes.map((p) => `<option>${Nidoo.echapper(p)}</option>`).join('')}
               </select>
               ${personnes.length ? '' : '<small>Ajoutez des personnes avec ⚙️ (mode Modifier).</small>'}
             </label>
             <label class="champ"><span>Pour quand ?</span><input name="echeance" type="date"></label>
             <div class="boutons-fenetre">
               <button type="button" class="bouton liste-supprimer">🗑️ Supprimer</button>
               <button type="submit" class="bouton bouton-principal">Enregistrer</button>
             </div>
           </form>`
        );
        const form = contenu.querySelector('form');
        form.elements.texte.value = e.texte;
        form.elements.qui.value = personnes.includes(e.qui) ? e.qui : '';
        form.elements.echeance.value = e.echeance || '';
        const fermer = () => contenu.closest('dialog').close();

        form.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const texte = form.elements.texte.value.trim() || e.texte;
          enregistrer({
            elements: elements().map((x) =>
              x.id === id ? { ...x, texte, qui: form.elements.qui.value, echeance: form.elements.echeance.value } : x
            ),
          });
          fermer();
          afficherListe();
        });
        form.querySelector('.liste-supprimer').addEventListener('click', () => {
          enregistrer({ elements: elements().filter((x) => x.id !== id) });
          fermer();
          afficherListe();
        });
      }

      liste.addEventListener('click', (ev) => {
        const li = ev.target.closest('li[data-id]');
        if (!li) return;
        if (ev.target.closest('.case')) {
          // Cocher = petite animation, puis l'élément disparaît.
          if (li.classList.contains('coche')) return;
          li.classList.add('coche');
          setTimeout(() => {
            enregistrer({ elements: elements().filter((x) => x.id !== li.dataset.id) });
            afficherListe();
          }, 400);
        } else if (ev.target.closest('.liste-texte')) {
          modifier(li.dataset.id);
        }
      });

      formulaire.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const texte = champ.value.trim();
        if (!texte) return;
        // Pas de doublon (sans tenir compte des majuscules).
        if (!elements().some((x) => x.texte.toLowerCase() === texte.toLowerCase())) {
          enregistrer({ elements: [...elements(), { id: nouvelId(), texte, qui: '', echeance: '' }] });
          afficherListe();
          liste.scrollTop = liste.scrollHeight;
        }
        champ.value = '';
      });

      afficherListe();
      // Les pastilles "Demain" / "Aujourd'hui" / "En retard" changent à minuit.
      const minuteur = setInterval(afficherListe, 30 * 60 * 1000);
      return () => clearInterval(minuteur);
    },
  });

  /*
   * L'ancien widget "Courses" devient une Liste "🛒 Courses" (mêmes articles).
   * Appelé par js/app.js au démarrage, pour les grilles enregistrées avant.
   */
  Nidoo.convertirCourses = function (w) {
    if (w.type !== 'courses') return false;
    w.type = 'liste';
    w.donnees = {
      titre: 'Courses',
      emoji: '🛒',
      personnes: [],
      elements: (w.donnees.articles || []).map((texte) => ({ id: nouvelId(), texte, qui: '', echeance: '' })),
    };
    return true;
  };
})();
