# oscar-console-admin

L outil de travail du client, auto-hebergeable.

**Dépôt GitHub :** `oscar-organisation/oscar-console-admin`.

L'arborescence ci-dessous est relevée sur l'image du schéma directeur,
pas sur l'ordre du texte. L'imbrication compte : un dossier de build
contient son SDK, un environnement contient ses services.

```
oscar-console-admin
├── oscar_console_admin_frontend          l application web, et ses cinq espaces
├── oscar_console_admin_api_backend       l API
├── oscar_console_admin_core_iam          la configuration Keycloak
├── oscar_console_admin_scripts           les scripts d exploitation
└── oscar_sample_app_and_services         les exemples pour les integrateurs
      ├── oscar_sample_env_remote
      ├── oscar_sample_env_server
      ├── oscar_sample_env_robot
      └── oscar_sample_config
```

**Les cinq Espaces ne sont pas des dossiers.** Ce sont les espaces applicatifs
portés par le code du frontend. Ils avaient été créés comme dossiers vides par
erreur de lecture du schéma, et sont décrits dans
`oscar_console_admin_frontend/LISEZ-MOI-espaces.md`. Décision 50.

## Nommage

Le nom du dépôt s'écrit avec des **tirets**, décision 34. Les dossiers
à l'intérieur gardent les **tirets bas** : ce sont des paquets.
