import { describe, expect, it } from 'vitest';
import { projetAuFormatActuel } from './formatComposition';
import { createProject } from './model';
import type { OscarProject } from './types';
import { projetDepuisBundle, projetDepuisPreset } from '../feature-data/studioApi';

/** Un canal tel qu'il était enregistré, déjà au bon format (les canaux ne changent que par leurs codes). */
function canal(id: string, direction: 'RECEPTION' | 'EMISSION', technicalCode: string, channelType: string) {
  return { id, name: technicalCode, technicalCode, direction, channelType, dataFormat: 'OBJET_JSON', description: '' };
}

/**
 * Projet enregistré avant le 05/10/2026, quand une unité s'appelait un agent :
 * deux composants reliés, chacun avec une unité.
 */
function projetAncienFormat(): OscarProject {
  return {
    id: 'bundle-1',
    bundleId: 'bundle-1',
    name: 'Robot magasin',
    description: 'Composition historique',
    target: 'ENVIRONNEMENT_EXECUTION_ROBOT',
    status: 'BROUILLON',
    version: 2,
    updatedAt: '2026-10-01T08:00:00.000Z',
    summary: { composants: 3, agents: 2, robots: 1 },
    nodes: [
      {
        id: 'bundle_deploiement-1',
        type: 'architecture',
        position: { x: 40, y: 245 },
        data: {
          kind: 'BUNDLE_DEPLOIEMENT', name: 'Bundle', technicalCode: 'BUNDLE_DEPLOIEMENT_ROBOT_MAGASIN',
          description: '', target: 'ENVIRONNEMENT_EXECUTION_ROBOT', status: 'BROUILLON', agents: [],
        },
      },
      {
        id: 'instance_service-1',
        type: 'architecture',
        position: { x: 420, y: 40 },
        data: {
          kind: 'INSTANCE_SERVICE', name: 'Service de supervision',
          // Code saisi par une personne : le mot AGENTS y est entier, il change.
          technicalCode: 'INSTANCE_SERVICE_SUPERVISION_AGENTS',
          description: 'Texte libre qui parle d’un agent : on n’y touche pas.',
          target: 'ENVIRONNEMENT_EXECUTION_ROBOT', status: 'PRET', bringupKey: 'camera', bringupOrder: 20,
          agents: [{
            id: 'agent-1a2b3c4d',
            name: 'Agent caméra avant',
            technicalCode: 'INSTANCE_AGENT_CAMERA_AVANT',
            agentType: 'TYPE_AGENT_MEDIA_ROBOT',
            processingName: 'TRAITEMENT_METIER_AGENT_PRINCIPAL',
            interfaceName: 'INTERFACE_COMMUNICATION_AGENT_PRINCIPALE',
            dataBandName: 'BANDE_DONNEES_PRINCIPALE',
            receiveBusName: 'BUS_RECEPTION_PRINCIPAL',
            sendBusName: 'BUS_EMISSION_PRINCIPAL',
            inputs: [canal('rx-11111111', 'RECEPTION', 'CANAL_RECEPTION_REAGENT_CHIMIQUE', 'TYPE_ENTREE_ABONNEMENT_ROS_2')],
            outputs: [canal('tx-22222222', 'EMISSION', 'CANAL_EMISSION_ETAT_FLUX_VIDEO', 'TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_AGENT')],
            canPublishAudio: false,
            canPublishVideo: true,
            expanded: true,
          }],
        },
      },
      {
        id: 'instance_application-1',
        type: 'architecture',
        position: { x: 930, y: 245 },
        data: {
          kind: 'INSTANCE_APPLICATION', name: 'Télécommande web', technicalCode: 'INSTANCE_APPLICATION_TELECOMMANDE_WEB',
          description: '', target: 'ENVIRONNEMENT_EXECUTION_NAVIGATEUR_WEB', status: 'BROUILLON',
          agents: [{
            id: 'agent-5e6f7a8b',
            name: 'Commandes opérateur',
            technicalCode: 'INSTANCE_AGENT_COMMANDES_OPERATEUR',
            agentType: 'TYPE_AGENT_CONTROLEUR_DISTANT_WEB',
            processingName: 'TRAITEMENT_METIER_AGENT_PRINCIPAL',
            interfaceName: 'INTERFACE_COMMUNICATION_AGENT_PRINCIPALE',
            dataBandName: 'BANDE_DONNEES_PRINCIPALE',
            receiveBusName: 'BUS_RECEPTION_PRINCIPAL',
            sendBusName: 'BUS_EMISSION_PRINCIPAL',
            inputs: [canal('rx-33333333', 'RECEPTION', 'CANAL_RECEPTION_ETAT_FLUX_VIDEO', 'TYPE_ENTREE_ABONNEMENT_TEMPS_REEL')],
            outputs: [],
            canPublishAudio: false,
            canPublishVideo: false,
            expanded: false,
          }],
        },
      },
    ],
    edges: [{
      id: 'liaison-1',
      source: 'instance_service-1',
      sourceHandle: 'out:agent-1a2b3c4d:tx-22222222',
      target: 'instance_application-1',
      targetHandle: 'in:agent-5e6f7a8b:rx-33333333',
      type: 'smoothstep',
      data: { edgeKind: 'DONNEES' },
    }],
  } as unknown as OscarProject;
}

describe('lecture d’un projet enregistré avant le renommage « agent » -> « unité »', () => {
  it('relit les unités, leur type et les codes au nouveau format', () => {
    const projet = projetAuFormatActuel(projetAncienFormat());
    const [, service, application] = projet.nodes;
    const camera = service?.data.units[0];

    expect(camera).toMatchObject({
      technicalCode: 'INSTANCE_UNITE_CAMERA_AVANT',
      unitType: 'TYPE_UNITE_MEDIA_ROBOT',
      processingName: 'TRAITEMENT_METIER_UNITE_PRINCIPAL',
      interfaceName: 'INTERFACE_COMMUNICATION_UNITE_PRINCIPALE',
      dataBandName: 'BANDE_DONNEES_PRINCIPALE',
      canPublishVideo: true,
    });
    expect(camera?.outputs[0]?.channelType).toBe('TYPE_SORTIE_PUBLICATION_TEMPS_REEL_CANAL_UNITE');
    expect(application?.data.units[0]).toMatchObject({
      technicalCode: 'INSTANCE_UNITE_COMMANDES_OPERATEUR',
      unitType: 'TYPE_UNITE_CONTROLEUR_DISTANT_WEB',
    });
    expect(service?.data.technicalCode).toBe('INSTANCE_SERVICE_SUPERVISION_UNITES');
    expect(projet.nodes[0]?.data.units).toEqual([]);
    expect(projet.summary).toEqual({ composants: 3, units: 2, robots: 1 });

    // Plus aucune trace de l'ancien format : ni clé, ni code.
    const texte = JSON.stringify(projet);
    expect(texte).not.toMatch(/"agents"|"agentType"/);
    expect(texte).not.toMatch(/(^|[^A-Z])AGENTS?(_|")/);
  });

  it('garde les identifiants, les liaisons, les noms et les descriptions', () => {
    const ancien = projetAncienFormat();
    const projet = projetAuFormatActuel(ancien);
    const service = projet.nodes[1];
    const camera = service?.data.units[0];

    expect(camera?.id).toBe('agent-1a2b3c4d');
    expect(camera?.inputs[0]?.id).toBe('rx-11111111');
    expect(camera?.name).toBe('Agent caméra avant');
    expect(service?.data.description).toBe('Texte libre qui parle d’un agent : on n’y touche pas.');
    expect(service?.data).toMatchObject({ bringupKey: 'camera', bringupOrder: 20, status: 'PRET' });
    expect(projet.edges).toEqual(ancien.edges);
    expect(projet.nodes.map((noeud) => noeud.position)).toEqual(ancien.nodes.map((noeud) => noeud.position));
  });

  it('ne change le mot AGENT que lorsqu’il est entier dans le code', () => {
    const camera = projetAuFormatActuel(projetAncienFormat()).nodes[1]?.data.units[0];
    expect(camera?.inputs[0]?.technicalCode).toBe('CANAL_RECEPTION_REAGENT_CHIMIQUE');
  });

  it('laisse identique un projet déjà au nouveau format', () => {
    const demonstration = createProject('Démonstration', '', 'ENVIRONNEMENT_EXECUTION_ROBOT', 'DEMONSTRATION');
    expect(projetAuFormatActuel(demonstration)).toEqual(demonstration);

    const converti = projetAuFormatActuel(projetAncienFormat());
    expect(projetAuFormatActuel(converti)).toEqual(converti);
  });

  it('ne touche pas aux codes d’une composition déjà au nouveau format', () => {
    // Depuis le renommage, AGENT dans un code parle d'intelligence artificielle.
    const projet = createProject('Vision', '', 'ENVIRONNEMENT_EXECUTION_ROBOT', 'ROBOT_MINIMAL');
    const service = projet.nodes[1]!;
    service.data.technicalCode = 'INSTANCE_SERVICE_AGENT_IA';
    service.data.units[0]!.technicalCode = 'INSTANCE_UNITE_AGENT_CONVERSATIONNEL';

    const relu = projetAuFormatActuel(projet);
    expect(relu.nodes[1]?.data.technicalCode).toBe('INSTANCE_SERVICE_AGENT_IA');
    expect(relu.nodes[1]?.data.units[0]?.technicalCode).toBe('INSTANCE_UNITE_AGENT_CONVERSATIONNEL');
    expect(relu).toEqual(projet);
  });

  it('préfère le nouveau nom quand les deux sont présents', () => {
    const projet = projetAncienFormat();
    const donnees = projet.nodes[1]!.data as unknown as Record<string, unknown>;
    const unite = { ...(donnees.agents as Record<string, unknown>[])[0], unitType: 'TYPE_UNITE_STANDARD' };
    donnees.units = [unite];
    donnees.agents = [];

    const converti = projetAuFormatActuel(projet);
    expect(converti.nodes[1]?.data.units).toHaveLength(1);
    expect(converti.nodes[1]?.data.units[0]?.unitType).toBe('TYPE_UNITE_STANDARD');
    expect(converti.nodes[1]?.data.units[0]).not.toHaveProperty('agentType');
  });

  it('laisse telles quelles les formes inattendues sans s’arrêter', () => {
    const { summary: _sansResume, ...ancien } = projetAncienFormat();
    const projet = {
      ...ancien,
      nodes: [
        { id: 'sans-donnees' },
        { id: 'liste-abimee', data: { kind: 'INSTANCE_SERVICE', agents: 'pas une liste' } },
        { id: 'unite-abimee', data: { kind: 'INSTANCE_SERVICE', agents: [null, 'texte'] } },
      ],
    } as unknown as OscarProject;

    const converti = projetAuFormatActuel(projet);
    expect(converti.nodes[0]).toEqual({ id: 'sans-donnees' });
    // La liste change de nom, mais son contenu abîmé n'est pas réparé ici.
    expect(converti.nodes[1]?.data).toEqual({ kind: 'INSTANCE_SERVICE', units: 'pas une liste' });
    expect(converti.nodes[2]?.data.units).toEqual([null, 'texte']);
    expect(converti.summary).toBeUndefined();
  });

  it('s’applique à ce que servent le serveur et le catalogue de présets', () => {
    const { nodes, edges } = projetAncienFormat();
    const versionServeur = {
      id: 'version-1', bundle_id: 'bundle-1', numero: 2, statut: 'draft', spec: { nodes, edges },
    };
    const bundle = {
      id: 'bundle-1', org_id: 'org-1', nom: 'Robot magasin', slug: 'robot-magasin', target: 'ENVIRONNEMENT_EXECUTION_ROBOT',
      statut: 'active', draft_version: versionServeur, published_version: null,
      version_count: 1, robot_count: 0, component_count: 3, unit_count: 2,
    };
    const preset = {
      id: 'preset-1', slug: 'robot-magasin', nom: 'Robot magasin', famille: 'oscar-m3', spec: { nodes, edges },
      statut: 'published', ordre: 1, revision: 1,
    };

    for (const projet of [
      projetDepuisBundle(bundle, versionServeur),
      projetDepuisPreset(preset, 'Nouveau', '', 'ENVIRONNEMENT_EXECUTION_ROBOT'),
    ]) {
      expect(projet.nodes[1]?.data.units[0]?.unitType).toBe('TYPE_UNITE_MEDIA_ROBOT');
      expect(JSON.stringify(projet)).not.toMatch(/"agents"|"agentType"/);
    }
  });
});
