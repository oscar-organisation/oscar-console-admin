# oscar-console-admin

L outil de travail du client, auto-hebergeable.

**Dépôt GitHub prévu :** `oscar-organisation/oscar-console-admin`. Pas encore créé.

L'arborescence ci-dessous est relevée sur l'image du schéma directeur,
pas sur l'ordre du texte. L'imbrication compte : un dossier de build
contient son SDK, un environnement contient ses services.

```
oscar-console-admin
├── oscar_console_admin_frontend
│   ├── Espace_mon_entreprise
│   ├── Espace_console_admin
│   ├── Espace_teleoperation_2D
│   ├── Espace_teleoperation_immersive_casque_xr_vr
│   └── Espace_oscar_studio
├── oscar_console_admin_api_backend
├── oscar_console_admin_core_iam
└── oscar_sample_app_and_services
    ├── oscar_sample_env_remote
    │   └── oscar_sample_app_teleoperation
    ├── oscar_sample_env_server
    │   ├── oscar_sample_service_detection_ia_server
    │   └── oscar_sample_service_stream_server
    ├── oscar_sample_env_robot
    │   ├── oscar_sample_service_local_detection_ia_robot
    │   ├── oscar_sample_service_commande
    │   ├── oscar_sample_service_telemetrie
    │   ├── oscar_sample_service_sensor
    │   └── oscar_sample_service_state_robot
    └── oscar_sample_config
```

## Nommage

Le nom du dépôt s'écrit avec des **tirets**, décision 34. Les dossiers
à l'intérieur gardent les **tirets bas** : ce sont des paquets.
