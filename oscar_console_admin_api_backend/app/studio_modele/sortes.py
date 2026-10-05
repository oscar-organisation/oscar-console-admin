"""Les sortes d'éléments d'un bundle au nouveau format.

Une sorte dit ce qu'est un élément : une zone, un service, un canal... Les
codes sont ceux de la spécification, écrits tels quels. Ce fichier est le seul
endroit où ils sont écrits côté serveur ; le catalogue, le format et les règles
les prennent ici.
"""

# Le bundle lui-même. Il n'est pas un élément de la liste : c'est le cadre qui
# les contient. Un élément dont le parent est null est son enfant direct.
BUNDLE_DEPLOIEMENT = "BUNDLE_DEPLOIEMENT"

ZONE = "ZONE_ENVIRONNEMENT_EXECUTION"
SALLE = "COMPOSANT_SALLE_TEMPS_REEL"
SERVICE = "INSTANCE_SERVICE_CONFIGUREE"
APPLICATION = "INSTANCE_APPLICATION_CONFIGUREE"
UNITE = "INSTANCE_UNITE_CONFIGUREE"
TRAITEMENT = "TRAITEMENT_METIER_UNITE"
INTERFACE = "INTERFACE_COMMUNICATION_UNITE"
BANDE = "BANDE_DONNEES"
BUS_RECEPTION = "BUS_RECEPTION"
BUS_EMISSION = "BUS_EMISSION"
CANAL_RECEPTION = "CANAL_RECEPTION"
CANAL_EMISSION = "CANAL_EMISSION"

SORTES = (
    ZONE, SALLE, SERVICE, APPLICATION, UNITE, TRAITEMENT, INTERFACE,
    BANDE, BUS_RECEPTION, BUS_EMISSION, CANAL_RECEPTION, CANAL_EMISSION,
)
