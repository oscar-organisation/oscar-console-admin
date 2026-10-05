# Le cockpit XR

**Le cockpit XR est l'écran de pilotage d'un robot, sur ordinateur ou en
casque de réalité virtuelle.** Il est servi par la console elle-même, sous
`/xr/`: la console ouvre cette adresse avec, après le signe `#`, l'adresse
de LiveKit, la salle et un jeton de session que l'API vient de fabriquer
(`src/lib/cockpitLink.js`). Le cockpit n'embarque aucun jeton: il le reçoit à
chaque ouverture.

## D'où il vient

Son code est dans un autre dépôt, `oscar-organisation/oscar_front_casque_vr_ar`.
La console en embarque une construction toute faite, dans `public/xr/`, que
Vite recopie sous `/xr/` au moment de construire l'image. Le fichier
`public/xr/.source-revision` dit de quel dépôt et de quel commit elle vient.

| | |
|---|---|
| Révision embarquée | `ee02b6e88a66cede1eda545da6c8862fb3507fa1` (« cockpit : une sortie, depuis l'écran comme depuis le casque », 29/09/2026) |
| Reconstruite le | 04/10/2026, en conteneur, par `scripts/update-xr-bundle.sh` |
| Différence avec la construction d'avant | aucune, sauf trois réglages retirés: l'ancienne construction, faite sur un poste, avait recopié dans le JavaScript une adresse LiveKit, une salle et un jeton de session (expiré). La feuille de style et la page sont identiques; le JavaScript ne diffère que par ces trois valeurs |

## Le reconstruire

Quand le dépôt du cockpit change, on reconstruit la copie embarquée, puis on la
propose par une PR comme tout autre changement. Il faut Docker et git, et un
clone du dépôt du cockpit. Depuis ce dossier:

```bash
./scripts/update-xr-bundle.sh <dossier du clone de oscar_front_casque_vr_ar> [révision]
```

La révision vaut `HEAD` par défaut. Le script:

1. prend les fichiers suivis par git à cette révision (`git archive`): un
   fichier `.env` du poste, qui pourrait porter un jeton, n'y entre jamais;
2. les construit dans un conteneur jetable, avec la même image de Node que la
   console (lue dans le `Dockerfile`), sans aucune variable d'environnement, et
   avec la base `/xr/`;
3. refuse le résultat s'il contient une chaîne qui ressemble à un jeton signé;
4. remplace le contenu de `public/xr/` et écrit `.source-revision`.

Deux constructions de la même révision donnent les mêmes fichiers, octet pour
octet (mesuré le 04/10/2026).

## Comment nginx le sert

Les règles sont dans `nginx-spa.conf`:

- `/xr` renvoie vers `/xr/` par une adresse relative (`absolute_redirect off`):
  derrière le proxy, une adresse complète aurait visé le port interne du
  conteneur, `http://<hôte>:3000/xr/`, injoignable;
- `/xr/index.html` part avec `Cache-Control: no-cache`, pour qu'un navigateur
  ne garde pas un ancien cockpit après une mise en ligne;
- les fichiers de `/xr/assets/`, dont le nom porte l'empreinte du contenu, se
  gardent un an;
- toute autre adresse sous `/xr/` retombe sur le cockpit, jamais sur la page
  d'accueil de la console.
