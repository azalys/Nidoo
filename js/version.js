/*
 * Version de Nidoo et mise à jour automatique.
 *
 * deploy.sh écrit la version dans version.txt sur le serveur. Ce fichier :
 *   - l'affiche dans "⚙️ Appareil" (pour comparer les appareils entre eux) ;
 *   - vérifie toutes les 10 minutes si une nouvelle version a été déployée, et
 *     recharge alors la page (pas pendant le mode Modifier ni une fenêtre ouverte).
 * En local (php -S, sans version.txt), rien ne se passe.
 */
(function () {
  const VERIFIER_MS = 10 * 60 * 1000;
  const zone = document.getElementById('version-appareil');
  let versionChargee = null;

  async function lireVersion() {
    try {
      const reponse = await fetch('version.txt', { cache: 'no-store' });
      if (!reponse.ok) return null;
      return (await reponse.text()).trim() || null;
    } catch (e) {
      return null;
    }
  }

  // On ne recharge pas pendant qu'on modifie la grille ou qu'une fenêtre est ouverte.
  const occupe = () => document.body.classList.contains('edition') || !!document.querySelector('dialog[open]');

  async function verifier() {
    const version = await lireVersion();
    if (!version) return;
    if (!versionChargee) {
      versionChargee = version;
      zone.textContent = 'Version ' + version;
      return;
    }
    if (version !== versionChargee) {
      if (occupe()) return; // on réessaiera au prochain passage
      location.reload();
    }
  }

  verifier();
  setInterval(verifier, VERIFIER_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && verifier());
})();
