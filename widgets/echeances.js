/*
 * Widget "Échéances" (1×2 ou 2×2) : contrôle technique, assurance, passeports,
 * vaccins, chaudière… avec une alerte quelques semaines avant.
 *
 *   - "+" en haut : ajouter une échéance (quoi, quand, alerte, répétition) ;
 *   - la pastille passe en orange pendant la période d'alerte, en rouge si c'est dépassé ;
 *   - toucher une échéance : la modifier, ou "C'est fait" (si elle se répète,
 *     la date avance toute seule, ex. contrôle technique tous les 2 ans).
 *
 * Données : { elements: [{ id, texte, date: '2027-03-15', rappel: 30, repetition: 24, maj }],
 *             retires: { id: date } }   (rappel en jours, répétition en mois, 0 = une seule fois)
 */
(function () {
  const RAPPELS = [
    { valeur: '7', libelle: '1 semaine avant' },
    { valeur: '14', libelle: '2 semaines avant' },
    { valeur: '30', libelle: '1 mois avant' },
    { valeur: '60', libelle: '2 mois avant' },
    { valeur: '90', libelle: '3 mois avant' },
  ];
  const REPETITIONS = [
    { valeur: '0', libelle: 'Une seule fois' },
    { valeur: '12', libelle: 'Chaque année' },
    { valeur: '24', libelle: 'Tous les 2 ans' },
    { valeur: '60', libelle: 'Tous les 5 ans' },
    { valeur: '120', libelle: 'Tous les 10 ans' },
  ];

  const nouvelId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // Nombre de jours entre aujourd'hui et une date "AAAA-MM-JJ".
  function joursAvant(date) {
    const [a, m, j] = date.split('-').map(Number);
    const d = new Date();
    return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  }

  // Ajoute des mois à une date (le 31 janvier + 1 mois = le 28 ou 29 février).
  function ajouterMois(date, mois) {
    const [a, m, j] = date.split('-').map(Number);
    const fin = new Date(a, m - 1 + mois + 1, 0).getDate(); // dernier jour du mois visé
    const d = new Date(a, m - 1 + mois, Math.min(j, fin));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function pastille(e) {
    const n = joursAvant(e.date);
    let texte;
    if (n < 0) texte = `Dépassé de ${-n} j`;
    else if (n === 0) texte = "Aujourd'hui";
    else if (n === 1) texte = 'Demain';
    else if (n < 60) texte = `dans ${n} j`;
    else if (n < 365) texte = `dans ${Math.round(n / 30.4)} mois`;
    else {
      const ans = Math.round(n / 365);
      texte = `dans ${ans} an${ans > 1 ? 's' : ''}`;
    }
    const classe = n < 0 ? 'retard' : n <= Number(e.rappel || 30) ? 'bientot' : '';
    return `<span class="echeance-quand ${classe}">${texte}</span>`;
  }

  const dateLisible = (date) => {
    const [a, m, j] = date.split('-');
    return `${j}/${m}/${a}`;
  };

  Nidoo.declarerWidget({
    type: 'echeances',
    nom: 'Échéances',
    icone: '📋',
    tailles: ['moyen', 'grand'],
    tailleParDefaut: 'grand',
    donneesParDefaut: { elements: [] },

    afficher(zone, widget) {
      const d = () => widget.donnees;
      const elements = () => d().elements || [];
      const enregistrer = (changements) => widget.enregistrer({ ...d(), ...changements });
      const retirer = (id) =>
        enregistrer({ elements: elements().filter((x) => x.id !== id), retires: { ...(d().retires || {}), [id]: Date.now() } });

      zone.innerHTML = `
        <div class="liste-widget">
          <div class="widget-entete">
            <span>📋 Échéances</span>
            <button class="echeance-ajouter" aria-label="Ajouter une échéance">+</button>
          </div>
          <ul class="echeances"></ul>
        </div>`;
      const liste = zone.querySelector('.echeances');

      function afficherListe() {
        const tries = [...elements()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        liste.innerHTML = tries.length
          ? tries.map((e) => `
              <li><button class="echeance" data-id="${e.id}">
                <span class="echeance-texte">${Nidoo.echapper(e.texte)}${Number(e.repetition) ? ' <small>↻</small>' : ''}</span>
                ${pastille(e)}
              </button></li>`).join('')
          : '<li class="liste-vide">Ajoutez une échéance avec + (contrôle technique, assurance, passeports…)</li>';
      }

      // Fenêtre d'ajout / de modification.
      function formulaire(e) {
        const nouveau = !e;
        e = e || { texte: '', date: '', rappel: 30, repetition: 0 };
        const contenu = Nidoo.ouvrirPopin(
          nouveau ? '📋 Nouvelle échéance' : '📋 ' + e.texte,
          `<form class="champs echeance-form">
             <label class="champ"><span>Quoi ?</span><input name="texte" maxlength="80" placeholder="Ex. Contrôle technique" required></label>
             <label class="champ"><span>Pour quand ?</span><input name="date" type="date" required></label>
             <label class="champ"><span>Me prévenir</span><select name="rappel">${RAPPELS.map((r) => `<option value="${r.valeur}">${r.libelle}</option>`).join('')}</select></label>
             <label class="champ"><span>Ça revient…</span><select name="repetition">${REPETITIONS.map((r) => `<option value="${r.valeur}">${r.libelle}</option>`).join('')}</select></label>
             <div class="boutons-fenetre">
               ${nouveau ? '' : '<button type="button" class="bouton echeance-supprimer">🗑️</button><button type="button" class="bouton echeance-fait">✓ C\'est fait</button>'}
               <button type="submit" class="bouton bouton-principal">Enregistrer</button>
             </div>
           </form>`
        );
        const form = contenu.querySelector('form');
        form.elements.texte.value = e.texte;
        form.elements.date.value = e.date;
        form.elements.rappel.value = String(e.rappel || 30);
        form.elements.repetition.value = String(e.repetition || 0);
        const fermer = () => contenu.closest('dialog').close();

        form.addEventListener('submit', (ev) => {
          ev.preventDefault();
          const valeurs = {
            texte: form.elements.texte.value.trim(),
            date: form.elements.date.value,
            rappel: Number(form.elements.rappel.value),
            repetition: Number(form.elements.repetition.value),
            maj: Date.now(),
          };
          if (!valeurs.texte || !valeurs.date) return;
          enregistrer({
            elements: nouveau
              ? [...elements(), { id: nouvelId(), ...valeurs }]
              : elements().map((x) => (x.id === e.id ? { ...x, ...valeurs } : x)),
          });
          fermer();
          afficherListe();
        });
        if (!nouveau) {
          form.querySelector('.echeance-supprimer').addEventListener('click', () => {
            if (!confirm('Supprimer « ' + e.texte + ' » ?')) return;
            retirer(e.id);
            fermer();
            afficherListe();
          });
          // C'est fait : si ça revient, la date avance ; sinon l'échéance disparaît.
          form.querySelector('.echeance-fait').addEventListener('click', () => {
            const mois = Number(e.repetition) || 0;
            if (mois) {
              enregistrer({ elements: elements().map((x) => (x.id === e.id ? { ...x, date: ajouterMois(x.date, mois), maj: Date.now() } : x)) });
            } else {
              retirer(e.id);
            }
            fermer();
            afficherListe();
          });
        }
      }

      zone.querySelector('.echeance-ajouter').addEventListener('click', () => formulaire(null));
      liste.addEventListener('click', (ev) => {
        const bouton = ev.target.closest('.echeance');
        if (bouton) formulaire(elements().find((x) => x.id === bouton.dataset.id));
      });

      afficherListe();
      const minuteur = setInterval(afficherListe, 60 * 60 * 1000); // "dans 12 j" change chaque jour
      return () => clearInterval(minuteur);
    },

    // Partage entre appareils : même fusion que les Listes (élément par élément).
    fusionner(a, b) {
      return Nidoo.catalogue.liste.fusionner(a, b);
    },
  });

  // Pour les tests.
  Nidoo.echeances = { ajouterMois, joursAvant, dateLisible };
})();
