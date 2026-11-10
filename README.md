# Nidoo
Aide familiale

Une grille de widgets, comme l'écran d'accueil d'un iPad.
Code simple en HTML, CSS, JavaScript (et un peu de PHP), sans rien à installer.

## Lancer Nidoo

**Sans PHP** : ouvrir `index.html` dans le navigateur (double-clic).

**Avec PHP** (nécessaire pour `api.php`) : dans le dossier du projet, lancer

```
php -S localhost:8000
```

puis ouvrir http://localhost:8000

## Utilisation

- **Modifier** (ou appui long sur la grille) : les widgets tremblent.
  - glisser un widget pour le déplacer ;
  - **×** pour le supprimer ;
  - **⤢** pour changer sa taille (petit → moyen → grand) ;
  - **🎨** pour changer sa couleur ;
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
js/app.js          la grille, le mode Modifier, le glisser-déposer
widgets/           un fichier par widget
api.php            l'API côté serveur (pour plus tard : Google Agenda…)
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
