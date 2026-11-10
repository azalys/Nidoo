/*
 * Widget "Agenda" : les prochains événements d'un agenda (Google, iCloud, Outlook…).
 *
 * On utilise l'adresse "iCal" de l'agenda, lue par api.php (il faut donc lancer
 * Nidoo avec PHP). Tant qu'aucune adresse n'est réglée, le widget montre des exemples.
 *
 * Google Agenda : Paramètres → (l'agenda) → Intégrer l'agenda
 *                 → "Adresse secrète au format iCal".
 */
(function () {
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

  // "2026-11-10" pour une date donnée (heure locale).
  function cleJour(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function nomDuJour(cle) {
    const aujourdhui = new Date();
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    if (cle === cleJour(aujourdhui)) return "Aujourd'hui";
    if (cle === cleJour(demain)) return 'Demain';
    const [a, m, j] = cle.split('-').map(Number);
    const d = new Date(a, m - 1, j);
    return JOURS[d.getDay()] + ' ' + j;
  }

  // Faux événements, affichés tant que l'agenda n'est pas branché.
  function exemples() {
    const jour = (decalage, heure) => {
      const d = new Date();
      d.setDate(d.getDate() + decalage);
      return cleJour(d) + 'T' + (heure || '00:00');
    };
    return [
      { debut: jour(0, '17:30'), journee: false, titre: 'Entraînement de foot ⚽' },
      { debut: jour(1), journee: true, titre: 'Sortie scolaire 🚌' },
      { debut: jour(1, '18:00'), journee: false, titre: 'Cours de piano 🎹' },
      { debut: jour(3, '14:00'), journee: false, titre: 'Anniversaire de Lou 🎂' },
      { debut: jour(5, '10:00'), journee: false, titre: 'Marché avec Mamie 🧺' },
    ];
  }

  function listeHtml(evenements) {
    if (evenements.length === 0) return '<li class="liste-vide">Rien de prévu 😎</li>';
    let html = '';
    let jourPrecedent = null;
    evenements.forEach((e) => {
      const jour = e.debut.slice(0, 10);
      if (jour !== jourPrecedent) {
        html += `<li class="agenda-jour">${nomDuJour(jour)}</li>`;
        jourPrecedent = jour;
      }
      const heure = e.journee ? 'Journée' : e.debut.slice(11, 16).replace(':', 'h');
      html += `<li class="agenda-evt"><span class="agenda-heure">${heure}</span><span>${Nidoo.echapper(e.titre)}</span></li>`;
    });
    return html;
  }

  Nidoo.declarerWidget({
    type: 'agenda',
    nom: 'Agenda',
    icone: '📅',
    tailles: ['grand'],
    tailleParDefaut: 'grand',
    donneesParDefaut: { titre: 'Agenda', url: '' },
    reglages: [
      { cle: 'titre', libelle: 'Nom affiché', type: 'texte', exemple: 'Ex. Famille' },
      {
        cle: 'url',
        libelle: 'Adresse iCal de l\'agenda',
        type: 'url',
        exemple: 'https://calendar.google.com/calendar/ical/…/basic.ics',
        aide: 'Google Agenda : Paramètres → votre agenda → Intégrer l\'agenda → « Adresse secrète au format iCal ». ' +
          'Laisser vide pour voir des exemples.',
      },
    ],

    afficher(zone, widget) {
      let arrete = false;
      zone.innerHTML = `
        <div class="liste-widget">
          <div class="widget-entete">📅 ${Nidoo.echapper(widget.donnees.titre || 'Agenda')}</div>
          <ul class="agenda"><li class="liste-vide">Chargement…</li></ul>
        </div>`;
      const liste = zone.querySelector('.agenda');

      async function mettreAJour() {
        const url = (widget.donnees.url || '').trim();
        if (!url) {
          liste.innerHTML = '<li class="agenda-exemple">Exemple · branchez l\'agenda avec ⚙️</li>' + listeHtml(exemples());
          return;
        }
        try {
          const reponse = await fetch('api.php?action=agenda&url=' + encodeURIComponent(url));
          const json = await reponse.json().catch(() => {
            throw new Error('api.php ne répond pas. Lancez Nidoo avec PHP.');
          });
          if (!json.ok) throw new Error(json.erreur);
          if (!arrete) liste.innerHTML = listeHtml(json.evenements);
        } catch (erreur) {
          const message = erreur.message === 'Failed to fetch' ? 'api.php ne répond pas. Lancez Nidoo avec PHP.' : erreur.message;
          if (!arrete) liste.innerHTML = '<li class="liste-vide">📡 ' + Nidoo.echapper(message) + '</li>';
        }
      }

      mettreAJour();
      const minuteur = setInterval(mettreAJour, 10 * 60 * 1000); // toutes les 10 minutes
      return () => {
        arrete = true;
        clearInterval(minuteur);
      };
    },
  });
})();
