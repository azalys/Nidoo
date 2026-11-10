/*
 * Widget "Minuteur" : un minuteur de cuisine (œufs, pâtes…) qui sonne à la fin.
 *
 *     −    ↺    −
 *    MM    :    SS
 *     +    ▶    +
 *
 * − / + règlent les minutes et les secondes (en gardant le doigt appuyé, ça défile vite).
 * À la fin ça sonne ; "Stop" remet le temps réglé, prêt pour la fois suivante.
 *
 * Le son est fabriqué par le navigateur (Web Audio), pas besoin de fichier.
 * Les navigateurs n'autorisent le son qu'après un appui : le bouton ▶ "débloque" le son.
 * Tant qu'il tourne, il empêche l'écran de se mettre en veille (voir "eveil" plus bas).
 *
 * Données enregistrées :
 *   duree    le temps réglé (en millisecondes)
 *   fin      heure de fin (en millisecondes) quand il tourne, sinon null
 *   pause    temps restant (en millisecondes) quand il est en pause, sinon null
 */
(function () {
  const SONNERIE_MAX_MS = 60 * 1000; // la sonnerie s'arrête seule après 1 minute
  const PAS_SECONDES = 5;            // les boutons des secondes avancent de 5 en 5
  const MAX_MINUTES = 99;

  /* ---- Le son ---------------------------------------------------------- */

  let audio = null;

  // À appeler pendant un appui (sinon le navigateur bloque le son).
  function debloquerSon() {
    const Contexte = window.AudioContext || window.webkitAudioContext;
    if (!Contexte) return;
    audio = audio || new Contexte();
    if (audio.state === 'suspended') audio.resume();
  }

  // Un petit "bip-bip-bip" joyeux (trois notes qui montent).
  function bipBipBip() {
    if (!audio) return;
    const maintenant = audio.currentTime;
    [880, 988, 1175].forEach((frequence, i) => {
      const oscillateur = audio.createOscillator();
      const volume = audio.createGain();
      oscillateur.type = 'triangle';
      oscillateur.frequency.value = frequence;
      const debut = maintenant + i * 0.18;
      volume.gain.setValueAtTime(0.0001, debut);
      volume.gain.exponentialRampToValueAtTime(0.5, debut + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, debut + 0.16);
      oscillateur.connect(volume).connect(audio.destination);
      oscillateur.start(debut);
      oscillateur.stop(debut + 0.17);
    });
  }

  /* ---- Empêcher la mise en veille de l'écran ---------------------------- */
  /*
   * Tant qu'un minuteur tourne (ou sonne), on demande au navigateur de garder
   * l'écran allumé (API "Screen Wake Lock", comme les sites de vidéo).
   * Le navigateur relâche cette demande quand on change d'onglet ou d'appli :
   * on la redemande quand la page redevient visible.
   * Ne marche que sur une page en https:// (ou http://localhost).
   */
  const eveil = {
    demandeurs: new Set(), // les minuteurs qui veulent garder l'écran allumé
    verrou: null,

    async mettreAJour() {
      const voulu = this.demandeurs.size > 0 && document.visibilityState === 'visible';
      if (voulu && !this.verrou && 'wakeLock' in navigator) {
        try {
          this.verrou = await navigator.wakeLock.request('screen');
          this.verrou.addEventListener('release', () => (this.verrou = null));
        } catch (erreur) {
          this.verrou = null; // refusé (batterie faible, page non sécurisée…)
        }
      } else if (!voulu && this.verrou) {
        const verrou = this.verrou;
        this.verrou = null;
        verrou.release();
      }
    },

    garder(qui, actif) {
      const avant = this.demandeurs.has(qui);
      if (actif) this.demandeurs.add(qui);
      else this.demandeurs.delete(qui);
      if (avant !== actif) this.mettreAJour();
    },
  };
  document.addEventListener('visibilitychange', () => eveil.mettreAJour());

  /* ---- Outils ---------------------------------------------------------- */

  const deuxChiffres = (n) => String(n).padStart(2, '0');

  // 390 000 ms → ["06", "30"]
  function minutesSecondes(ms) {
    const total = Math.ceil(Math.max(0, ms) / 1000);
    return [deuxChiffres(Math.floor(total / 60)), deuxChiffres(total % 60)];
  }

  /* ---- Le widget ------------------------------------------------------- */

  Nidoo.declarerWidget({
    type: 'minuteur',
    nom: 'Minuteur',
    icone: '⏰',
    tailles: ['petit', 'moyen', 'grand'],
    tailleParDefaut: 'petit',
    donneesParDefaut: { duree: 0, fin: null, pause: null },

    afficher(zone, widget) {
      zone.innerHTML = `
        <div class="minuteur">
          <button class="minuteur-bouton" data-reglage="-60" aria-label="Une minute de moins">−</button>
          <button class="minuteur-bouton minuteur-petit" data-action="zero" aria-label="Remettre au temps réglé">↺</button>
          <button class="minuteur-bouton" data-reglage="-${PAS_SECONDES}" aria-label="Moins de secondes">−</button>

          <div class="minuteur-chiffres minuteur-minutes">00</div>
          <div class="minuteur-deux-points">:</div>
          <div class="minuteur-chiffres minuteur-secondes">00</div>

          <button class="minuteur-bouton" data-reglage="60" aria-label="Une minute de plus">+</button>
          <button class="minuteur-bouton minuteur-principal" data-action="principal" aria-label="Démarrer">▶</button>
          <button class="minuteur-bouton" data-reglage="${PAS_SECONDES}" aria-label="Plus de secondes">+</button>
        </div>`;

      const boite = zone.querySelector('.minuteur');
      const minutes = zone.querySelector('.minuteur-minutes');
      const secondes = zone.querySelector('.minuteur-secondes');
      const principal = zone.querySelector('.minuteur-principal');
      const reglages = zone.querySelectorAll('[data-reglage]');
      const caseWidget = zone.closest('.widget');

      let sonnerie = null;     // répétition du bip
      let finSonnerie = null;  // arrêt automatique de la sonnerie

      // Anciennes données (première version du minuteur) : on repart proprement.
      if (typeof widget.donnees.duree !== 'number') widget.enregistrer({ duree: 0, fin: null, pause: null });

      const d = () => widget.donnees;
      const tourne = () => d().fin != null && Date.now() < d().fin;
      const fini = () => d().fin != null && Date.now() >= d().fin;
      const enPause = () => d().fin == null && d().pause != null;
      const restant = () => (d().fin != null ? d().fin - Date.now() : enPause() ? d().pause : d().duree);
      const enregistrer = (changements) => widget.enregistrer({ ...d(), ...changements });

      function arreterSonnerie() {
        clearInterval(sonnerie);
        clearTimeout(finSonnerie);
        sonnerie = null;
        caseWidget?.classList.remove('sonne');
      }

      function sonner() {
        if (sonnerie) return;
        caseWidget?.classList.add('sonne');
        bipBipBip();
        sonnerie = setInterval(bipBipBip, 1000);
        finSonnerie = setTimeout(arreterSonnerie, SONNERIE_MAX_MS);
      }

      function rafraichir() {
        const [m, s] = minutesSecondes(restant());
        minutes.textContent = m;
        secondes.textContent = s;
        boite.classList.toggle('tourne', tourne());
        boite.classList.toggle('termine', fini());

        if (fini()) {
          principal.textContent = sonnerie ? '🔕' : '✓';
          principal.setAttribute('aria-label', 'Arrêter');
        } else if (tourne()) {
          principal.textContent = '⏸';
          principal.setAttribute('aria-label', 'Pause');
        } else {
          principal.textContent = '▶';
          principal.setAttribute('aria-label', 'Démarrer');
        }
        principal.disabled = !fini() && !tourne() && restant() <= 0;
        // On règle le temps seulement quand le minuteur est arrêté.
        const reglable = d().fin == null && !enPause();
        reglages.forEach((b) => (b.disabled = !reglable));

        // Écran gardé allumé tant que le minuteur tourne ou sonne.
        eveil.garder(zone, tourne() || sonnerie !== null);
      }

      // Toutes les 250 ms : affichage, et sonnerie si on vient d'arriver à zéro.
      function tic() {
        // Pas de sonnerie si la page vient d'être (re)chargée après la fin :
        // le navigateur bloquerait le son, on affiche juste 00:00.
        if (fini() && !boite.classList.contains('termine') && audio) sonner();
        rafraichir();
      }

      /* Régler le temps : un appui = un pas ; doigt appuyé = ça défile de plus en plus vite. */
      function regler(pasSecondes) {
        const total = Math.round(d().duree / 1000) + pasSecondes;
        const max = MAX_MINUTES * 60 + 59;
        enregistrer({ duree: Math.min(max, Math.max(0, total)) * 1000 });
        rafraichir();
      }

      let repetition = null;
      function arreterRepetition() {
        clearTimeout(repetition);
        repetition = null;
      }
      zone.addEventListener('pointerdown', (e) => {
        const bouton = e.target.closest('[data-reglage]');
        if (!bouton || bouton.disabled) return;
        e.preventDefault();
        const pas = Number(bouton.dataset.reglage);
        regler(pas);
        let attente = 450;
        const encore = () => {
          regler(pas);
          attente = Math.max(60, attente * 0.8);
          repetition = setTimeout(encore, attente);
        };
        repetition = setTimeout(encore, attente);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((evt) => zone.addEventListener(evt, arreterRepetition));

      zone.addEventListener('click', (e) => {
        const bouton = e.target.closest('[data-action]');
        if (!bouton) return;
        debloquerSon();

        if (bouton.dataset.action === 'zero') {
          arreterSonnerie();
          enregistrer({ fin: null, pause: null });
        } else if (fini()) {
          // Fini : on arrête la sonnerie et on remet le temps réglé.
          arreterSonnerie();
          enregistrer({ fin: null, pause: null });
        } else if (tourne()) {
          enregistrer({ fin: null, pause: restant() }); // pause
        } else if (restant() > 0) {
          enregistrer({ fin: Date.now() + restant(), pause: null }); // départ ou reprise
        }
        rafraichir();
      });

      // Au premier affichage, on ne sonne pas pour un minuteur déjà fini avant.
      if (fini()) boite.classList.add('termine');
      rafraichir();
      const minuteur = setInterval(tic, 250);

      return () => {
        clearInterval(minuteur);
        arreterRepetition();
        arreterSonnerie();
        eveil.garder(zone, false);
      };
    },
  });
})();
