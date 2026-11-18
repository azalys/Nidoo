/*
 * Widget "Liste" : une liste à cocher (courses, choses à faire, valise…).
 *
 *   - le titre et l'emoji se règlent avec ⚙️ (ex. 🛒 Courses, 📝 À faire, 🧳 Valise) ;
 *   - cocher le rond = c'est fait, l'élément disparaît ;
 *   - "+" en bas pour ajouter ;
 *   - toucher le texte d'un élément pour dire QUI doit le faire (son initiale s'affiche
 *     dans la case à cocher) et POUR QUAND
 *     (la liste des personnes se règle avec ⚙️). Une date dépassée passe en rouge ;
 *   - la poignée ⠿ à droite : glisser l'élément vers le haut ou le bas pour réorganiser.
 *
 * Données : { titre, emoji, personnes: ['Alice', …],
 *             elements: [{ id, texte, qui, echeance: '2026-11-15', ordre, maj }, …],
 *             retires: { id: date } }   ← éléments cochés/supprimés (pour le partage entre appareils)
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

  /*
   * Ordre d'affichage : le nombre "ordre" de chaque élément (posé quand on le déplace ou
   * l'ajoute), sinon sa place dans la liste. Un déplacement ne change que l'élément déplacé
   * (il prend un ordre entre ses deux voisins) : le partage entre appareils reste simple.
   */
  const rang = (e, i) => (typeof e.ordre === 'number' ? e.ordre : i);
  const dansLOrdre = (elements) =>
    elements.map((e, i) => ({ e, r: rang(e, i) })).sort((a, b) => a.r - b.r).map((x) => x.e);
  const rangs = (elements) => new Map(elements.map((e, i) => [e.id, rang(e, i)]));

  // La poignée ⠿ (six points, dessinés pour s'afficher pareil partout).
  const POIGNEE = '<svg viewBox="0 0 10 16" width="10" height="16"><g fill="currentColor">'
    + [3, 8, 13].map((y) => `<circle cx="2.5" cy="${y}" r="1.6"/><circle cx="7.5" cy="${y}" r="1.6"/>`).join('')
    + '</g></svg>';

  const nouvelId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  Nidoo.declarerWidget({
    type: 'liste',
    nom: 'Liste',
    icone: '📝',
    tailles: ['moyen', 'grand', 'haut3', 'haut4'], // 1×2, 2×2, 3×2 ou 4×2 (toute la hauteur)
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
      // Retire un élément, en gardant la trace (pour qu'il disparaisse aussi sur les autres appareils).
      const retirer = (id) =>
        enregistrer({ elements: elements().filter((x) => x.id !== id), retires: { ...(d().retires || {}), [id]: Date.now() } });

      zone.innerHTML = `
        <div class="liste-widget">
          <div class="widget-entete"></div>
          <ul class="cases liste-elements"></ul>
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
        liste.innerHTML = dansLOrdre(tous)
          .map((e) => `
            <li data-id="${e.id}">
              <button class="case${e.qui ? ' case-personne' : ''}" aria-label="Fait : ${Nidoo.echapper(e.texte)}${e.qui ? ' (' + Nidoo.echapper(e.qui) + ')' : ''}">${pastillePersonne(e.qui, d().personnes || [])}</button>
              <div class="liste-corps">
                <button class="liste-texte" aria-label="Modifier ${Nidoo.echapper(e.texte)}">${Nidoo.echapper(e.texte)}</button>
                ${e.echeance ? `<div class="liste-infos">${pastilleDate(e.echeance)}</div>` : ''}
              </div>
              <span class="liste-poignee" title="Glisser pour déplacer" aria-hidden="true">${POIGNEE}</span>
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
              x.id === id ? { ...x, texte, qui: form.elements.qui.value, echeance: form.elements.echeance.value, maj: Date.now() } : x
            ),
          });
          fermer();
          afficherListe();
        });
        form.querySelector('.liste-supprimer').addEventListener('click', () => {
          retirer(id);
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
            retirer(li.dataset.id);
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
          const dernier = Math.max(-1, ...rangs(elements()).values());
          enregistrer({
            elements: [...elements(), { id: nouvelId(), texte, qui: '', echeance: '', ordre: dernier + 1, maj: Date.now() }],
          });
          afficherListe();
          liste.scrollTop = liste.scrollHeight;
        }
        champ.value = '';
      });

      /*
       * Réorganiser : on attrape la poignée ⠿ et on glisse. L'élément suit le doigt, les autres
       * se décalent ; près du haut ou du bas, la liste défile toute seule.
       */
      let glisse = null;
      let defilement = null;

      function suivre(y) {
        const { li } = glisse;
        const autres = [...liste.querySelectorAll('li[data-id]')].filter((x) => x !== li);
        const avant = autres.find((x) => {
          const r = x.getBoundingClientRect();
          return y < r.top + r.height / 2;
        });
        if (avant) {
          if (li.nextElementSibling !== avant) liste.insertBefore(li, avant);
        } else if (liste.lastElementChild !== li) {
          liste.appendChild(li);
        }
        li.style.transform = '';
        const naturel = li.getBoundingClientRect().top;
        li.style.transform = `translateY(${y - glisse.prise - naturel}px)`;
      }

      liste.addEventListener('pointerdown', (ev) => {
        const poignee = ev.target.closest('.liste-poignee');
        if (!poignee || glisse) return;
        ev.preventDefault();
        ev.stopPropagation(); // pas d'appui long "Modifier" sur la grille
        const li = poignee.closest('li');
        glisse = { li, id: li.dataset.id, prise: ev.clientY - li.getBoundingClientRect().top, y: ev.clientY };
        li.classList.add('deplace');
        // Défilement automatique près des bords.
        defilement = setInterval(() => {
          const r = liste.getBoundingClientRect();
          const vitesse = glisse.y < r.top + 28 ? -6 : glisse.y > r.bottom - 28 ? 6 : 0;
          if (vitesse) {
            liste.scrollTop += vitesse;
            suivre(glisse.y);
          }
        }, 16);
      });

      // Suivi sur toute la page : l'élément change de place dans la liste pendant qu'on le
      // glisse, et le doigt peut sortir de la liste.
      function bouger(ev) {
        if (!glisse) return;
        ev.preventDefault();
        glisse.y = ev.clientY;
        suivre(ev.clientY);
      }

      function lacher() {
        if (!glisse) return;
        clearInterval(defilement);
        const { li, id } = glisse;
        glisse = null;
        li.classList.remove('deplace');
        li.style.transform = '';
        const ids = [...liste.querySelectorAll('li[data-id]')].map((x) => x.dataset.id);
        const avant = dansLOrdre(elements()).map((x) => x.id);
        if (ids.join() === avant.join()) return;
        // Nouvel ordre de l'élément déplacé : entre ses deux nouveaux voisins.
        const r = rangs(elements());
        const k = ids.indexOf(id);
        const precedent = k > 0 ? r.get(ids[k - 1]) : null;
        const suivant = k < ids.length - 1 ? r.get(ids[k + 1]) : null;
        const ordre = precedent === null ? suivant - 1 : suivant === null ? precedent + 1 : (precedent + suivant) / 2;
        enregistrer({ elements: elements().map((x) => (x.id === id ? { ...x, ordre, maj: Date.now() } : x)) });
        afficherListe();
      }
      window.addEventListener('pointermove', bouger, { passive: false });
      window.addEventListener('pointerup', lacher);
      window.addEventListener('pointercancel', lacher);

      afficherListe();
      // Les pastilles "Demain" / "Aujourd'hui" / "En retard" changent à minuit.
      const minuteur = setInterval(afficherListe, 30 * 60 * 1000);
      return () => {
        clearInterval(minuteur);
        clearInterval(defilement);
        window.removeEventListener('pointermove', bouger);
        window.removeEventListener('pointerup', lacher);
        window.removeEventListener('pointercancel', lacher);
      };
    },

    /*
     * Partage entre appareils : si la liste a été modifiée sur deux appareils en même
     * temps, on garde les ajouts des deux côtés, élément par élément (au lieu de ne
     * garder que la version la plus récente de toute la liste).
     */
    fusionner(a, b) {
      const retires = { ...(a.retires || {}) };
      Object.entries(b.retires || {}).forEach(([id, t]) => (retires[id] = Math.max(retires[id] || 0, t)));
      const limite = Date.now() - 30 * 24 * 3600 * 1000;
      Object.keys(retires).forEach((id) => retires[id] < limite && delete retires[id]);

      const parId = new Map();
      [...(a.elements || []), ...(b.elements || [])].forEach((e) => {
        const deja = parId.get(e.id);
        if (!deja || (e.maj || 0) > (deja.maj || 0)) parId.set(e.id, e);
      });
      const elements = [...parId.values()].filter((e) => !(retires[e.id] >= (e.maj || 0)));
      return { ...a, ...b, elements, retires };
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
