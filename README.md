# Nidoo
Aide familiale

Une grille de widgets, comme l'écran d'accueil d'un iPad.
Code simple en HTML, CSS, JavaScript (et un peu de PHP), sans rien à installer.

## Lancer Nidoo

Dans le dossier du projet, lancer

```
php -S localhost:8000
```

puis ouvrir http://localhost:8000

(Un double-clic sur `index.html` marche aussi, mais sans PHP les agendas ne peuvent pas se charger.)

## Mettre en ligne

Depuis un ordinateur qui a accès SSH au serveur :

```
./deploy.sh --test    # montre ce qui serait envoyé, sans rien changer
./deploy.sh           # récupère la dernière version (git pull) puis l'envoie
./deploy.sh --sans-pull   # envoie les fichiers tels qu'ils sont, sans git pull
```

Réglages personnels : copier `deploy.local.exemple` en `deploy.local` et le remplir
(adresse du serveur, et mot de passe si on n'utilise pas de clé SSH).
`deploy.local` n'est jamais commité.
Le serveur doit avoir PHP 8 ou plus.
Attention : les fichiers retirés du projet sont aussi supprimés sur le serveur.
Le script ajoute un numéro de version aux fichiers CSS et JS (dans la copie envoyée),
pour que les navigateurs et la webapp chargent bien la nouvelle version, puis vérifie
que le serveur l'a reçue (fichier `version.txt`).

## Les widgets

| Widget | Tailles | Source des données |
|---|---|---|
| 🌤️ Météo | petit : aujourd'hui · moyen : aujourd'hui + demain ; toucher un jour = graphique de 7 h à 21 h (température, risque de pluie, temps heure par heure) | [Open-Meteo](https://open-meteo.com), gratuit, sans clé |
| ⚡ Tempo EDF | petit : couleur du moment · moyen : aujourd'hui + demain | [api-couleur-tempo.fr](https://www.api-couleur-tempo.fr), gratuit, sans clé |
| 📝 Liste | 1×2, 2×2 | titre et emoji réglables (🛒 Courses, 📝 À faire, 🧳 Valise…), remplace l'ancien widget Courses ; cocher retire l'élément ; toucher le texte pour dire qui et pour quand (date en rouge si dépassée) |
| ✅ Routine | grand | matin avant midi, soir après midi ; étapes réglables avec ⚙️ ; un emoji par étape (deviné, ou mis en début de ligne) |
| 📅 Agenda | grand | adresse iCal de l'agenda, lue par `api.php` ; exemples tant qu'elle n'est pas réglée |
| ⏰ Minuteur | 1×1, 1×2, 2×2 | minuteur de cuisine : + / − pour les minutes et les secondes, ▶/⏸, ↺ ; sonne à la fin ; empêche la mise en veille tant qu'il tourne (page en https uniquement) |
| 🧹 Corvées | petit | qui s'en occupe aujourd'hui (et demain) ; rotation jours pairs/impairs, chaque jour ou chaque semaine (⚙️) |
| ⏳ Compte à rebours | 1×1 | « Vacances dans 12 jours » ; date, emoji, une fois ou chaque année, jours ou dodos (⚙️) |
| 🗑️ Poubelles | 1×1 | « Ce soir : sortir la jaune » ; jours de ramassage et semaines paires/impaires pour chaque poubelle (⚙️) |
| 🕒 Horloge, 📝 Note | petit, moyen, grand | — |

### Brancher un agenda Google

1. Sur un ordinateur, ouvrir Google Agenda → ⚙️ Paramètres.
2. À gauche, cliquer sur l'agenda voulu → « Intégrer l'agenda ».
3. Copier l'« Adresse secrète au format iCal ».
4. Dans Nidoo : Modifier → ⚙️ sur le widget Agenda → coller l'adresse.

Cette adresse donne accès à l'agenda : ne pas la partager.
Les sites d'agendas acceptés sont listés en haut de `api.php`.

## Utilisation

- **Modifier** (ou appui long sur la grille) : les widgets tremblent.
  - glisser un widget sur n'importe quelle case (les cases libres sont en pointillés) ;
    sur un widget de même taille, les deux échangent leur place ;
  - **×** pour le supprimer ;
  - **🎨** pour changer sa couleur ;
  - **⚙️** pour ses réglages : taille (1×1, 1×2 ou 2×2 selon le widget), ville,
    étapes de la routine, adresse de l'agenda… ;
  - **+ Ajouter** pour ajouter un widget.
- **Terminé** pour revenir à l'affichage normal.

Les données sont enregistrées dans le navigateur (`localStorage`) :
elles restent sur cet appareil uniquement.

## Organisation des fichiers

```
index.html         la page (liste des fichiers JS à charger)
css/style.css      tous les styles (couleurs et tailles réglables en haut)
js/stockage.js     lecture / enregistrement dans le localStorage
js/widgets.js      le catalogue des widgets, les tailles et les couleurs
js/depart.js       les widgets installés au premier lancement
js/placement.js    calcul de la position des widgets (sans chevauchement)
js/app.js          la grille, le mode Modifier, le glisser-déposer, les réglages
widgets/           un fichier par widget
api.php            l'API côté serveur (lecture des agendas iCal)
```

## Créer un nouveau widget

1. Copier `widgets/note.js` en `widgets/mon-widget.js`.
2. Changer `type`, `nom`, `icone`, et le contenu de `afficher()`.
3. Ajouter dans `index.html`, avec les autres widgets :
   ```html
   <script src="widgets/mon-widget.js"></script>
   ```
4. (Facultatif) Ajouter ses styles à la fin de `css/style.css`.

Le widget apparaît alors dans la fenêtre « + Ajouter ».
Pour lui donner des réglages (bouton ⚙️), voir `reglages` dans `js/widgets.js`
et l'exemple de `widgets/routine.js`.

## Taille de l'écran

La grille a une taille fixe et remplit tout l'écran :
8 colonnes × 4 lignes à l'horizontale, 4 × 8 à la verticale
(réglables en haut de `css/style.css`). Sur un téléphone : 2 colonnes, on fait défiler.
Les positions sont enregistrées par appareil. En passant à la verticale, les widgets
qui ne tiennent plus vont à la première place libre.
