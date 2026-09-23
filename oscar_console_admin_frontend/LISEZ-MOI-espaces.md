# Les espaces de la console admin

**Ce ne sont pas des dossiers.** Ce sont les espaces applicatifs que cette
application frontend porte, et ils vivent dans son code, pas dans l'arborescence
du dépôt.

Une première version de cette structure les avait créés comme cinq dossiers
vides. C'était une erreur de lecture du schéma directeur, corrigée le
23/09/2026.

## Les cinq espaces

| Espace | Ce que l'utilisateur y fait |
|---|---|
| `Espace_mon_entreprise` | une porte, sans écran à lui, vers le Portail Client Entreprise de la plateforme |
| `Espace_console_admin` | le travail courant : compte et installation, organisation et IAM, projets robotiques et flottes, IA sandbox, supervision et audit, détection et tickets |
| `Espace_teleoperation_2D` | piloter un robot depuis un écran ordinaire |
| `Espace_teleoperation_immersive_casque_xr_vr` | piloter un robot en casque |
| `Espace_oscar_studio` | le studio |

## Pourquoi ça compte

**Décision 2 de Joel, elle ne se rediscute pas :** Studio et Téléopération sont
des **espaces** de cette application, pas des applications séparées.

La conséquence est pratique et lourde : **un client n'a besoin que d'un seul
sous-domaine**. C'est ce qui rend le plan de nommage simple, `console-<client>`
et rien d'autre, et c'est ce qui permet au wildcard `*.oscar-bot.com` de couvrir
tout nouveau client sans aucune écriture DNS.

Si les espaces étaient des applications, il faudrait un nom, un certificat et un
déploiement par espace et par client.

## Le niveau Module

Sous l'espace console admin, le niveau **Module** est conservé. Décision 3.
